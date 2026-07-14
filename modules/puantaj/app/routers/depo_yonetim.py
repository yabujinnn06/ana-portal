"""Admin yonetim ucu: depo kullanicilarini calisanlara baglama + depo stok izni yonetimi.

Puantaj admin JWT + RBAC ile korunur (permission key ``"depo"``, app/security.py). Bu router
depojin'in kendi PIN/JWT kimligini degil, puantaj admin panelinin kimligini kullanir -
CLAUDE.md'deki "iki ayri kimlik modeli" ayrimini korur.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.db import get_db
from app.errors import ApiError
from app.models import AuditActorType, DepoUser, Employee
from app.security import require_admin_permission

router = APIRouter(prefix="/api/depo/yonetim", tags=["depo-yonetim"])


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def _actor_id(claims: dict[str, Any]) -> str:
    return str(claims.get("username") or claims.get("sub") or "admin")


class DepoKullaniciRead(BaseModel):
    id: int
    ad: str
    rol: str
    aktif: bool
    employee_id: int | None
    employee_ad: str | None


class DepoKullaniciBindRequest(BaseModel):
    employee_id: int | None = None


class CalisanIzinRead(BaseModel):
    employee_id: int
    ad_soyad: str
    depo_stok_izni: bool


class CalisanIzinUpdateRequest(BaseModel):
    izinli: bool


@router.get(
    "/kullanicilar",
    response_model=list[DepoKullaniciRead],
    dependencies=[Depends(require_admin_permission("depo"))],
)
def list_depo_kullanicilar(db: Session = Depends(get_db)) -> list[DepoKullaniciRead]:
    rows = db.execute(select(DepoUser).order_by(DepoUser.ad)).scalars().all()
    out: list[DepoKullaniciRead] = []
    for row in rows:
        employee_ad = row.employee.full_name if row.employee else None
        out.append(
            DepoKullaniciRead(
                id=row.id,
                ad=row.ad,
                rol=row.rol,
                aktif=row.aktif,
                employee_id=row.employee_id,
                employee_ad=employee_ad,
            )
        )
    return out


@router.patch(
    "/kullanicilar/{depo_user_id}",
    response_model=DepoKullaniciRead,
    dependencies=[Depends(require_admin_permission("depo", write=True))],
)
def update_depo_kullanici_binding(
    depo_user_id: int,
    payload: DepoKullaniciBindRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("depo", write=True)),
    db: Session = Depends(get_db),
) -> DepoKullaniciRead:
    depo_user = db.get(DepoUser, depo_user_id)
    if depo_user is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Depo kullanicisi bulunamadi.")

    employee: Employee | None = None
    if payload.employee_id is not None:
        employee = db.get(Employee, payload.employee_id)
        if employee is None:
            raise ApiError(status_code=404, code="NOT_FOUND", message="Calisan bulunamadi.")

    previous_employee_id = depo_user.employee_id
    depo_user.employee_id = payload.employee_id
    db.commit()
    db.refresh(depo_user)

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_id(claims),
        action="DEPO_USER_EMPLOYEE_BOUND",
        success=True,
        module="DEPO",
        entity_type="depo_user",
        entity_id=str(depo_user.id),
        ip=_client_ip(request),
        user_agent=_user_agent(request),
        details={
            "depo_user_ad": depo_user.ad,
            "previous_employee_id": previous_employee_id,
            "employee_id": payload.employee_id,
        },
        request_id=getattr(request.state, "request_id", None),
    )

    return DepoKullaniciRead(
        id=depo_user.id,
        ad=depo_user.ad,
        rol=depo_user.rol,
        aktif=depo_user.aktif,
        employee_id=depo_user.employee_id,
        employee_ad=employee.full_name if employee else None,
    )


@router.get(
    "/calisan-izinler",
    response_model=list[CalisanIzinRead],
    dependencies=[Depends(require_admin_permission("depo"))],
)
def list_calisan_izinler(db: Session = Depends(get_db)) -> list[CalisanIzinRead]:
    rows = db.execute(
        select(Employee).where(Employee.is_active == True).order_by(Employee.full_name)
    ).scalars().all()
    return [
        CalisanIzinRead(
            employee_id=row.id,
            ad_soyad=row.full_name,
            depo_stok_izni=row.depo_stok_izni,
        )
        for row in rows
    ]


@router.patch(
    "/calisan-izin/{employee_id}",
    response_model=CalisanIzinRead,
    dependencies=[Depends(require_admin_permission("depo", write=True))],
)
def update_calisan_izin(
    employee_id: int,
    payload: CalisanIzinUpdateRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("depo", write=True)),
    db: Session = Depends(get_db),
) -> CalisanIzinRead:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Calisan bulunamadi.")

    previous = employee.depo_stok_izni
    employee.depo_stok_izni = payload.izinli
    db.commit()
    db.refresh(employee)

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_id(claims),
        action="DEPO_STOK_IZNI_UPDATED",
        success=True,
        module="DEPO",
        entity_type="employee",
        entity_id=str(employee.id),
        ip=_client_ip(request),
        user_agent=_user_agent(request),
        details={"previous": previous, "izinli": payload.izinli},
        request_id=getattr(request.state, "request_id", None),
    )

    return CalisanIzinRead(
        employee_id=employee.id,
        ad_soyad=employee.full_name,
        depo_stok_izni=employee.depo_stok_izni,
    )
