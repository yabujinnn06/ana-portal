from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CountLine, CountSession, DispatchLine, DispatchOrder, Location, Product, StockBalance, TransferLine, TransferOrder, Warehouse
from ..schemas import CountCreate, CountOut, DispatchCreate, DispatchOut, TransferCreate, TransferOut
from ..services import apply_movement, document_no

router = APIRouter(prefix="/operations", tags=["operations"])


@router.post("/transfers", response_model=TransferOut, status_code=201)
def create_transfer(payload: TransferCreate, db: Session = Depends(get_db)):
    if not db.get(Warehouse, payload.source_warehouse_id) or not db.get(Warehouse, payload.destination_warehouse_id):
        raise HTTPException(404, "Kaynak veya hedef depo bulunamadı")
    transfer = TransferOrder(transfer_no=document_no("TRF"), source_warehouse_id=payload.source_warehouse_id, destination_warehouse_id=payload.destination_warehouse_id, notes=payload.notes)
    db.add(transfer)
    for line in payload.lines:
        source = db.get(Location, line.source_location_id)
        destination = db.get(Location, line.destination_location_id)
        if not source or not destination or source.warehouse_id != payload.source_warehouse_id or destination.warehouse_id != payload.destination_warehouse_id:
            raise HTTPException(422, "Transfer satırındaki lokasyonlar depo seçimiyle eşleşmiyor")
        transfer.lines.append(TransferLine(**line.model_dump()))
    db.commit()
    db.refresh(transfer)
    return transfer


@router.post("/transfers/{transfer_id}/dispatch", response_model=TransferOut)
def dispatch_transfer(transfer_id: int, db: Session = Depends(get_db)):
    transfer = db.get(TransferOrder, transfer_id)
    if not transfer:
        raise HTTPException(404, "Transfer bulunamadı")
    if transfer.status != "DRAFT":
        raise HTTPException(409, "Transfer yalnızca taslak durumundayken çıkabilir")
    for line in transfer.lines:
        apply_movement(db, {
            "movement_type": "TRANSFER_OUT", "source_location_id": line.source_location_id,
            "lines": [{"product_id": line.product_id, "quantity": line.quantity, "lot_no": line.lot_no, "serial_no": line.serial_no}],
            "reference_type": "TRANSFER", "reference_id": transfer.id, "reason": transfer.transfer_no,
        })
    transfer.status = "IN_TRANSIT"
    transfer.dispatched_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(transfer)
    return transfer


@router.post("/transfers/{transfer_id}/receive", response_model=TransferOut)
def receive_transfer(transfer_id: int, db: Session = Depends(get_db)):
    transfer = db.get(TransferOrder, transfer_id)
    if not transfer:
        raise HTTPException(404, "Transfer bulunamadı")
    if transfer.status != "IN_TRANSIT":
        raise HTTPException(409, "Transfer teslim alınabilir durumda değil")
    for line in transfer.lines:
        apply_movement(db, {
            "movement_type": "TRANSFER_IN", "destination_location_id": line.destination_location_id,
            "lines": [{"product_id": line.product_id, "quantity": line.quantity, "lot_no": line.lot_no, "serial_no": line.serial_no}],
            "reference_type": "TRANSFER", "reference_id": transfer.id, "reason": transfer.transfer_no,
        })
    transfer.status = "RECEIVED"
    transfer.received_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(transfer)
    return transfer


@router.post("/dispatches", response_model=DispatchOut, status_code=201)
def create_dispatch(payload: DispatchCreate, db: Session = Depends(get_db)):
    if not db.get(Location, payload.source_location_id):
        raise HTTPException(404, "Çıkış lokasyonu bulunamadı")
    dispatch = DispatchOrder(dispatch_no=document_no("SEVK"), **payload.model_dump(exclude={"lines"}))
    db.add(dispatch)
    for line in payload.lines:
        dispatch.lines.append(DispatchLine(**line.model_dump()))
    db.commit()
    db.refresh(dispatch)
    return dispatch


