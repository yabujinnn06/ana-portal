from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import CountLine, CountSession, DispatchOrder, StockMovement, TransferOrder
from ..schemas import CountLineOut, CountOut, DispatchOut, MovementOut, TransferOut

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/movements", response_model=list[MovementOut])
def movement_report(from_date: datetime | None = None, to_date: datetime | None = None, movement_type: str | None = None, db: Session = Depends(get_db)):
    stmt = select(StockMovement).order_by(StockMovement.occurred_at.desc())
    if from_date:
        stmt = stmt.where(StockMovement.occurred_at >= from_date)
    if to_date:
        stmt = stmt.where(StockMovement.occurred_at <= to_date)
    if movement_type:
        stmt = stmt.where(StockMovement.movement_type == movement_type.upper())
    return list(db.scalars(stmt).all())


@router.get("/transfers", response_model=list[TransferOut])
def transfer_report(status: str | None = None, db: Session = Depends(get_db)):
    stmt = select(TransferOrder).order_by(TransferOrder.created_at.desc())
    if status:
        stmt = stmt.where(TransferOrder.status == status.upper())
    return list(db.scalars(stmt).all())


@router.get("/dispatches", response_model=list[DispatchOut])
def dispatch_report(status: str | None = None, customer: str | None = None, db: Session = Depends(get_db)):
    stmt = select(DispatchOrder).order_by(DispatchOrder.created_at.desc())
    if status:
        stmt = stmt.where(DispatchOrder.status == status.upper())
    if customer:
        stmt = stmt.where(DispatchOrder.customer_name.ilike(f"%{customer.strip()}%"))
    return list(db.scalars(stmt).all())


@router.get("/counts", response_model=list[CountOut])
def count_report(status: str | None = None, db: Session = Depends(get_db)):
    stmt = select(CountSession).order_by(CountSession.created_at.desc())
    if status:
        stmt = stmt.where(CountSession.status == status.upper())
    return list(db.scalars(stmt).all())


@router.get("/counts/{count_id}/lines", response_model=list[CountLineOut])
def count_lines_report(count_id: int, db: Session = Depends(get_db)):
    if not db.get(CountSession, count_id):
        raise HTTPException(404, "Sayım bulunamadı")
    return list(db.scalars(select(CountLine).where(CountLine.session_id == count_id).order_by(CountLine.difference.desc())).all())

