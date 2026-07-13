from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditLog, AssetInstance, Location, Product, StockBalance, StockMovement, StockMovementLine
from .schemas import MovementCreate


def document_no(prefix: str) -> str:
    return f"{prefix}-{datetime.now(timezone.utc):%Y%m%d}-{uuid4().hex[:8].upper()}"


def _product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if not product or not product.active:
        raise HTTPException(404, f"Ürün bulunamadı: {product_id}")
    return product


def _location(db: Session, location_id: int | None) -> Location:
    if location_id is None:
        raise HTTPException(422, "Bu işlem için lokasyon zorunlu")
    location = db.get(Location, location_id)
    if not location or not location.active:
        raise HTTPException(404, f"Lokasyon bulunamadı: {location_id}")
    return location


def _balance(db: Session, product_id: int, location_id: int, lot_no: str | None) -> StockBalance:
    stmt = select(StockBalance).where(
        StockBalance.product_id == product_id,
        StockBalance.location_id == location_id,
        StockBalance.lot_no.is_(None) if lot_no is None else StockBalance.lot_no == lot_no,
    )
    balance = db.scalar(stmt)
    if not balance:
        balance = StockBalance(product_id=product_id, location_id=location_id, lot_no=lot_no, quantity=Decimal("0"))
        db.add(balance)
        db.flush()
    return balance


def _validate_line(db: Session, line, product: Product) -> None:
    if product.track_serial and not line.serial_no:
        raise HTTPException(422, f"{product.sku} için seri numarası zorunlu")
    if product.track_lot and not line.lot_no:
        raise HTTPException(422, f"{product.sku} için lot numarası zorunlu")
    if line.serial_no and line.quantity != 1:
        raise HTTPException(422, f"Serili ürünlerde miktar 1 olmalı: {product.sku}")


def apply_movement(db: Session, payload: MovementCreate | dict, actor_id: int | None = None) -> StockMovement:
    if isinstance(payload, dict):
        payload = MovementCreate.model_validate(payload)
    source = _location(db, payload.source_location_id) if payload.source_location_id else None
    destination = _location(db, payload.destination_location_id) if payload.destination_location_id else None
    if payload.movement_type in {"ISSUE", "TRANSFER", "TRANSFER_OUT", "CUSTOMER_DISPATCH", "DAMAGE", "SCRAP"} and source is None:
        raise HTTPException(422, "Çıkış işlemi için kaynak lokasyon zorunlu")
    if payload.movement_type in {"RECEIPT", "RETURN", "TRANSFER", "TRANSFER_IN", "ADJUSTMENT"} and destination is None:
        raise HTTPException(422, "Giriş işlemi için hedef lokasyon zorunlu")

    movement = StockMovement(
        movement_no=document_no("STK"), movement_type=payload.movement_type,
        source_location_id=source.id if source else None,
        destination_location_id=destination.id if destination else None,
        reference_type=payload.reference_type, reference_id=payload.reference_id,
        reason=payload.reason, created_by=actor_id,
    )
    db.add(movement)
    for line in payload.lines:
        product = _product(db, line.product_id)
        _validate_line(db, line, product)
        if source:
            balance = _balance(db, product.id, source.id, line.lot_no)
            if balance.quantity < line.quantity:
                raise HTTPException(409, f"Yetersiz stok: {product.sku} ({balance.quantity} mevcut)")
            balance.quantity -= line.quantity
        if destination:
            _balance(db, product.id, destination.id, line.lot_no).quantity += line.quantity
        movement.lines.append(StockMovementLine(product_id=product.id, quantity=line.quantity, lot_no=line.lot_no, serial_no=line.serial_no))
        if line.serial_no:
            asset_stmt = select(AssetInstance).where(AssetInstance.product_id == product.id, AssetInstance.serial_no == line.serial_no)
            asset = db.scalar(asset_stmt)
            if payload.movement_type in {"RECEIPT", "RETURN", "TRANSFER", "TRANSFER_IN", "ADJUSTMENT"}:
                if not asset:
                    asset = AssetInstance(product_id=product.id, serial_no=line.serial_no, lot_no=line.lot_no)
                    db.add(asset)
                asset.status = "IN_STOCK"
                asset.location_id = destination.id if destination else source.id
                asset.customer_name = None
            elif asset:
                asset.status = "OUT"
                asset.location_id = None
    db.add(AuditLog(action="STOCK_MOVEMENT_POSTED", entity_type="stock_movement", entity_id=movement.id, payload={"movement_no": movement.movement_no}, actor_id=actor_id))
    db.flush()
    return movement