@router.post("/dispatches/{dispatch_id}/ship", response_model=DispatchOut)
def ship_dispatch(dispatch_id: int, db: Session = Depends(get_db)):
    dispatch = db.get(DispatchOrder, dispatch_id)
    if not dispatch:
        raise HTTPException(404, "Sevk kaydı bulunamadı")
    if dispatch.status != "DRAFT":
        raise HTTPException(409, "Sevk yalnızca taslak durumundayken çıkabilir")
    for line in dispatch.lines:
        apply_movement(db, {
            "movement_type": "CUSTOMER_DISPATCH", "source_location_id": dispatch.source_location_id,
            "lines": [{"product_id": line.product_id, "quantity": line.quantity, "lot_no": line.lot_no, "serial_no": line.serial_no}],
            "reference_type": "DISPATCH", "reference_id": dispatch.id, "reason": dispatch.customer_name,
        })
    dispatch.status = "SHIPPED"
    dispatch.shipped_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(dispatch)
    return dispatch


@router.post("/dispatches/{dispatch_id}/deliver", response_model=DispatchOut)
def deliver_dispatch(dispatch_id: int, db: Session = Depends(get_db)):
    dispatch = db.get(DispatchOrder, dispatch_id)
    if not dispatch:
        raise HTTPException(404, "Sevk kaydı bulunamadı")
    if dispatch.status != "SHIPPED":
        raise HTTPException(409, "Sevk teslim edilebilir durumda değil")
    dispatch.status = "DELIVERED"
    dispatch.delivered_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(dispatch)
    return dispatch


@router.post("/counts", response_model=CountOut, status_code=201)
def create_count(payload: CountCreate, db: Session = Depends(get_db)):
    if not db.get(Warehouse, payload.warehouse_id):
        raise HTTPException(404, "Depo bulunamadı")
    count = CountSession(count_no=document_no("SAY"), warehouse_id=payload.warehouse_id)
    db.add(count)
    for line in payload.lines:
        location = db.get(Location, line.location_id)
        if not location or location.warehouse_id != payload.warehouse_id:
            raise HTTPException(422, "Sayım satırındaki lokasyon depo ile eşleşmiyor")
        balance = db.scalar(select(StockBalance).where(StockBalance.product_id == line.product_id, StockBalance.location_id == line.location_id, StockBalance.lot_no.is_(None) if line.lot_no is None else StockBalance.lot_no == line.lot_no))
        expected = balance.quantity if balance else 0
        count.lines.append(CountLine(product_id=line.product_id, location_id=line.location_id, lot_no=line.lot_no, expected_quantity=expected, counted_quantity=line.counted_quantity, difference=line.counted_quantity - expected))
    db.commit()
    db.refresh(count)
    return count


@router.post("/counts/{count_id}/close", response_model=CountOut)
def close_count(count_id: int, db: Session = Depends(get_db)):
    count = db.get(CountSession, count_id)
    if not count:
        raise HTTPException(404, "Sayım bulunamadı")
    if count.status != "OPEN":
        raise HTTPException(409, "Sayım zaten kapatılmış")
    for line in count.lines:
        if line.difference > 0:
            movement_type = "ADJUSTMENT"
            payload = {"movement_type": movement_type, "destination_location_id": line.location_id, "reason": count.count_no, "reference_type": "COUNT", "reference_id": count.id, "lines": [{"product_id": line.product_id, "quantity": line.difference, "lot_no": line.lot_no}]}
        elif line.difference < 0:
            payload = {"movement_type": "ADJUSTMENT", "source_location_id": line.location_id, "reason": count.count_no, "reference_type": "COUNT", "reference_id": count.id, "lines": [{"product_id": line.product_id, "quantity": abs(line.difference), "lot_no": line.lot_no}]}
        else:
            continue
        apply_movement(db, payload)
    count.status = "CLOSED"
    count.closed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(count)
    return count
