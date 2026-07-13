from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Location, Product, StockBalance, StockMovement, Warehouse
from ..schemas import MovementCreate, MovementOut, StockRow
from ..services import apply_movement

router = APIRouter(prefix="/stock", tags=["stock"])


@router.post("/movements", response_model=MovementOut, status_code=201)
def post_movement(payload: MovementCreate, db: Session = Depends(get_db)):
    movement = apply_movement(db, payload)
    db.commit()
    db.refresh(movement)
    return movement


@router.get("/balances", response_model=list[StockRow])
def balances(warehouse_id: int | None = None, product_id: int | None = None, db: Session = Depends(get_db)):
    stmt = (
        select(StockBalance, Product, Location, Warehouse)
        .join(Product, Product.id == StockBalance.product_id)
        .join(Location, Location.id == StockBalance.location_id)
        .join(Warehouse, Warehouse.id == Location.warehouse_id)
        .where(StockBalance.quantity != Decimal("0"))
        .order_by(Product.sku, Warehouse.code, Location.code)
    )
    if warehouse_id:
        stmt = stmt.where(Warehouse.id == warehouse_id)
    if product_id:
        stmt = stmt.where(Product.id == product_id)
    return [StockRow(product_id=b.product_id, sku=p.sku, product_name=p.name, location_id=l.id, location_code=l.code, warehouse_id=w.id, warehouse_code=w.code, lot_no=b.lot_no, quantity=b.quantity) for b, p, l, w in db.execute(stmt).all()]


@router.get("/movements", response_model=list[MovementOut])
def movement_history(movement_type: str | None = None, limit: int = 100, db: Session = Depends(get_db)):
    if limit < 1 or limit > 500:
        raise HTTPException(422, "limit 1 ile 500 arasında olmalı")
    stmt = select(StockMovement).order_by(StockMovement.occurred_at.desc()).limit(limit)
    if movement_type:
        stmt = stmt.where(StockMovement.movement_type == movement_type.upper())
    return list(db.scalars(stmt).all())

