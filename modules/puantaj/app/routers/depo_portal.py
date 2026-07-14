"""Calisan portali icin depo modulu izin gostergesi.

Employee-facing endpoint under ``/api/depo/portal``. Auth follows the same pattern as
the break endpoints in app/routers/attendance.py: a ``device_fingerprint`` in the request body
with a cookie fallback (``pf_device_fingerprint``, set by the attendance flows once a device is
claimed), resolved through attendance.py's own ``_active_employee_from_device_or_error``
helper so behavior (404/403 semantics) matches the rest of the employee portal exactly.

Only ``/ozet`` exists: it gates whether the portal shows the "Depo" quick-action tile
(``izin: false`` -> hide the tile). The actual counting/stock UI lives entirely in the
separate depo SPA (``/depo``), opened directly from the portal instead of being
re-implemented here.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.errors import ApiError
from app.models import DepoDepo, DepoStok, Employee
from app.routers.attendance import (
    DEVICE_FINGERPRINT_COOKIE,
    _active_employee_from_device_or_error,
)

router = APIRouter(prefix="/api/depo/portal", tags=["depo-portal"])


def _resolve_device_fingerprint(request: Request, device_fingerprint: str | None) -> str:
    fingerprint = (device_fingerprint or "").strip()
    if not fingerprint:
        fingerprint = (request.cookies.get(DEVICE_FINGERPRINT_COOKIE) or "").strip()
    if not fingerprint:
        raise ApiError(
            status_code=400,
            code="DEVICE_FINGERPRINT_REQUIRED",
            message="device_fingerprint is required.",
        )
    return fingerprint


def _resolve_employee(db: Session, request: Request, device_fingerprint: str | None) -> Employee:
    fingerprint = _resolve_device_fingerprint(request, device_fingerprint)
    employee, _device = _active_employee_from_device_or_error(db, device_fingerprint=fingerprint)
    return employee


class DepoPortalRequest(BaseModel):
    device_fingerprint: str | None = None


@router.post("/ozet")
def ozet(
    payload: DepoPortalRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    employee = _resolve_employee(db, request, payload.device_fingerprint)
    if not employee.depo_stok_izni:
        return {"izin": False, "depolar": []}

    rows = db.execute(
        select(DepoDepo).where(DepoDepo.aktif == True).order_by(DepoDepo.ad)
    ).scalars().all()

    depolar = []
    for depo in rows:
        stok_kalemi_sayisi = db.scalar(
            select(func.count(DepoStok.id)).where(DepoStok.depo_id == depo.id)
        ) or 0
        toplam_miktar = db.scalar(
            select(func.coalesce(func.sum(DepoStok.miktar), 0)).where(DepoStok.depo_id == depo.id)
        ) or 0
        depolar.append({
            "id": depo.id,
            "ad": depo.ad,
            "lokasyon": depo.lokasyon,
            "stok_kalemi": int(stok_kalemi_sayisi),
            "toplam_miktar": int(toplam_miktar),
        })

    return {"izin": True, "depolar": depolar}
