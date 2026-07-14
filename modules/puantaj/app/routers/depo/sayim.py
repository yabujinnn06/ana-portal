"""Sayim oturumu (sayim session) CRUD + ozet/stoklar/log.

Ported from the standalone depojin app (backend/app/routers/sayim.py). Original prefix was
``/api/sayim``; per the depo entegrasyonu mapping it becomes ``/sayim`` here, landing at
``/api/depo/sayim/...``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import SayimOturumu, DepoSayimStok, DepoSeri, DepoTaramaLog, DepoUser, DepoDepo, DepoStok
from app.depo_schemas import OturumCreate, OturumOut, StokOzet, LogOut, OzetOut
from app.services.depo_auth import current_depo_user, require_depo_admin, verify_pin
from app.services.depo_audit import audit
from app.services.depo_utils import utc_now

router = APIRouter(prefix="/sayim", tags=["depo-sayim"])


class OturumKapatIn(BaseModel):
    pin: str


@router.get("", response_model=list[OturumOut])
def list_oturumlar(
    arsiv: bool = False,
    db: Session = Depends(get_db),
    _: DepoUser = Depends(current_depo_user),
):
    q = (
        select(SayimOturumu)
        .options(joinedload(SayimOturumu.depo))
        .where(SayimOturumu.mod != "hizli")
        .order_by(SayimOturumu.baslangic.desc())
    )
    if not arsiv:
        q = q.where(SayimOturumu.durum != "arsiv").where(SayimOturumu.durum != "silindi")
    return db.execute(q).scalars().all()


@router.post("", response_model=OturumOut)
def create_oturum(
    data: OturumCreate, request: Request,
    db: Session = Depends(get_db), user: DepoUser = Depends(require_depo_admin),
):
    mod = data.mod if data.mod in ("seri", "serbest") else "seri"
    if not data.depo_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sayim icin depo secilmeli")
    depo = db.get(DepoDepo, data.depo_id)
    if not depo or not depo.aktif:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Depo yok veya onayli degil")
    depo_id = depo.id
    oturum = SayimOturumu(ad=data.ad, lokasyon=data.lokasyon, mod=mod, olusturan_id=user.id, depo_id=depo_id)
    db.add(oturum)
    db.flush()
    audit(db, "oturum_yarat", kullanici=user, kaynak_tip="oturum",
          kaynak_id=oturum.id, detay={"ad": oturum.ad, "mod": mod, "depo_id": depo_id}, request=request)
    db.commit()
    db.refresh(oturum)
    return oturum


@router.post("/{oturum_id}/bitir", response_model=OturumOut)
def bitir(oturum_id: int, data: OturumKapatIn, request: Request,
          db: Session = Depends(get_db), user: DepoUser = Depends(require_depo_admin)):
    if not verify_pin(data.pin or "", user.pin_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "PIN yanlis")
    oturum = db.get(SayimOturumu, oturum_id)
    if not oturum:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    oturum.durum = "tamamlandi"
    oturum.bitis = utc_now()
    audit(db, "oturum_bitir", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum.id, request=request)
    db.commit()
    db.refresh(oturum)
    return oturum


@router.post("/{oturum_id}/arsivle", response_model=OturumOut)
def arsivle(oturum_id: int, request: Request, db: Session = Depends(get_db), user: DepoUser = Depends(require_depo_admin)):
    oturum = db.get(SayimOturumu, oturum_id)
    if not oturum:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    oturum.durum = "arsiv"
    if oturum.bitis is None:
        oturum.bitis = utc_now()
    audit(db, "oturum_arsivle", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum.id, request=request)
    db.commit()
    db.refresh(oturum)
    return oturum


@router.delete("/{oturum_id}")
def sil(oturum_id: int, request: Request, db: Session = Depends(get_db), user: DepoUser = Depends(require_depo_admin)):
    oturum = db.get(SayimOturumu, oturum_id)
    if not oturum:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    ad = oturum.ad
    db.delete(oturum)
    audit(db, "oturum_sil", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum_id,
          detay={"ad": ad}, request=request)
    db.commit()
    return {"ok": True, "ad": ad}


@router.get("/{oturum_id}", response_model=OturumOut)
def get_oturum(oturum_id: int, db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    oturum = db.get(SayimOturumu, oturum_id, options=[joinedload(SayimOturumu.depo)])
    if not oturum:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    return oturum


@router.get("/{oturum_id}/ozet", response_model=OzetOut)
def ozet(oturum_id: int, db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    toplam = db.scalar(select(func.count(DepoSeri.id)).where(DepoSeri.oturum_id == oturum_id)) or 0
    sayilan = db.scalar(select(func.count(DepoSeri.id)).where(and_(DepoSeri.oturum_id == oturum_id, DepoSeri.sayildi == True))) or 0
    stok_sayisi = db.scalar(select(func.count(DepoSayimStok.id)).where(DepoSayimStok.oturum_id == oturum_id)) or 0
    portal_toplam = db.scalar(select(func.coalesce(func.sum(DepoSayimStok.portal_sayim), 0)).where(DepoSayimStok.oturum_id == oturum_id)) or 0
    son_islem = db.scalar(
        select(func.max(DepoTaramaLog.zaman)).where(DepoTaramaLog.oturum_id == oturum_id)
    )
    return OzetOut(
        toplam_seri=toplam,
        sayilan_seri=sayilan,
        kalan_seri=toplam - sayilan,
        stok_sayisi=stok_sayisi,
        portal_toplam=int(portal_toplam),
        portal_fark=sayilan - int(portal_toplam),
        son_islem=son_islem,
    )


@router.get("/{oturum_id}/stoklar", response_model=list[StokOzet])
def stoklar(oturum_id: int, db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    oturum = db.get(SayimOturumu, oturum_id)
    if not oturum:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    depo_miktar_map: dict[str, int] = {}
    if oturum.depo_id:
        depo_rows = db.execute(
            select(DepoStok.stok_kodu, DepoStok.miktar).where(DepoStok.depo_id == oturum.depo_id)
        ).all()
        depo_miktar_map = {r[0]: r[1] for r in depo_rows}
    toplam_sub = (
        select(DepoSeri.stok_id, func.count(DepoSeri.id).label("toplam"))
        .where(DepoSeri.oturum_id == oturum_id)
        .group_by(DepoSeri.stok_id)
        .subquery()
    )
    sayilan_sub = (
        select(DepoSeri.stok_id, func.count(DepoSeri.id).label("sayilan"))
        .where(and_(DepoSeri.oturum_id == oturum_id, DepoSeri.sayildi == True))
        .group_by(DepoSeri.stok_id)
        .subquery()
    )
    rows = db.execute(
        select(
            DepoSayimStok.id,
            DepoSayimStok.stok_kodu,
            DepoSayimStok.urun_adi,
            DepoSayimStok.portal_sayim,
            DepoSayimStok.sonradan_eklendi,
            func.coalesce(toplam_sub.c.toplam, 0),
            func.coalesce(sayilan_sub.c.sayilan, 0),
        )
        .outerjoin(toplam_sub, toplam_sub.c.stok_id == DepoSayimStok.id)
        .outerjoin(sayilan_sub, sayilan_sub.c.stok_id == DepoSayimStok.id)
        .where(DepoSayimStok.oturum_id == oturum_id)
        .order_by(DepoSayimStok.stok_kodu)
    ).all()
    return [
        StokOzet(id=r[0], stok_kodu=r[1], urun_adi=r[2], portal_sayim=r[3],
                 sonradan_eklendi=bool(r[4]), toplam=r[5], sayilan=r[6],
                 depo_miktar=depo_miktar_map.get(r[1]))
        for r in rows
    ]


@router.get("/{oturum_id}/log", response_model=list[LogOut])
def log(oturum_id: int, limit: int = Query(50, ge=1, le=1000), db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    rows = db.execute(
        select(DepoTaramaLog, DepoUser.ad)
        .outerjoin(DepoUser, DepoUser.id == DepoTaramaLog.kullanici_id)
        .where(DepoTaramaLog.oturum_id == oturum_id)
        .order_by(DepoTaramaLog.zaman.desc())
        .limit(limit)
    ).all()
    out = []
    for log, kullanici_ad in rows:
        item = LogOut.model_validate(log)
        item.kullanici_ad = kullanici_ad
        out.append(item)
    return out
