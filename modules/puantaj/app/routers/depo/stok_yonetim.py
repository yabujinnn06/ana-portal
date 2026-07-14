"""Sayim disi (sonradan/serbest) stok+seri yonetimi: elle ekleme, toplu giris/cikis/zimmet.

Ported from the standalone depojin app (backend/app/routers/stok_yonetim.py). Original
prefix was the bare ``/api`` (no subpath); per the depo entegrasyonu mapping this router
keeps no prefix of its own, so its subpaths land directly under the ``/api/depo`` parent
prefix, e.g. ``/api/depo/sayim/{oturum_id}/stok``, ``/api/depo/stok/{stok_id}/seri``.
"""

from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, and_, func, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import SayimOturumu, DepoSayimStok, DepoSeri, DepoTaramaLog, DepoUser, DepoStok, Employee
from app.services.depo_auth import current_depo_user, require_depo_admin
from app.services.depo_audit import audit
from app.services.depo_ratelimit import hiz_limiti
from app.depo_schemas import UtcDt
from app.services.depo_utils import normalize_seri, normalize_stok_kodu, parse_barkod, temizle_metin, utc_now
from app.services.depo_ws import manager

router = APIRouter(tags=["depo-stok-yonetim"])


class StokIn(BaseModel):
    stok_kodu: str
    urun_adi: str
    portal_sayim: int = 0


class StokOut(BaseModel):
    id: int
    stok_kodu: str
    urun_adi: str
    portal_sayim: int
    sonradan_eklendi: bool


class SeriIn(BaseModel):
    seri_no: str
    sayildi_olarak_ekle: bool = False
    cakisma_onaylandi: bool = False
    supheli_barkod_onaylandi: bool = False


class SeriOut(BaseModel):
    id: int
    seri_no: str
    sayildi: bool
    sayim_tarihi: UtcDt | None
    sayan_ad: str | None
    sonradan_eklendi: bool
    cikis_zaman: UtcDt | None
    cikis_kullanici_ad: str | None
    cikis_notu: str | None
    zimmet_kullanici_id: int | None
    zimmet_kullanici_ad: str | None
    zimmet_employee_id: int | None
    zimmet_employee_ad: str | None
    zimmet_zaman: UtcDt | None
    zimmet_notu: str | None


def _depo_stok_arttir(db: Session, depo_id: int, stok_kodu: str, urun_adi: str, miktar_delta: int = 1) -> int:
    """Depo genelinde kalici stok satirini bulur/yaratir ve miktarini atomik arttirir."""
    mevcut = db.execute(
        select(DepoStok).where(and_(DepoStok.depo_id == depo_id, DepoStok.stok_kodu == stok_kodu))
    ).scalar_one_or_none()
    if not mevcut:
        try:
            with db.begin_nested():
                mevcut = DepoStok(depo_id=depo_id, stok_kodu=stok_kodu, urun_adi=urun_adi, miktar=0)
                db.add(mevcut)
                db.flush()
        except IntegrityError:
            mevcut = db.execute(
                select(DepoStok).where(and_(DepoStok.depo_id == depo_id, DepoStok.stok_kodu == stok_kodu))
            ).scalar_one()
    db.execute(update(DepoStok).where(DepoStok.id == mevcut.id).values(miktar=DepoStok.miktar + miktar_delta))
    db.flush()
    return db.scalar(select(DepoStok.miktar).where(DepoStok.id == mevcut.id)) or 0


def _depo_stok_azalt(db: Session, depo_id: int, stok_kodu: str) -> None:
    db.execute(
        update(DepoStok)
        .where(and_(DepoStok.depo_id == depo_id, DepoStok.stok_kodu == stok_kodu))
        .values(miktar=DepoStok.miktar - 1)
    )


def _kontrol(db: Session, oturum_id: int) -> SayimOturumu:
    o = db.get(SayimOturumu, oturum_id)
    if not o:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oturum yok")
    if o.durum != "aktif":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Oturum aktif degil")
    return o


