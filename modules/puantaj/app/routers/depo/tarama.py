"""Canli barkod tarama islemi + oturum WebSocket'i.

Ported from the standalone depojin app (backend/app/routers/tarama.py). Original prefix was
the bare ``/api`` (no subpath); per the depo entegrasyonu mapping this router keeps no
prefix of its own here, so its subpaths land directly under the ``/api/depo`` parent prefix:
``POST /api/depo/tarama`` and ``WS /api/depo/ws/sayim/{oturum_id}``.

``_islem`` is kept as a module-level function (not private to a class) because
tests/test_depo_tarama.py calls it directly, mirroring depojin's own test_tarama.py.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, case, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.services.depo_auth import current_depo_user, decode_token
from app.db import SessionLocal, get_db
from app.models import SayimOturumu, DepoSeri, DepoSayimStok, DepoTaramaLog, DepoUser
from app.services.depo_ratelimit import hiz_limiti
from app.depo_schemas import CakisanSecenek, TaramaIn, TaramaOut
from app.services.depo_utils import BarkodParse, parse_barkod, utc_now
from app.services.depo_ws import manager
from app.settings import get_cors_origins

_WS_AUTH_TIMEOUT_SECONDS = 10

router = APIRouter(tags=["depo-tarama"])
logger = logging.getLogger("app.depo.tarama")


def _stok_sayilari(db: Session, stok_id: int) -> tuple[int, int]:
    toplam, sayilan = db.execute(
        select(
            func.count(DepoSeri.id),
            func.coalesce(func.sum(case((DepoSeri.sayildi == True, 1), else_=0)), 0),
        ).where(DepoSeri.stok_id == stok_id)
    ).one()
    return toplam or 0, sayilan or 0


def _log(
    db: Session,
    oturum_id: int,
    user_id: int | None,
    seri: str,
    durum: str,
    stok_kodu: str | None,
    urun_adi: str | None,
    aciklama: str | None,
    client_scan_id: str | None = None,
    istek_json: dict | None = None,
    sonuc_json: dict | None = None,
) -> DepoTaramaLog:
    row = DepoTaramaLog(
        oturum_id=oturum_id,
        kullanici_id=user_id,
        seri_giris=seri,
        durum=durum,
        stok_kodu=stok_kodu,
        urun_adi=urun_adi,
        aciklama=aciklama,
        client_scan_id=client_scan_id,
        istek_json=istek_json,
        sonuc_json=sonuc_json,
    )
    db.add(row)
    return row


def _parse_fields(parsed: BarkodParse) -> dict:
    return {
        "raw_seri": parsed.raw,
        "raw_input": parsed.raw,
        "normalized_input": parsed.normalized,
        "resolved_serial": parsed.serial or None,
        "parsed_stock_code": parsed.stock_code,
    }


def _istek_ozeti(data: TaramaIn, parsed: BarkodParse) -> dict:
    return {
        "seri": data.seri,
        "normalized_input": parsed.normalized,
        "secilen_seri_id": data.secilen_seri_id,
        "secilen_stok_id": data.secilen_stok_id,
    }


def _idempotent_replay(
    db: Session,
    data: TaramaIn,
    user_id: int,
    istek_json: dict,
) -> TaramaOut | None:
    if not data.client_scan_id:
        return None
    mevcut = db.execute(
        select(DepoTaramaLog).where(and_(
            DepoTaramaLog.oturum_id == data.oturum_id,
            DepoTaramaLog.kullanici_id == user_id,
            DepoTaramaLog.client_scan_id == data.client_scan_id,
        ))
    ).scalar_one_or_none()
    if mevcut is None:
        return None
    if mevcut.istek_json != istek_json:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "client_scan_id farkli bir tarama isteginde kullanilmis",
        )
    if not mevcut.sonuc_json:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ayni tarama istegi halen isleniyor",
        )
    return TaramaOut.model_validate(mevcut.sonuc_json).model_copy(update={
        "client_scan_id": data.client_scan_id,
        "idempotent_replay": True,
    })


def _sonucu_kaydet(
    db: Session,
    data: TaramaIn,
    parsed: BarkodParse,
    user: DepoUser,
    sonuc: TaramaOut,
    *,
    stok_kodu: str | None,
    urun_adi: str | None,
    aciklama: str | None,
) -> TaramaOut:
    istek_json = _istek_ozeti(data, parsed)
    sonuc = sonuc.model_copy(update={
        "client_scan_id": data.client_scan_id,
        "idempotent_replay": False,
    })
    _log(
        db,
        data.oturum_id,
        user.id,
        parsed.raw,
        sonuc.durum,
        stok_kodu,
        urun_adi,
        aciklama,
        client_scan_id=data.client_scan_id,
        istek_json=istek_json if data.client_scan_id else None,
        sonuc_json=sonuc.model_dump(mode="json") if data.client_scan_id else None,
    )
    try:
        db.commit()
        return sonuc
    except IntegrityError:
        db.rollback()
        replay = _idempotent_replay(db, data, user.id, istek_json)
        if replay is not None:
            return replay
        raise


def _secenekler(
    rows: list[tuple[DepoSeri, DepoSayimStok]],
    parsed: BarkodParse,
    eslesme_tipi: str,
) -> list[CakisanSecenek]:
    return [
        CakisanSecenek(
            seri_id=seri.id,
            stok_id=stok.id,
            stok_kodu=stok.stok_kodu,
            urun_adi=stok.urun_adi,
            sayildi=seri.sayildi,
            eslesme_tipi=eslesme_tipi,
            barkod_stokuyla_uyumlu_mu=(
                stok.stok_kodu == parsed.stock_code if parsed.stock_code else None
            ),
        )
        for seri, stok in rows
    ]


def _adaylari_bul(
    db: Session,
    oturum_id: int,
    parsed: BarkodParse,
) -> tuple[list[tuple[DepoSeri, DepoSayimStok]], str]:
    query = (
        select(DepoSeri, DepoSayimStok)
        .join(DepoSayimStok, DepoSayimStok.id == DepoSeri.stok_id)
        .where(and_(DepoSeri.oturum_id == oturum_id, DepoSeri.seri_no_norm.in_(parsed.keys)))
    )
    if parsed.type == "stock_serial" and parsed.stock_code:
        exact = db.execute(
            query.where(DepoSayimStok.stok_kodu == parsed.stock_code).with_for_update()
        ).all()
        if exact:
            return exact, "stok_ve_seri"
        return db.execute(query.with_for_update()).all(), "stok_kodu_uyusmuyor"
    return db.execute(query.with_for_update()).all(), "seri"


def _secimi_dogrula(
    rows: list[tuple[DepoSeri, DepoSayimStok]],
    secilen_seri_id: int | None,
    secilen_stok_id: int | None,
) -> tuple[DepoSeri, DepoSayimStok] | None:
    if secilen_seri_id is None and secilen_stok_id is None:
        return None
    if secilen_seri_id is None or secilen_stok_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Seri ve stok secimi birlikte gonderilmeli",
        )
    for seri, stok in rows:
        if seri.id == secilen_seri_id and stok.id == secilen_stok_id:
            return seri, stok
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gecersiz seri/stok secimi")


def _stok_sonucu(
    parsed: BarkodParse,
    durum: str,
    mesaj: str,
    seri: DepoSeri,
    stok: DepoSayimStok,
    toplam: int,
    sayilan: int,
) -> TaramaOut:
    return TaramaOut(
        durum=durum,
        mesaj=mesaj,
        seri=seri.seri_no,
        stok_kodu=stok.stok_kodu,
        urun_adi=stok.urun_adi,
        toplam=toplam,
        sayilan=sayilan,
        kalan=toplam - sayilan,
        portal_sayim=stok.portal_sayim,
        portal_fark=sayilan - stok.portal_sayim,
        **{**_parse_fields(parsed), "resolved_serial": seri.seri_no_norm},
    )


def _islem(db: Session, data: TaramaIn, user: DepoUser) -> TaramaOut:
    parsed = parse_barkod(data.seri)
    if not parsed.keys:
        return TaramaOut(
            durum="bos",
            mesaj="Bos giris",
            seri=parsed.raw,
            **_parse_fields(parsed),
        )

    oturum = db.get(SayimOturumu, data.oturum_id)
    if not oturum:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    istek_json = _istek_ozeti(data, parsed)
    replay = _idempotent_replay(db, data, user.id, istek_json)
    if replay is not None:
        return replay
    if oturum.durum != "aktif":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Oturum aktif degil")

    eslesenler, eslesme_tipi = _adaylari_bul(db, data.oturum_id, parsed)
    if not eslesenler:
        sonuc = TaramaOut(
            durum="bulunamadi",
            mesaj=f"Seri bulunamadi: {parsed.serial or parsed.raw}",
            seri=parsed.serial or parsed.raw,
            **_parse_fields(parsed),
        )
        return _sonucu_kaydet(
            db, data, parsed, user, sonuc,
            stok_kodu=None, urun_adi=None, aciklama="Seri listede yok",
        )

    secilen = _secimi_dogrula(
        eslesenler, data.secilen_seri_id, data.secilen_stok_id
    )
    stok_uyusmazligi = eslesme_tipi == "stok_kodu_uyusmuyor"
    if secilen is None and (len(eslesenler) > 1 or stok_uyusmazligi):
        kodlar = sorted({stok.stok_kodu for _, stok in eslesenler})
        mesaj = (
            f"Barkoddaki stok kodu ({parsed.stock_code}) sistemdeki stoklarla uyusmuyor. Stok secin."
            if stok_uyusmazligi
            else "Bu seri birden fazla stokta var. Hangi stokta sayiyorsun?"
        )
        sonuc = TaramaOut(
            durum="cakisma",
            mesaj=mesaj,
            seri=parsed.serial,
            cakisan_stoklar=kodlar,
            cakisan_secenekler=_secenekler(eslesenler, parsed, eslesme_tipi),
            **_parse_fields(parsed),
        )
        return _sonucu_kaydet(
            db, data, parsed, user, sonuc,
            stok_kodu=None, urun_adi=None, aciklama=mesaj,
        )

    seri, stok = secilen or eslesenler[0]
    if seri.sayildi:
        toplam, sayilan = _stok_sayilari(db, stok.id)
        sonuc = _stok_sonucu(
            parsed, "mukerrer", "Bu seri daha once sayildi",
            seri, stok, toplam, sayilan,
        )
        return _sonucu_kaydet(
            db, data, parsed, user, sonuc,
            stok_kodu=stok.stok_kodu,
            urun_adi=stok.urun_adi,
            aciklama="Daha once sayildi",
        )

    sonuc = db.execute(
        update(DepoSeri)
        .where(and_(DepoSeri.id == seri.id, DepoSeri.sayildi == False))
        .values(
            sayildi=True,
            sayim_tarihi=utc_now(),
            sayan_id=user.id,
        )
    )
    if sonuc.rowcount != 1:
        db.rollback()
        seri = db.get(DepoSeri, seri.id)
        if seri is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Seri kaydi degisti")
        toplam, sayilan = _stok_sayilari(db, stok.id)
        sonuc = _stok_sonucu(
            parsed, "mukerrer", "Bu seri daha once sayildi",
            seri, stok, toplam, sayilan,
        )
        return _sonucu_kaydet(
            db, data, parsed, user, sonuc,
            stok_kodu=stok.stok_kodu,
            urun_adi=stok.urun_adi,
            aciklama="Eszamanli taramada daha once sayildi",
        )

    toplam, sayilan = _stok_sayilari(db, stok.id)
    logger.info(
        "tarama raw=%r normalized=%r serial=%r parsed_stock=%r "
        "result=basarili stok_id=%s seri_id=%s user_id=%s",
        parsed.raw, parsed.normalized, parsed.serial, parsed.stock_code,
        stok.id, seri.id, user.id,
    )
    sonuc = _stok_sonucu(
        parsed, "basarili", f"Seri sayildi: {seri.seri_no}",
        seri, stok, toplam, sayilan,
    )
    return _sonucu_kaydet(
        db, data, parsed, user, sonuc,
        stok_kodu=stok.stok_kodu,
        urun_adi=stok.urun_adi,
        aciklama="Sayim kaydedildi",
    )


@router.post("/tarama", response_model=TaramaOut, dependencies=[Depends(hiz_limiti("tarama", 60, 10))])
async def tarama(
    data: TaramaIn,
    db: Session = Depends(get_db),
    user: DepoUser = Depends(current_depo_user),
):
    sonuc = _islem(db, data, user)
    if sonuc.idempotent_replay:
        return sonuc
    manager.update_aktivite(data.oturum_id, user.id, sonuc.seri, sonuc.durum)
    await manager.broadcast(data.oturum_id, {
        "tip": "tarama",
        "kullanici": user.ad,
        "kullanici_id": user.id,
        "zaman": datetime.now(timezone.utc).isoformat(),
        "sonuc": sonuc.model_dump(),
    })
    await manager.broadcast_presence(data.oturum_id)
    return sonuc


def _ws_origin_allowed(ws: WebSocket) -> bool:
    origin = ws.headers.get("origin")
    if not origin:
        return False
    allowed = get_cors_origins()
    return "*" in allowed or origin in allowed


@router.websocket("/ws/sayim/{oturum_id}")
async def ws_oturum(ws: WebSocket, oturum_id: int):
    # Token gelir ilk mesajla (query string'de degil): proxy/erisim loglarina,
    # tarayici gecmisine ve Referer basligina sizmasin diye.
    if not _ws_origin_allowed(ws):
        await ws.close(code=1008)
        return
    await ws.accept()
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=_WS_AUTH_TIMEOUT_SECONDS)
        auth_msg = json.loads(raw)
        if auth_msg.get("tip") != "auth":
            raise ValueError("ilk mesaj auth olmali")
        token = str(auth_msg.get("token") or "")
        payload = decode_token(token, "depo_access")
        user_id = int(payload.get("sub"))
        rol = payload.get("rol", "sayan")
    except Exception:
        await ws.close(code=1008)
        return
    db = SessionLocal()
    try:
        user = db.get(DepoUser, user_id)
        if not user or not user.aktif:
            await ws.close(code=1008)
            return
        ad = user.ad
    finally:
        db.close()
    await manager.register(oturum_id, ws, user_id, ad, rol)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            tip = msg.get("tip")
            if tip == "chat":
                metin = str(msg.get("mesaj", ""))[:500].strip()
                if not metin:
                    continue
                await manager.broadcast(oturum_id, {
                    "tip": "chat",
                    "kullanici_id": user_id,
                    "ad": ad,
                    "rol": rol,
                    "zaman": datetime.now(timezone.utc).isoformat(),
                    "mesaj": metin,
                })
            elif tip == "voice":
                data = msg.get("data") or ""
                if not isinstance(data, str) or len(data) > 400_000:
                    continue
                await manager.broadcast(oturum_id, {
                    "tip": "voice",
                    "kullanici_id": user_id,
                    "ad": ad,
                    "rol": rol,
                    "zaman": datetime.now(timezone.utc).isoformat(),
                    "data": data,
                    "mime": str(msg.get("mime", "audio/webm"))[:40],
                    "sure": float(msg.get("sure", 0) or 0),
                })
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(oturum_id, ws)
