"""Fiziksel depo (warehouse) CRUD + depo-genelinde kalici stok goruntuleme.

Ported from the standalone depojin app (backend/app/routers/depo.py). Original prefix was
``/api/depo``; per the depo entegrasyonu mapping it becomes ``/depo`` here, landing at
``/api/depo/depo/...`` once nested under the ``/api/depo`` parent router.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import DepoDepo, DepoStok, DepoUser
from app.depo_schemas import DepoCreate, DepoOut, DepoDetayOut, DepoStokOut
from app.services.depo_auth import current_depo_user, require_depo_admin
from app.services.depo_audit import audit
from app.services.depo_utils import temizle_metin

router = APIRouter(prefix="/depo", tags=["depo-depo"])


@router.get("", response_model=list[DepoOut])
def list_depolar(db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    return db.execute(
        select(DepoDepo).where(DepoDepo.aktif == True).order_by(DepoDepo.ad)
    ).scalars().all()


@router.post("", response_model=DepoOut)
def create_depo(
    data: DepoCreate, request: Request,
    db: Session = Depends(get_db), user: DepoUser = Depends(require_depo_admin),
):
    ad = temizle_metin(data.ad)
    if not ad:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Depo adi bos olamaz")
    depo = DepoDepo(ad=ad, lokasyon=temizle_metin(data.lokasyon) or None, olusturan_id=user.id)
    db.add(depo)
    db.flush()
    audit(db, "depo_yarat", kullanici=user, kaynak_tip="depo",
          kaynak_id=depo.id, detay={"ad": depo.ad}, request=request)
    db.commit()
    db.refresh(depo)
    return depo


@router.get("/{depo_id}", response_model=DepoDetayOut)
def get_depo(depo_id: int, db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    depo = db.get(DepoDepo, depo_id)
    if not depo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Depo yok")
    stoklar = db.execute(
        select(DepoStok).where(DepoStok.depo_id == depo_id).order_by(DepoStok.stok_kodu)
    ).scalars().all()
    return DepoDetayOut(
        id=depo.id, ad=depo.ad, lokasyon=depo.lokasyon, aktif=depo.aktif,
        olusturma=depo.olusturma,
        stoklar=[DepoStokOut.model_validate(s) for s in stoklar],
    )