@router.post("/sayim/{oturum_id}/stok", response_model=StokOut)
def stok_ekle(oturum_id: int, data: StokIn, request: Request,
              db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    _kontrol(db, oturum_id)
    kod = normalize_stok_kodu(data.stok_kodu)
    ad = temizle_metin(data.urun_adi) or kod
    if not kod:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Stok kodu bos olamaz")
    mevcut = db.execute(
        select(DepoSayimStok).where(and_(DepoSayimStok.oturum_id == oturum_id, DepoSayimStok.stok_kodu == kod))
    ).scalar_one_or_none()
    if mevcut:
        return StokOut(id=mevcut.id, stok_kodu=mevcut.stok_kodu, urun_adi=mevcut.urun_adi,
                       portal_sayim=mevcut.portal_sayim, sonradan_eklendi=mevcut.sonradan_eklendi)
    s = DepoSayimStok(oturum_id=oturum_id, stok_kodu=kod, urun_adi=ad,
             portal_sayim=data.portal_sayim, sonradan_eklendi=True)
    db.add(s); db.flush()
    audit(db, "stok_ekle", kullanici=user, kaynak_tip="stok", kaynak_id=s.id,
          detay={"oturum": oturum_id, "kod": kod, "ad": ad}, request=request)
    db.commit(); db.refresh(s)
    return StokOut(id=s.id, stok_kodu=s.stok_kodu, urun_adi=s.urun_adi,
                   portal_sayim=s.portal_sayim, sonradan_eklendi=True)


@router.post("/stok/{stok_id}/seri", response_model=SeriOut)
async def seri_ekle(stok_id: int, data: SeriIn, request: Request,
                    db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    stok = db.get(DepoSayimStok, stok_id)
    if not stok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stok yok")
    oturum = _kontrol(db, stok.oturum_id)
    parsed = parse_barkod(data.seri_no)
    seri_no = parsed.serial
    norm = normalize_seri(seri_no)
    if not norm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seri bos olamaz")
    if oturum.mod == "serbest" and norm.startswith("8") and not data.supheli_barkod_onaylandi:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "TEKRAR_OKUT: Bu barkod 8 ile basliyor, gecersiz bir barkod olabilir. "
            "Islenmesi icin ayni barkodu bir kez daha okutun.",
        )
    mevcut = db.execute(
        select(DepoSeri).where(and_(DepoSeri.stok_id == stok_id, DepoSeri.seri_no_norm == norm))
    ).scalar_one_or_none()
    if mevcut:
        db.add(DepoTaramaLog(
            oturum_id=stok.oturum_id, kullanici_id=user.id, seri_giris=data.seri_no,
            durum="mukerrer", stok_kodu=stok.stok_kodu, urun_adi=stok.urun_adi,
            aciklama="Bu seri zaten kayitli (serbest sayim)",
        ))
        db.commit()
        await manager.broadcast(stok.oturum_id, {"tip": "serbest_guncelleme", "kullanici": user.ad})
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bu seri zaten kayitli")
    diger_stoklar = db.execute(
        select(DepoSayimStok.stok_kodu)
        .join(DepoSeri, DepoSeri.stok_id == DepoSayimStok.id)
        .where(and_(
            DepoSeri.oturum_id == stok.oturum_id,
            DepoSeri.seri_no_norm == norm,
            DepoSeri.stok_id != stok.id,
        ))
        .distinct()
    ).scalars().all()
    barkod_stok_uyusmuyor = bool(
        parsed.stock_code and parsed.stock_code != stok.stok_kodu
    )
    if (diger_stoklar or barkod_stok_uyusmuyor) and not data.cakisma_onaylandi:
        nedenler = []
        if barkod_stok_uyusmuyor:
            nedenler.append(
                f"Barkod stok kodu {parsed.stock_code}, secilen stok {stok.stok_kodu}"
            )
        if diger_stoklar:
            nedenler.append(f"Seri su stoklarda da var: {', '.join(sorted(diger_stoklar))}")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "ONAY_GEREKLI: " + ". ".join(nedenler),
        )
    if oturum.depo_id:
        depo_mukerrer = db.execute(
            select(DepoSeri).where(and_(DepoSeri.depo_id == oturum.depo_id, DepoSeri.seri_no_norm == norm))
        ).scalar_one_or_none()
        if depo_mukerrer:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Bu seri depoda zaten sayilmis (baska bir oturumda)",
            )
    s = DepoSeri(
        oturum_id=stok.oturum_id, stok_id=stok.id, depo_id=oturum.depo_id,
        seri_no=seri_no, seri_no_norm=norm,
        sayildi=data.sayildi_olarak_ekle,
        sayim_tarihi=utc_now() if data.sayildi_olarak_ekle else None,
        sayan_id=user.id if data.sayildi_olarak_ekle else None,
        sonradan_eklendi=True,
    )
    db.add(s); db.flush()
    audit(db, "seri_ekle", kullanici=user, kaynak_tip="seri", kaynak_id=s.id,
          detay={
              "stok": stok.stok_kodu,
              "seri": seri_no,
              "raw_input": data.seri_no,
              "parsed_stock_code": parsed.stock_code,
              "sayildi": data.sayildi_olarak_ekle,
          },
          request=request)
    if data.sayildi_olarak_ekle:
        db.add(DepoTaramaLog(
            oturum_id=stok.oturum_id, kullanici_id=user.id, seri_giris=data.seri_no,
            durum="basarili", stok_kodu=stok.stok_kodu, urun_adi=stok.urun_adi,
            aciklama="Serbest sayim",
        ))
        if oturum.depo_id:
            _depo_stok_arttir(db, oturum.depo_id, stok.stok_kodu, stok.urun_adi)
    db.commit(); db.refresh(s)
    if data.sayildi_olarak_ekle:
        await manager.broadcast(stok.oturum_id, {"tip": "serbest_guncelleme", "kullanici": user.ad})
    return _serileri_doldur([s], db)[0]


