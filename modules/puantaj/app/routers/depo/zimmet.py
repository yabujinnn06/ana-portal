"""Calisana barkodla zimmet verme, iade ve hareket kontrolu."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Department,
    DepoDepo,
    DepoSayimStok,
    DepoSeri,
    DepoUser,
    DepoZimmetHareketi,
    Employee,
    SayimOturumu,
)
from datetime import datetime, timezone

from app.routers.depo.stok_yonetim import _sonraki_serisiz_no
from app.services.depo_audit import audit
from app.services.depo_auth import current_depo_user, require_depo_admin
from app.services.depo_utils import (
    depo_tz,
    local_day_bounds_utc_naive,
    normalize_seri,
    normalize_stok_kodu,
    parse_barkod,
    temizle_metin,
    utc_now,
)

router = APIRouter(prefix="/zimmet", tags=["depo-zimmet"])

_HIZLI_OTURUM_MOD = "hizli"
_HIZLI_OTURUM_AD = "Hızlı Zimmet (sistem)"


def _hizli_oturum(db: Session, user: DepoUser) -> SayimOturumu:
    """Sayim oturumu / depo secmeden hizli zimmet icin tek seferlik sistem oturumu.

    DepoSeri.oturum_id NOT NULL oldugu icin (FK zorunlu) hizli zimmetin de bir oturuma
    baglanmasi gerekiyor; bu oturum depo_id=None ve mod='hizli' ile normal sayim
    akisindan ayri tutuluyor, list_oturumlar bu modu filtreleyip gizliyor.
    """
    oturum = db.execute(
        select(SayimOturumu).where(SayimOturumu.mod == _HIZLI_OTURUM_MOD)
    ).scalars().first()
    if oturum:
        return oturum
    oturum = SayimOturumu(
        ad=_HIZLI_OTURUM_AD, mod=_HIZLI_OTURUM_MOD, durum="aktif",
        olusturan_id=user.id, depo_id=None,
    )
    db.add(oturum)
    db.flush()
    return oturum


class BarkodKontrolIn(BaseModel):
    barkod: str


class ZimmetAtaIn(BaseModel):
    employee_id: int
    seri_ids: list[int] = Field(min_length=1, max_length=250)
    notu: str | None = Field(default=None, max_length=1000)
    devir_onaylandi: bool = False


class HizliZimmetIn(BaseModel):
    employee_id: int
    stok_kodu: str = Field(min_length=1, max_length=64)
    urun_adi: str | None = Field(default=None, max_length=200)
    seri_no: str | None = Field(default=None, max_length=120)
    notu: str | None = Field(default=None, max_length=1000)


class ZimmetIadeIn(BaseModel):
    seri_ids: list[int] = Field(min_length=1, max_length=250)
    notu: str | None = Field(default=None, max_length=1000)


def _seri_read(seri: DepoSeri, stok: DepoSayimStok, depo: DepoDepo | None, employee: Employee | None) -> dict:
    return {
        "seri_id": seri.id,
        "seri_no": seri.seri_no,
        "stok_kodu": stok.stok_kodu,
        "urun_adi": stok.urun_adi,
        "depo_id": seri.depo_id,
        "depo_ad": depo.ad if depo else None,
        "zimmet_employee_id": seri.zimmet_employee_id,
        "zimmet_employee_ad": employee.full_name if employee else None,
        "zimmet_zaman": seri.zimmet_zaman,
        "zimmet_notu": seri.zimmet_notu,
    }


def _seri_rows(db: Session, condition):
    return db.execute(
        select(DepoSeri, DepoSayimStok, DepoDepo, Employee)
        .join(DepoSayimStok, DepoSayimStok.id == DepoSeri.stok_id)
        .outerjoin(DepoDepo, DepoDepo.id == DepoSeri.depo_id)
        .outerjoin(Employee, Employee.id == DepoSeri.zimmet_employee_id)
        .where(condition)
        .order_by(DepoSayimStok.urun_adi, DepoSeri.seri_no)
    ).all()


@router.get("/ozet")
def ozet(db: Session = Depends(get_db), _: DepoUser = Depends(current_depo_user)) -> dict:
    toplam = db.scalar(select(func.count(DepoSeri.id)).where(DepoSeri.zimmet_employee_id.isnot(None))) or 0
    calisan = db.scalar(
        select(func.count(func.distinct(DepoSeri.zimmet_employee_id))).where(
            DepoSeri.zimmet_employee_id.isnot(None)
        )
    ) or 0
    bugun_yerel = datetime.now(timezone.utc).astimezone(depo_tz()).date()
    start_utc, end_utc = local_day_bounds_utc_naive(bugun_yerel)
    bugun_hareket = db.scalar(
        select(func.count(DepoZimmetHareketi.id)).where(
            DepoZimmetHareketi.zaman >= start_utc,
            DepoZimmetHareketi.zaman < end_utc,
        )
    ) or 0
    return {"zimmetli_urun": int(toplam), "zimmetli_calisan": int(calisan), "bugun_hareket": int(bugun_hareket)}


@router.get("/calisanlar")
def calisanlar(
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
    _: DepoUser = Depends(current_depo_user),
) -> list[dict]:
    zimmet_sayisi = (
        select(func.count(DepoSeri.id))
        .where(DepoSeri.zimmet_employee_id == Employee.id)
        .correlate(Employee)
        .scalar_subquery()
    )
    stmt = (
        select(Employee, Department.name, zimmet_sayisi.label("zimmet_sayisi"))
        .outerjoin(Department, Department.id == Employee.department_id)
        .where(Employee.is_active == True)
        .order_by(Employee.full_name)
        .limit(100)
    )
    if q and q.strip():
        needle = f"%{q.strip()}%"
        stmt = stmt.where(or_(Employee.full_name.ilike(needle), Department.name.ilike(needle)))
    return [
        {"id": employee.id, "ad": employee.full_name, "departman": departman, "zimmet_sayisi": int(sayi or 0)}
        for employee, departman, sayi in db.execute(stmt).all()
    ]


@router.post("/barkod-kontrol")
def barkod_kontrol(
    data: BarkodKontrolIn,
    db: Session = Depends(get_db),
    _: DepoUser = Depends(current_depo_user),
) -> dict:
    parsed = parse_barkod(data.barkod)
    keys = [normalize_seri(key) for key in parsed.keys if normalize_seri(key)]
    if not keys:
        raise HTTPException(400, "Barkod veya seri numarasi bos olamaz")
    rows = _seri_rows(db, DepoSeri.seri_no_norm.in_(keys))
    return {
        "barkod": data.barkod,
        "sonuclar": [_seri_read(seri, stok, depo, employee) for seri, stok, depo, employee in rows],
    }


@router.post("/ata")
def ata(
    data: ZimmetAtaIn,
    request: Request,
    db: Session = Depends(get_db),
    user: DepoUser = Depends(current_depo_user),
) -> dict:
    employee = db.get(Employee, data.employee_id)
    if not employee or not employee.is_active:
        raise HTTPException(404, "Aktif calisan bulunamadi")
    ids = list(dict.fromkeys(data.seri_ids))
    seriler = db.execute(select(DepoSeri).where(DepoSeri.id.in_(ids)).with_for_update()).scalars().all()
    if len(seriler) != len(ids):
        raise HTTPException(404, "Secilen urunlerden biri artik bulunamiyor")
    baskasinda = [s.id for s in seriler if s.zimmet_employee_id not in (None, employee.id)]
    if baskasinda and not data.devir_onaylandi:
        raise HTTPException(409, "Urunlerden biri baska bir calisanda. Devir icin onay gerekli.")

    zaman = utc_now()
    atanan = 0
    ayni = 0
    devir = 0
    for seri in seriler:
        onceki = seri.zimmet_employee_id
        if onceki == employee.id:
            ayni += 1
            continue
        islem = "devir" if onceki else "zimmet"
        if onceki:
            devir += 1
        seri.zimmet_employee_id = employee.id
        seri.zimmet_kullanici_id = None
        seri.zimmet_zaman = zaman
        seri.zimmet_notu = data.notu
        db.add(DepoZimmetHareketi(
            seri_id=seri.id,
            islem=islem,
            onceki_employee_id=onceki,
            employee_id=employee.id,
            employee_ad=employee.full_name,
            yapan_depo_user_id=user.id,
            zaman=zaman,
            notu=data.notu,
        ))
        atanan += 1
    audit(
        db,
        "calisana_zimmet",
        kullanici=user,
        kaynak_tip="employee",
        kaynak_id=employee.id,
        detay={"employee_ad": employee.full_name, "atanan": atanan, "devir": devir, "ayni": ayni},
        request=request,
    )
    return {"atanan": atanan, "devir": devir, "zaten_ayni_calisanda": ayni, "calisan": employee.full_name}


@router.post("/hizli")
def hizli_zimmet(
    data: HizliZimmetIn,
    request: Request,
    db: Session = Depends(get_db),
    user: DepoUser = Depends(require_depo_admin),
) -> dict:
    """Sayim oturumu ve depo secmeden, admin onayiyla dogrudan calisana zimmet olusturur."""
    employee = db.get(Employee, data.employee_id)
    if not employee or not employee.is_active:
        raise HTTPException(404, "Aktif calisan bulunamadi")
    kod = normalize_stok_kodu(data.stok_kodu)
    if not kod:
        raise HTTPException(400, "Stok kodu bos olamaz")

    oturum = _hizli_oturum(db, user)
    stok = db.execute(
        select(DepoSayimStok).where(
            DepoSayimStok.oturum_id == oturum.id, DepoSayimStok.stok_kodu == kod
        )
    ).scalar_one_or_none()
    if not stok:
        stok = DepoSayimStok(
            oturum_id=oturum.id, stok_kodu=kod,
            urun_adi=temizle_metin(data.urun_adi) or kod, sonradan_eklendi=True,
        )
        db.add(stok)
        db.flush()

    seri_girisi = temizle_metin(data.seri_no)
    if seri_girisi:
        norm = normalize_seri(seri_girisi)
        mevcut = db.execute(
            select(DepoSeri).where(DepoSeri.stok_id == stok.id, DepoSeri.seri_no_norm == norm)
        ).scalar_one_or_none()
        if mevcut:
            raise HTTPException(409, "Bu seri bu stokta zaten kayitli")
        seri_no = seri_girisi
    else:
        sayac = _sonraki_serisiz_no(db, oturum.id, None)
        seri_no = f"SERIYOKRW{sayac:04d}"
        norm = seri_no

    zaman = utc_now()
    seri = DepoSeri(
        oturum_id=oturum.id, stok_id=stok.id, depo_id=None,
        seri_no=seri_no, seri_no_norm=norm,
        sayildi=True, sayim_tarihi=zaman, sayan_id=user.id,
        sonradan_eklendi=True,
        zimmet_employee_id=employee.id, zimmet_zaman=zaman, zimmet_notu=data.notu,
    )
    db.add(seri)
    db.flush()

    db.add(DepoZimmetHareketi(
        seri_id=seri.id, islem="zimmet", onceki_employee_id=None,
        employee_id=employee.id, employee_ad=employee.full_name,
        yapan_depo_user_id=user.id, zaman=zaman, notu=data.notu,
    ))
    audit(
        db, "hizli_zimmet", kullanici=user, kaynak_tip="employee", kaynak_id=employee.id,
        detay={"employee_ad": employee.full_name, "stok_kodu": kod, "seri_no": seri_no},
        request=request,
    )
    db.commit()
    return {
        "seri_id": seri.id, "seri_no": seri_no, "stok_kodu": kod,
        "urun_adi": stok.urun_adi, "calisan": employee.full_name,
    }


@router.post("/iade")
def iade(
    data: ZimmetIadeIn,
    request: Request,
    db: Session = Depends(get_db),
    user: DepoUser = Depends(current_depo_user),
) -> dict:
    ids = list(dict.fromkeys(data.seri_ids))
    seriler = db.execute(select(DepoSeri).where(DepoSeri.id.in_(ids)).with_for_update()).scalars().all()
    if len(seriler) != len(ids):
        raise HTTPException(404, "Secilen urunlerden biri artik bulunamiyor")
    employee_ids = {s.zimmet_employee_id for s in seriler if s.zimmet_employee_id}
    employees = {
        e.id: e for e in db.execute(select(Employee).where(Employee.id.in_(employee_ids))).scalars().all()
    } if employee_ids else {}
    zaman = utc_now()
    alinan = 0
    bos = 0
    for seri in seriler:
        onceki = seri.zimmet_employee_id
        if not onceki:
            bos += 1
            continue
        emp = employees.get(onceki)
        db.add(DepoZimmetHareketi(
            seri_id=seri.id,
            islem="iade",
            onceki_employee_id=onceki,
            employee_id=None,
            employee_ad=emp.full_name if emp else None,
            yapan_depo_user_id=user.id,
            zaman=zaman,
            notu=data.notu,
        ))
        seri.zimmet_employee_id = None
        seri.zimmet_kullanici_id = None
        seri.zimmet_zaman = None
        seri.zimmet_notu = None
        alinan += 1
    audit(
        db,
        "zimmet_iade",
        kullanici=user,
        kaynak_tip="seri",
        detay={"iade": alinan, "zimmette_degil": bos},
        request=request,
    )
    return {"iade": alinan, "zimmette_olmayan": bos}


@router.get("/calisan/{employee_id}")
def calisan_detay(
    employee_id: int,
    db: Session = Depends(get_db),
    _: DepoUser = Depends(current_depo_user),
) -> dict:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(404, "Calisan bulunamadi")
    rows = _seri_rows(db, DepoSeri.zimmet_employee_id == employee_id)
    hareketler = db.execute(
        select(DepoZimmetHareketi, DepoSeri, DepoSayimStok, DepoUser)
        .join(DepoSeri, DepoSeri.id == DepoZimmetHareketi.seri_id)
        .join(DepoSayimStok, DepoSayimStok.id == DepoSeri.stok_id)
        .outerjoin(DepoUser, DepoUser.id == DepoZimmetHareketi.yapan_depo_user_id)
        .where(or_(
            DepoZimmetHareketi.employee_id == employee_id,
            DepoZimmetHareketi.onceki_employee_id == employee_id,
        ))
        .order_by(DepoZimmetHareketi.zaman.desc())
        .limit(100)
    ).all()
    return {
        "calisan": {"id": employee.id, "ad": employee.full_name},
        "zimmetler": [_seri_read(seri, stok, depo, emp) for seri, stok, depo, emp in rows],
        "hareketler": [
            {
                "id": hareket.id,
                "islem": hareket.islem,
                "zaman": hareket.zaman,
                "seri_id": seri.id,
                "seri_no": seri.seri_no,
                "stok_kodu": stok.stok_kodu,
                "urun_adi": stok.urun_adi,
                "yapan": yapan.ad if yapan else None,
                "notu": hareket.notu,
            }
            for hareket, seri, stok, yapan in hareketler
        ],
    }
