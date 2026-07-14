"""Depo modulunun kendi audit log listeleme/Excel export ucu (depo_audit_loglari).

Ported from the standalone depojin app (backend/app/routers/admin.py). Original prefix was
``/api/admin``; per the depo entegrasyonu mapping it becomes ``/admin`` here, landing at
``/api/depo/admin/...`` — distinct from puantaj's own ``/api/admin/*`` and from
app/routers/depo_yonetim.py (``/api/depo/yonetim/*``, puantaj-admin-JWT-guarded).
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
import json
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select, func, and_, or_, distinct
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DepoAuditLog, DepoUser, SayimOturumu
from app.services.depo_auth import require_depo_admin
from app.depo_schemas import UtcDt
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/admin", tags=["depo-admin"])


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    zaman: UtcDt
    kullanici_id: int | None
    kullanici_ad: str | None
    eylem: str
    kaynak_tip: str | None
    kaynak_id: str | None
    ip: str | None
    detay: dict | None


class AuditSayfa(BaseModel):
    toplam: int
    items: list[AuditOut]


class EylemSayim(BaseModel):
    eylem: str
    sayi: int


def _filtreler(
    db: Session,
    eylem: str | None,
    kullanici_id: int | None,
    kaynak_tip: str | None,
    oturum_id: int | None,
    baslangic: datetime | None,
    bitis: datetime | None,
    q: str | None,
):
    kosul = []
    if eylem:
        kosul.append(DepoAuditLog.eylem == eylem)
    if kullanici_id is not None:
        kosul.append(DepoAuditLog.kullanici_id == kullanici_id)
    if kaynak_tip:
        kosul.append(DepoAuditLog.kaynak_tip == kaynak_tip)
    if oturum_id is not None:
        kosul.append(and_(DepoAuditLog.kaynak_tip == "oturum", DepoAuditLog.kaynak_id == str(oturum_id)))
    if baslangic:
        kosul.append(DepoAuditLog.zaman >= baslangic)
    if bitis:
        kosul.append(DepoAuditLog.zaman <= bitis)
    if q:
        like = f"%{q.strip()}%"
        kosul.append(or_(
            DepoAuditLog.eylem.ilike(like),
            DepoAuditLog.kullanici_ad.ilike(like),
            DepoAuditLog.kaynak_tip.ilike(like),
            DepoAuditLog.kaynak_id.ilike(like),
            DepoAuditLog.ip.ilike(like),
        ))
    return kosul


@router.get("/audit", response_model=AuditSayfa)
def audit_list(
    eylem: str | None = Query(None),
    kullanici_id: int | None = Query(None),
    kaynak_tip: str | None = Query(None),
    oturum_id: int | None = Query(None),
    baslangic: datetime | None = Query(None),
    bitis: datetime | None = Query(None),
    q: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: DepoUser = Depends(require_depo_admin),
):
    kosul = _filtreler(db, eylem, kullanici_id, kaynak_tip, oturum_id, baslangic, bitis, q)
    toplam = db.scalar(select(func.count(DepoAuditLog.id)).where(*kosul)) or 0
    rows = db.execute(
        select(DepoAuditLog).where(*kosul).order_by(DepoAuditLog.zaman.desc()).offset(offset).limit(limit)
    ).scalars().all()
    return AuditSayfa(toplam=toplam, items=rows)


@router.get("/audit/eylemler", response_model=list[EylemSayim])
def audit_eylem_listesi(db: Session = Depends(get_db), _: DepoUser = Depends(require_depo_admin)):
    rows = db.execute(
        select(DepoAuditLog.eylem, func.count(DepoAuditLog.id))
        .group_by(DepoAuditLog.eylem)
        .order_by(func.count(DepoAuditLog.id).desc())
    ).all()
    return [EylemSayim(eylem=e, sayi=n) for e, n in rows]


@router.get("/audit/oturumlar")
def audit_oturum_listesi(db: Session = Depends(get_db), _: DepoUser = Depends(require_depo_admin)):
    rows = db.execute(
        select(SayimOturumu.id, SayimOturumu.ad, SayimOturumu.lokasyon, SayimOturumu.durum)
        .order_by(SayimOturumu.baslangic.desc())
    ).all()
    return [{"id": r[0], "ad": r[1], "lokasyon": r[2], "durum": r[3]} for r in rows]


@router.get("/audit/excel")
def audit_excel(
    eylem: str | None = Query(None),
    kullanici_id: int | None = Query(None),
    kaynak_tip: str | None = Query(None),
    oturum_id: int | None = Query(None),
    baslangic: datetime | None = Query(None),
    bitis: datetime | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    _: DepoUser = Depends(require_depo_admin),
):
    kosul = _filtreler(db, eylem, kullanici_id, kaynak_tip, oturum_id, baslangic, bitis, q)
    rows = db.execute(
        select(DepoAuditLog).where(*kosul).order_by(DepoAuditLog.zaman.asc())
    ).scalars().all()

    wb = Workbook()
    ws = wb.active
    ws.title = "AuditLog"
    ws.append(["Zaman", "Kullanici", "Eylem", "Kaynak Tip", "Kaynak ID", "IP", "Detay (JSON)"])
    for r in rows:
        ws.append([
            r.zaman.strftime("%d.%m.%Y %H:%M:%S"),
            r.kullanici_ad or "",
            r.eylem,
            r.kaynak_tip or "",
            r.kaynak_id or "",
            r.ip or "",
            json.dumps(r.detay, ensure_ascii=False) if r.detay else "",
        ])
    for col, w in zip("ABCDEFG", [19, 16, 22, 14, 12, 18, 60]):
        ws.column_dimensions[col].width = w

    buf = BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="depo_audit_log.xlsx"'},
    )