@router.get("/stok/{stok_id}/seriler", response_model=list[SeriOut])
def stok_seriler(stok_id: int, db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)):
    seriler = db.execute(
        select(DepoSeri).where(DepoSeri.stok_id == stok_id).order_by(DepoSeri.seri_no)
    ).scalars().all()
    return _serileri_doldur(seriler, db)


def _kullanici_map(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = db.execute(select(DepoUser.id, DepoUser.ad).where(DepoUser.id.in_(ids))).all()
    return {r[0]: r[1] for r in rows}


def _serileri_doldur(seriler: list[DepoSeri], db: Session) -> list[SeriOut]:
    ids: set[int] = set()
    employee_ids: set[int] = set()
    for s in seriler:
        for x in (s.sayan_id, s.cikis_kullanici_id, s.zimmet_kullanici_id):
            if x: ids.add(x)
        if s.zimmet_employee_id: employee_ids.add(s.zimmet_employee_id)
    adlar = _kullanici_map(db, ids)
    employee_adlar: dict[int, str] = {}
    if employee_ids:
        rows = db.execute(select(Employee.id, Employee.full_name).where(Employee.id.in_(employee_ids))).all()
        employee_adlar = {r[0]: r[1] for r in rows}
    out = []
    for s in seriler:
        out.append(SeriOut(
            id=s.id, seri_no=s.seri_no, sayildi=s.sayildi, sayim_tarihi=s.sayim_tarihi,
            sayan_ad=adlar.get(s.sayan_id) if s.sayan_id else None,
            sonradan_eklendi=s.sonradan_eklendi,
            cikis_zaman=s.cikis_zaman,
            cikis_kullanici_ad=adlar.get(s.cikis_kullanici_id) if s.cikis_kullanici_id else None,
            cikis_notu=s.cikis_notu,
            zimmet_kullanici_id=s.zimmet_kullanici_id,
            zimmet_kullanici_ad=adlar.get(s.zimmet_kullanici_id) if s.zimmet_kullanici_id else None,
            zimmet_employee_id=s.zimmet_employee_id,
            zimmet_employee_ad=employee_adlar.get(s.zimmet_employee_id) if s.zimmet_employee_id else None,
            zimmet_zaman=s.zimmet_zaman, zimmet_notu=s.zimmet_notu,
        ))
    return out


class TopluGirisSatir(BaseModel):
    stok_kodu: str
    urun_adi: str | None = None
    seri_no: str
    portal_sayim: int = 0


class TopluGirisIn(BaseModel):
    satirlar: list[TopluGirisSatir]


@router.post("/sayim/{oturum_id}/toplu-giris", dependencies=[Depends(hiz_limiti("toplu_giris", 10, 60))])
def toplu_giris(oturum_id: int, data: TopluGirisIn, request: Request,
                db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    oturum = _kontrol(db, oturum_id)
    stok_idx: dict[str, DepoSayimStok] = {}
    seri_idx: set[tuple[int, str]] = set()
    for s in db.execute(
        select(DepoSayimStok).where(DepoSayimStok.oturum_id == oturum_id).options(selectinload(DepoSayimStok.seriler))
    ).scalars():
        stok_idx[s.stok_kodu] = s
        for seri in s.seriler:
            seri_idx.add((s.id, seri.seri_no_norm))

    depo_seri_idx: set[str] = set()
    if oturum.depo_id:
        depo_seri_idx = set(db.execute(
            select(DepoSeri.seri_no_norm).where(DepoSeri.depo_id == oturum.depo_id)
        ).scalars().all())
    depo_delta: dict[str, int] = {}

    simdi = utc_now()
    yeni_stok = 0; yeni_seri = 0; mukerrer = 0; bos = 0
    for r in data.satirlar:
        kod = normalize_stok_kodu(r.stok_kodu)
        seri = temizle_metin(r.seri_no)
        norm = normalize_seri(seri)
        if not kod and not seri:
            bos += 1; continue
        stok = stok_idx.get(kod)
        if not stok and kod:
            stok = DepoSayimStok(oturum_id=oturum_id, stok_kodu=kod,
                        urun_adi=temizle_metin(r.urun_adi) or kod,
                        portal_sayim=r.portal_sayim, sonradan_eklendi=True)
            db.add(stok); db.flush()
            stok_idx[kod] = stok; yeni_stok += 1
        if seri and stok:
            if (stok.id, norm) in seri_idx:
                mukerrer += 1; continue
            if oturum.depo_id and norm in depo_seri_idx:
                mukerrer += 1; continue
            seri_idx.add((stok.id, norm))
            db.add(DepoSeri(
                oturum_id=oturum_id, stok_id=stok.id, depo_id=oturum.depo_id,
                seri_no=seri, seri_no_norm=norm,
                sayildi=True, sayim_tarihi=simdi, sayan_id=user.id,
                sonradan_eklendi=True,
            ))
            yeni_seri += 1
            if oturum.depo_id:
                depo_seri_idx.add(norm)
                depo_delta[stok.stok_kodu] = depo_delta.get(stok.stok_kodu, 0) + 1
    if oturum.depo_id:
        for kod, delta in depo_delta.items():
            _depo_stok_arttir(db, oturum.depo_id, kod, stok_idx[kod].urun_adi, delta)
    audit(db, "toplu_giris", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum_id,
          detay={"yeni_stok": yeni_stok, "yeni_seri": yeni_seri,
                 "mukerrer": mukerrer, "bos": bos}, request=request)
    db.commit()
    return {"yeni_stok": yeni_stok, "yeni_seri": yeni_seri, "mukerrer": mukerrer, "bos": bos}


_RX_SERISIZ = re.compile(r"^SERIYOKRW(\d+)$")


def _sonraki_serisiz_no(db: Session, oturum_id: int, depo_id: int | None) -> int:
    # depo'ya bagli oturumlarda sayac depo genelinde ilerler (uq_seri_depo_norm ile
    # farkli oturumlarin ayni kodu uretip catismasini onlemek icin).
    cond = (
        and_(DepoSeri.depo_id == depo_id, DepoSeri.seri_no_norm.like("SERIYOKRW%"))
        if depo_id else
        and_(DepoSeri.oturum_id == oturum_id, DepoSeri.seri_no_norm.like("SERIYOKRW%"))
    )
    rows = db.execute(select(DepoSeri.seri_no_norm).where(cond)).scalars().all()
    mx = 0
    for r in rows:
        m = _RX_SERISIZ.match(r or "")
        if m:
            mx = max(mx, int(m.group(1)))
    return mx + 1


class SerisizSatir(BaseModel):
    stok_kodu: str
    adet: int
    urun_adi: str | None = None


class SerisizGirisIn(BaseModel):
    satirlar: list[SerisizSatir]


@router.post("/sayim/{oturum_id}/serisiz-giris", dependencies=[Depends(hiz_limiti("serisiz_giris", 10, 60))])
async def serisiz_giris(oturum_id: int, data: SerisizGirisIn, request: Request,
                        db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    """Serisiz urunleri otomatik SERIYOKRW#### kodu ureterek ekler ve sayildi olarak isaretler."""
    oturum = _kontrol(db, oturum_id)
    stok_idx: dict[str, DepoSayimStok] = {
        s.stok_kodu: s for s in db.execute(select(DepoSayimStok).where(DepoSayimStok.oturum_id == oturum_id)).scalars()
    }
    sayac = _sonraki_serisiz_no(db, oturum_id, oturum.depo_id)
    simdi = utc_now()
    yeni_stok = 0
    yeni_seri = 0
    kodlar: list[str] = []
    depo_delta: dict[str, int] = {}
    for r in data.satirlar:
        kod = normalize_stok_kodu(r.stok_kodu)
        adet = int(r.adet) if r.adet else 0
        if not kod or adet <= 0:
            continue
        adet = min(adet, 1000)
        stok = stok_idx.get(kod)
        if not stok:
            stok = DepoSayimStok(oturum_id=oturum_id, stok_kodu=kod,
                        urun_adi=temizle_metin(r.urun_adi) or kod, sonradan_eklendi=True)
            db.add(stok); db.flush()
            stok_idx[kod] = stok; yeni_stok += 1
        for _ in range(adet):
            no = f"SERIYOKRW{sayac:04d}"
            sayac += 1
            db.add(DepoSeri(
                oturum_id=oturum_id, stok_id=stok.id, depo_id=oturum.depo_id,
                seri_no=no, seri_no_norm=no,
                sayildi=True, sayim_tarihi=simdi, sayan_id=user.id,
                sonradan_eklendi=True,
            ))
            yeni_seri += 1
            kodlar.append(no)
        if oturum.depo_id:
            depo_delta[kod] = depo_delta.get(kod, 0) + adet
    if oturum.depo_id:
        for kod, delta in depo_delta.items():
            _depo_stok_arttir(db, oturum.depo_id, kod, stok_idx[kod].urun_adi, delta)
    audit(db, "serisiz_giris", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum_id,
          detay={"yeni_stok": yeni_stok, "yeni_seri": yeni_seri}, request=request)
    db.commit()
    if yeni_seri:
        await manager.broadcast(oturum_id, {"tip": "serbest_guncelleme", "kullanici": user.ad})
    return {"yeni_stok": yeni_stok, "yeni_seri": yeni_seri, "kodlar": kodlar}


@router.delete("/seri/{seri_id}", dependencies=[Depends(hiz_limiti("seri_sil", 30, 60))])
async def seri_sil(seri_id: int, request: Request,
                   db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    """Yanlislikla okutulan seriyi geri alir. Sadece sonradan (elle/tarama disi) eklenmis serilerde calisir."""
    s = db.get(DepoSeri, seri_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seri yok")
    _kontrol(db, s.oturum_id)
    if not s.sonradan_eklendi:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bu seri excel importundan geldi, geri alinamaz")
    oturum_id = s.oturum_id
    stok_id = s.stok_id
    seri_no = s.seri_no
    depo_id = s.depo_id
    sayildi = s.sayildi
    stok_kodu = s.stok.stok_kodu
    db.delete(s)
    if depo_id and sayildi:
        _depo_stok_azalt(db, depo_id, stok_kodu)
    audit(db, "seri_sil", kullanici=user, kaynak_tip="seri", kaynak_id=seri_id,
          detay={"stok_id": stok_id, "seri": seri_no}, request=request)
    db.commit()
    kalan = db.scalar(
        select(func.count(DepoSeri.id)).where(and_(DepoSeri.stok_id == stok_id, DepoSeri.sayildi == True))
    ) or 0
    await manager.broadcast(oturum_id, {"tip": "serbest_guncelleme", "kullanici": user.ad})
    return {"silindi": True, "kalan": kalan}


class SeriYenidenAdIn(BaseModel):
    seri_no: str


@router.patch("/seri/{seri_id}", response_model=SeriOut)
def seri_yeniden_adlandir(seri_id: int, data: SeriYenidenAdIn, request: Request,
                          db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    s = db.get(DepoSeri, seri_id)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Seri yok")
    _kontrol(db, s.oturum_id)
    yeni = temizle_metin(data.seri_no)
    norm = normalize_seri(yeni)
    if not norm:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seri bos olamaz")
    cak = db.execute(
        select(DepoSeri).where(and_(DepoSeri.stok_id == s.stok_id, DepoSeri.seri_no_norm == norm, DepoSeri.id != seri_id))
    ).scalar_one_or_none()
    if cak:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bu seri zaten kayitli")
    eski = s.seri_no
    s.seri_no = yeni
    s.seri_no_norm = norm
    audit(db, "seri_yeniden_adlandir", kullanici=user, kaynak_tip="seri", kaynak_id=s.id,
          detay={"stok_id": s.stok_id, "eski": eski, "yeni": yeni}, request=request)
    db.commit(); db.refresh(s)
    return _serileri_doldur([s], db)[0]


class TopluSeriIn(BaseModel):
    oturum_id: int
    seri_no_listesi: list[str]
    not_alani: str | None = None


class TopluZimmetIn(TopluSeriIn):
    kullanici_id: int


def _seri_bul(db: Session, oturum_id: int, seri_no_listesi: list[str]) -> tuple[list[DepoSeri], list[str]]:
    norm_to_raw: dict[str, str] = {}
    for s in seri_no_listesi:
        norm = normalize_seri(s)
        if norm and norm not in norm_to_raw:
            norm_to_raw[norm] = s
    if not norm_to_raw:
        return [], []
    rows = db.execute(
        select(DepoSeri).where(and_(DepoSeri.oturum_id == oturum_id, DepoSeri.seri_no_norm.in_(norm_to_raw.keys())))
    ).scalars().all()
    bulunan_normlar = {r.seri_no_norm for r in rows}
    bulunamadi = [raw for norm, raw in norm_to_raw.items() if norm not in bulunan_normlar]
    return list(rows), bulunamadi


@router.post("/sayim/{oturum_id}/toplu-cikis")
def toplu_cikis(oturum_id: int, data: TopluSeriIn, request: Request,
                db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    if data.oturum_id != oturum_id:
        raise HTTPException(400, "Oturum id uyusmuyor")
    _kontrol(db, oturum_id)
    seriler, bulunamadi = _seri_bul(db, oturum_id, data.seri_no_listesi)
    zaman = utc_now()
    isaretlenen = 0; zaten = 0
    for s in seriler:
        if s.cikis_zaman:
            zaten += 1; continue
        s.cikis_zaman = zaman
        s.cikis_kullanici_id = user.id
        s.cikis_notu = data.not_alani
        isaretlenen += 1
    audit(db, "toplu_cikis", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum_id,
          detay={"isaretlenen": isaretlenen, "zaten": zaten,
                 "bulunamadi": len(bulunamadi)}, request=request)
    db.commit()
    return {"isaretlenen": isaretlenen, "zaten_cikis": zaten,
            "bulunamadi": bulunamadi}


@router.post("/sayim/{oturum_id}/toplu-zimmet")
def toplu_zimmet(oturum_id: int, data: TopluZimmetIn, request: Request,
                 db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    raise HTTPException(
        status.HTTP_410_GONE,
        "Depo kullanicisi hedefli eski zimmet akisi kapatildi. Calisan Zimmet ekranini kullanin.",
    )
    if data.oturum_id != oturum_id:
        raise HTTPException(400, "Oturum id uyusmuyor")
    _kontrol(db, oturum_id)
    hedef = db.get(DepoUser, data.kullanici_id)
    if not hedef:
        raise HTTPException(404, "Zimmet hedefi yok")
    seriler, bulunamadi = _seri_bul(db, oturum_id, data.seri_no_listesi)
    zaman = utc_now()
    zimmetlenen = 0; zaten = 0
    for s in seriler:
        if s.zimmet_kullanici_id:
            zaten += 1; continue
        s.zimmet_kullanici_id = hedef.id
        s.zimmet_zaman = zaman
        s.zimmet_notu = data.not_alani
        zimmetlenen += 1
    audit(db, "toplu_zimmet", kullanici=user, kaynak_tip="user", kaynak_id=hedef.id,
          detay={"oturum": oturum_id, "zimmetlenen": zimmetlenen, "zaten": zaten,
                 "bulunamadi": len(bulunamadi), "hedef": hedef.ad}, request=request)
    db.commit()
    return {"zimmetlenen": zimmetlenen, "zaten_zimmette": zaten,
            "bulunamadi": bulunamadi, "hedef": hedef.ad}


@router.post("/sayim/{oturum_id}/toplu-iade")
def toplu_iade(oturum_id: int, data: TopluSeriIn, request: Request,
               db: Session = Depends(get_db), user: DepoUser = Depends(current_depo_user)):
    raise HTTPException(
        status.HTTP_410_GONE,
        "Eski zimmet iade akisi kapatildi. Calisan Zimmet ekranini kullanin.",
    )
    if data.oturum_id != oturum_id:
        raise HTTPException(400, "Oturum id uyusmuyor")
    _kontrol(db, oturum_id)
    seriler, bulunamadi = _seri_bul(db, oturum_id, data.seri_no_listesi)
    iade = 0; zimmette_degil = 0
    for s in seriler:
        if not s.zimmet_kullanici_id:
            zimmette_degil += 1; continue
        s.zimmet_kullanici_id = None
        s.zimmet_zaman = None
        s.zimmet_notu = None
        iade += 1
    audit(db, "toplu_iade", kullanici=user, kaynak_tip="oturum", kaynak_id=oturum_id,
          detay={"iade": iade, "zimmette_degil": zimmette_degil,
                 "bulunamadi": len(bulunamadi)}, request=request)
    db.commit()
    return {"iade": iade, "zimmette_olmayan": zimmette_degil, "bulunamadi": bulunamadi}
