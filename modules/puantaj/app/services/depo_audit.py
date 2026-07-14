"""Depo modulu icin ayri audit log (depo_audit_loglari), puantaj'in app.audit.log_audit'inden
farkli olarak DepoUser kimligiyle calisir.

Ported from the standalone depojin app (backend/app/audit.py) as part of the depo
entegrasyonu (see CLAUDE.md). No behavior changes.
"""

from __future__ import annotations

from typing import Any
from fastapi import Request
from sqlalchemy.orm import Session

from app.models import DepoAuditLog, DepoUser


def audit(
    db: Session,
    eylem: str,
    *,
    kullanici: DepoUser | None = None,
    kaynak_tip: str | None = None,
    kaynak_id: Any = None,
    detay: dict | None = None,
    request: Request | None = None,
) -> None:
    ip = None
    if request is not None:
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
            request.client.host if request.client else None
        )
    db.add(DepoAuditLog(
        kullanici_id=kullanici.id if kullanici else None,
        kullanici_ad=kullanici.ad if kullanici else None,
        eylem=eylem,
        kaynak_tip=kaynak_tip,
        kaynak_id=str(kaynak_id) if kaynak_id is not None else None,
        ip=ip,
        detay=detay,
    ))
    db.commit()
