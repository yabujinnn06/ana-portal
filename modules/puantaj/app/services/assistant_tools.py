"""Puantaj Beyni asistaninin "arac" katmani.

LLM'in cagirabilecegi okuma araclarinin sema tanimi (TOOLS), handler'lari ve
ortak bicimlendirme/Turkce-katlama yardimcilari. Veri her zaman buradaki
servislerden gelir; model uydurmaz. Ozluk ve konum bilgisi bu araclarda YOKTUR.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Department,
    DepartmentShift,
    Device,
    Employee,
    Leave,
    LeaveStatus,
    Region,
    SpecialDay,
    WorkRule,
)
from app.services.attendance_board import build_daily_attendance_board
from app.services.monthly import (
    _employee_monthly_from_model,
    calculate_department_monthly_summary,
    calculate_employee_monthly,
)
from app.settings import get_settings

logger = logging.getLogger(__name__)


def _fmt_minutes(minutes: int | None) -> str:
    total = int(minutes or 0)
    sign = "-" if total < 0 else ""
    total = abs(total)
    return f"{sign}{total // 60} sa {total % 60} dk"


def _fmt_local_time(ts: datetime | None) -> str | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(ZoneInfo(get_settings().attendance_timezone)).strftime("%H:%M")


# Aylik rapor gun durumu -> Turkce.
_DAY_STATUS_TR = {
    "OK": "tam",
    "INCOMPLETE": "eksik",
    "LEAVE": "izinli",
    "OFF": "tatil/calisma gunu degil",
}

# Izin turu / durumu -> Turkce.
_LEAVE_TYPE_TR = {
    "ANNUAL": "yillik izin",
    "SICK": "hastalik/rapor",
    "UNPAID": "ucretsiz izin",
    "EXCUSE": "mazeret izni",
    "PUBLIC_HOLIDAY": "resmi tatil",
}
_LEAVE_STATUS_TR = {
    "APPROVED": "onayli",
    "PENDING": "bekliyor",
    "REJECTED": "reddedildi",
}

# Gunluk pano durumu -> Turkce.
_BOARD_STATUS_TR = {
    "OFF": "tatil/izinli (calisma gunu degil)",
    "NOT_STARTED": "henuz giris yok",
    "ABSENT_RISK": "gelmeme riski",
    "ABSENT": "gelmedi",
    "IN_PROGRESS": "calisiyor (icerde)",
    "OPEN_OVERDUE": "cikis yapmadi (acik)",
    "FINISHED": "isi bitti (cikti)",
}


# Turkce karakterleri ASCII'ye katlayip kucuk harfe cevirir (i/I, s, g, c, o, u).
_TR_FOLD = str.maketrans(
    {
        "ı": "i", "İ": "i", "I": "i",
        "ş": "s", "Ş": "s",
        "ğ": "g", "Ğ": "g",
        "ç": "c", "Ç": "c",
        "ö": "o", "Ö": "o",
        "ü": "u", "Ü": "u",
    }
)


def _fold(text: str) -> str:
    return (text or "").translate(_TR_FOLD).lower().strip()


def _now_local() -> datetime:
    return datetime.now(ZoneInfo(get_settings().attendance_timezone))


TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "calisan_ara",
            "description": (
                "Isimle calisan arar ve id dondurur. Buyuk/kucuk harf ve Turkce karakter farki onemsiz, "
                "parca eslesme yeter (orn. 'ahmet' -> 'Ahmet Yilmaz'). Bir calisan adi gecen her soruda "
                "once bunu cagir; sonra donen id ile kisi_aylik_ozet kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Isim veya isim parcasi. Bos birakilirsa tum (aktif) calisanlar listelenir.",
                    },
                    "include_inactive": {
                        "type": "boolean",
                        "description": "Pasif calisanlar da listelensin mi (varsayilan false).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kisi_aylik_ozet",
            "description": "Bir calisanin belirli yil/aydaki puantaj ve fazla mesai ozetini dondurur.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "integer", "description": "calisan_ara'dan donen id."},
                    "year": {"type": "integer", "description": "Yil, orn. 2026."},
                    "month": {"type": "integer", "description": "Ay (1-12)."},
                },
                "required": ["employee_id", "year", "month"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "kisi_detay",
            "description": (
                "Bir calisanin OPERASYONEL bilgileri: departman, bolge, vardiya, haftalik sozlesme saati, "
                "izinler, cihaz sayisi, mesai kurali. OZLUK (TC, SGK, dogum, cinsiyet, maas, banka, acil kisi, "
                "sozlesme tipi, ise giris) ve KONUM ICERMEZ; bunlar paylasilmaz."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "integer", "description": "calisan_ara'dan donen id."},
                },
                "required": ["employee_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "departman_aylik_ozet",
            "description": "Departman(lar)in belirli yil/aydaki toplam calisma ve fazla mesai ozetini dondurur.",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "description": "Yil, orn. 2026."},
                    "month": {"type": "integer", "description": "Ay (1-12)."},
                    "department_id": {
                        "type": "integer",
                        "description": "Belirli bir departman icin id. Bos birakilirsa tum departmanlar.",
                    },
                },
                "required": ["year", "month"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sirket_kisi_fazla_mesai",
            "description": (
                "Sirket genelinde HER calisanin belirli yil/aydaki fazla mesaisini KISI BAZLI, "
                "fazla mesaisi en cok olandan aza dogru sirali liste olarak dondurur. "
                "'tum departmanlardaki calisanlarin fazla mesaisini teker teker goster' gibi "
                "kisi-bazli, sirket-geneli siralama sorulari icin bunu kullan. "
                "Opsiyonel department filtresiyle tek bir departmana daraltilabilir."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "description": "Yil, orn. 2026."},
                    "month": {"type": "integer", "description": "Ay (1-12)."},
                    "department_id": {
                        "type": "integer",
                        "description": "Belirli bir departmana daraltmak icin id. Bos = tum sirket.",
                    },
                },
                "required": ["year", "month"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "gunluk_puantaj",
            "description": (
                "Bir calisanin belirli yil/aydaki GUN GUN puantaji: her gun giris/cikis saati, net calisma, "
                "gunluk fazla mesai, gun tipi, izin. Hangi gun geldi/gelmedi turu sorular icin kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "integer", "description": "calisan_ara'dan donen id."},
                    "year": {"type": "integer", "description": "Yil, orn. 2026."},
                    "month": {"type": "integer", "description": "Ay (1-12)."},
                },
                "required": ["employee_id", "year", "month"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "departman_listesi",
            "description": "Tum departmanlari, bagli oldugu bolgeyi ve calisan sayilarini listeler.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "vardiya_listesi",
            "description": "Vardiyalari (ad, departman, baslangic/bitis saati, mola) listeler.",
            "parameters": {
                "type": "object",
                "properties": {
                    "department_id": {
                        "type": "integer",
                        "description": "Belirli bir departmanin vardiyalari icin id. Bos birakilirsa tum vardiyalar.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mesai_kurallari",
            "description": (
                "Departmanlarin mesai kurallarini listeler: gunluk planlanan sure, mola, giris toleransi, "
                "fazla mesai toleransi, net mesai esigi."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department_id": {
                        "type": "integer",
                        "description": "Belirli bir departman icin id. Bos birakilirsa tum departmanlar.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "resmi_tatiller",
            "description": "Tanimli resmi tatil / ozel gunleri (tarih, ad, tur, calisma politikasi) listeler.",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {"type": "integer", "description": "Yil. Bos birakilirsa tum tanimli gunler."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bugun_durumu",
            "description": (
                "Belirli bir gun (varsayilan bugun) icin yoklama panosu: kim calisiyor, isi bitti, gelmedi, "
                "henuz giris yapmadi. Ozet sayilar + kisi listesi (konum YOK). 'Bugun kim geldi/gelmedi' icin kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target_date": {
                        "type": ["string", "null"],
                        "description": "Gun, YYYY-MM-DD. Bos birakilirsa bugun.",
                    },
                    "department_id": {
                        "type": ["integer", "null"],
                        "description": "Belirli bir departmanla sinirlamak icin id. Bos = tum sirket.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sirket_ozeti",
            "description": (
                "Sirket geneli ozet: toplam/aktif calisan, departman ve bolge sayisi, bugun calisan/biten/"
                "gelmeyen sayilari."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "izin_listesi",
            "description": (
                "Izinleri listeler (yillik/hastalik/ucretsiz/mazeret/resmi tatil). Kisi, departman, durum "
                "ve donem ile filtrelenebilir. 'Kim izinli', 'bu ay izinler', 'X'in izinleri' icin kullan. "
                "Donem (year+month) verilmezse bugun ve sonrasi (devam eden + yaklasan) izinler doner."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {
                        "type": ["integer", "null"],
                        "description": "Belirli bir calisanin izinleri icin id (calisan_ara'dan).",
                    },
                    "department_id": {
                        "type": ["integer", "null"],
                        "description": "Departman id'si ya da departman adi/parcasi ile filtre. Bos = tum sirket.",
                    },
                    "status": {
                        "type": ["string", "null"],
                        "description": "Durum: APPROVED (onayli), PENDING (bekleyen), REJECTED (reddedilen). Bos = onayli.",
                    },
                    "year": {"type": ["integer", "null"], "description": "Donem yili (ay ile birlikte)."},
                    "month": {"type": ["integer", "null"], "description": "Donem ayi 1-12 (yil ile birlikte)."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "departman_calisanlari",
            "description": (
                "Bir departmandaki calisanlari listeler (ad, vardiya, aktiflik). 'X departmaninda kimler var', "
                "'su departmanin calisanlari' icin kullan. department_id'ye departman adi/parcasi da yazilabilir."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "department_id": {
                        "type": ["integer", "string", "null"],
                        "description": "Departman id'si ya da adi/parcasi (orn. 'teknik servis').",
                    },
                    "include_inactive": {
                        "type": ["boolean", "null"],
                        "description": "Pasif calisanlar da listelensin mi (varsayilan false).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "eksik_gunler",
            "description": (
                "Bir calisanin belirli yil/aydaki EKSIK gunlerini (giris ya da cikis eksik olan gunler) "
                "gun gun listeler. 'Hangi gun giris/cikis eksik', 'eksik gunleri' icin kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_id": {"type": "integer", "description": "calisan_ara'dan donen id."},
                    "year": {"type": "integer", "description": "Yil, orn. 2026."},
                    "month": {"type": "integer", "description": "Ay (1-12)."},
                },
                "required": ["employee_id", "year", "month"],
            },
        },
    },
]


def _make_optional_params_nullable(tools: list[dict[str, Any]]) -> None:
    # Groq, uretilen tool call'u sema ile dogrular. Model opsiyonel bir parametreyi
    # atlayinca null yolluyor; "integer"/"string" tipi null'i reddedip 400 donduruyor.
    # Bu yuzden required olmayan her parametrenin tipine "null" ekliyoruz.
    for tool in tools:
        params = tool["function"]["parameters"]
        required = set(params.get("required", []))
        for name, schema in params.get("properties", {}).items():
            if name in required:
                continue
            t = schema.get("type")
            types = [t] if isinstance(t, str) else list(t or [])
            if "null" not in types:
                types.append("null")
            # Departman filtresi: model id'yi bilmeyip ad yazabilir; string'e de izin ver
            # ki Groq 400 (tool_use_failed) vermesin, server tarafinda cozelim.
            if name == "department_id" and "string" not in types:
                types.append("string")
            schema["type"] = types


_make_optional_params_nullable(TOOLS)


def _tool_calisan_ara(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    query = (args.get("query") or "").strip()
    include_inactive = bool(args.get("include_inactive"))
    stmt = select(Employee).options(selectinload(Employee.department)).order_by(Employee.full_name.asc())
    if not include_inactive:
        stmt = stmt.where(Employee.is_active.is_(True))
    rows = list(db.scalars(stmt).all())

    # Turkce-duyarli, parca-eslesmeli arama: her token isimde gecmeli.
    tokens = _fold(query).split()
    if tokens:
        rows = [e for e in rows if all(tok in _fold(e.full_name) for tok in tokens)]

    rows = rows[:25]
    return {
        "count": len(rows),
        "not": "Sonuc bos ise (count=0) kisiyi uydurma; kullanicidan dogru yazim ya da ID iste.",
        "calisanlar": [
            {
                "id": e.id,
                "ad_soyad": e.full_name,
                "departman": e.department.name if e.department else None,
                "aktif": e.is_active,
            }
            for e in rows
        ],
    }


def _tool_kisi_aylik_ozet(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    employee_id = int(args["employee_id"])
    year = int(args["year"])
    month = int(args["month"])
    employee = db.scalar(
        select(Employee).options(selectinload(Employee.department)).where(Employee.id == employee_id)
    )
    if employee is None:
        return {"hata": f"id={employee_id} calisan bulunamadi."}
    report = calculate_employee_monthly(db, employee_id=employee_id, year=year, month=month)
    t = report.totals
    return {
        "calisan": {
            "id": employee.id,
            "ad_soyad": employee.full_name,
            "departman": employee.department.name if employee.department else None,
        },
        "donem": f"{year}-{month:02d}",
        "calisma": {
            "net": _fmt_minutes(report.worked_minutes_net),
            "brut": _fmt_minutes(t.worked_minutes),
            "mola_dususu": _fmt_minutes(t.break_taken_minutes),
            "eksik_gun": t.incomplete_days,
        },
        "fazla_mesai": {
            "toplam": _fmt_minutes(t.overtime_minutes),
            "plan_fazla_mesai": _fmt_minutes(t.plan_overtime_minutes),
            "yasal_fazla_mesai": _fmt_minutes(t.legal_overtime_minutes),
            "fazla_surelerle_calisma": _fmt_minutes(t.legal_extra_work_minutes),
            "fm1": _fmt_minutes(t.fm1_minutes),
            "fm2": _fmt_minutes(t.fm2_minutes),
            "fm3": _fmt_minutes(t.fm3_minutes),
        },
        "ozel_gunler": {
            "pazar_calismasi": _fmt_minutes(t.sunday_work_minutes),
            "hafta_tatili_calismasi": _fmt_minutes(t.weekly_rest_work_minutes),
            "resmi_tatil_calismasi": _fmt_minutes(t.special_day_work_minutes),
        },
        "yillik_fazla_mesai": {
            "kullanilan": _fmt_minutes(report.annual_overtime_used_minutes),
            "kalan": _fmt_minutes(report.annual_overtime_remaining_minutes),
            "yillik_limit_asildi": report.annual_overtime_cap_exceeded,
        },
    }


def _tool_kisi_detay(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    employee_id = int(args["employee_id"])
    employee = db.scalar(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.region), selectinload(Employee.shift))
        .where(Employee.id == employee_id)
    )
    if employee is None:
        return {"hata": f"id={employee_id} calisan bulunamadi."}

    work_rule = None
    if employee.department_id is not None:
        work_rule = db.scalar(select(WorkRule).where(WorkRule.department_id == employee.department_id))

    leaves = list(
        db.scalars(
            select(Leave)
            .where(Leave.employee_id == employee_id)
            .order_by(Leave.start_date.desc())
            .limit(10)
        ).all()
    )
    total_devices = db.scalar(
        select(func.count()).select_from(Device).where(Device.employee_id == employee_id)
    )
    active_devices = db.scalar(
        select(func.count())
        .select_from(Device)
        .where(Device.employee_id == employee_id, Device.is_active.is_(True))
    )

    detay: dict[str, Any] = {
        "kimlik": {
            "id": employee.id,
            "ad_soyad": employee.full_name,
            "aktif": employee.is_active,
            "departman": employee.department.name if employee.department else None,
            "bolge": employee.region.name if employee.region else None,
            "vardiya": employee.shift.name if employee.shift else None,
            "haftalik_sozlesme_saati": (
                round(employee.contract_weekly_minutes / 60, 1)
                if employee.contract_weekly_minutes
                else None
            ),
        },
        "cihazlar": {"toplam": int(total_devices or 0), "aktif": int(active_devices or 0)},
        "izinler": [
            {
                "tur": lv.type.value if lv.type else None,
                "durum": lv.status.value if lv.status else None,
                "baslangic": str(lv.start_date),
                "bitis": str(lv.end_date),
                "yarim_gun": lv.half_day,
            }
            for lv in leaves
        ],
    }

    if work_rule is not None:
        detay["mesai_kurali"] = {
            "gunluk_planlanan_dk": work_rule.daily_minutes_planned,
            "mola_dk": work_rule.break_minutes,
            "tolerans_dk": work_rule.grace_minutes,
        }

    detay["not"] = (
        "Ozluk (TC/SGK/dogum/cinsiyet/maas/banka/acil kisi/sozlesme/ise giris) ve konum bilgisi "
        "bu araca dahil degildir ve paylasilamaz."
    )
    return detay


def _resolve_department_id(db: Session, args: dict[str, Any]) -> tuple[int | None, str | None]:
    """Departman filtresini coz: department_id (sayi) ya da departman ADI (metin)
    kabul eder ve Turkce-duyarli, parca-eslesmeli olarak id'ye cevirir.
    Donus: (id, hata). Ikisi de None => filtre yok (tum sirket)."""
    raw = args.get("department_id")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raw = args.get("department")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None, None
    if isinstance(raw, bool):  # JSON true/false yanlislikla gelirse yok say
        return None, None
    if isinstance(raw, int):
        return raw, None
    s = str(raw).strip()
    if s.isdigit():
        return int(s), None
    tokens = _fold(s).split()
    rows = list(db.scalars(select(Department).order_by(Department.name.asc())).all())
    matches = [d for d in rows if tokens and all(tok in _fold(d.name) for tok in tokens)]
    if len(matches) == 1:
        return matches[0].id, None
    if not matches:
        return None, (
            f"'{s}' adinda bir departman bulamadim. departman_listesi aracini cagirip "
            "dogru departman adini bul, sonra tekrar dene."
        )
    names = ", ".join(d.name for d in matches[:8])
    return None, f"'{s}' birden fazla departmanla eslesti: {names}. Hangisini kastettigini netlestir."


def _tool_departman_aylik_ozet(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    year = int(args["year"])
    month = int(args["month"])
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}
    items = calculate_department_monthly_summary(
        db,
        year=year,
        month=month,
        department_id=department_id,
    )
    return {
        "donem": f"{year}-{month:02d}",
        "departmanlar": [
            {
                "id": it.department_id,
                "ad": it.department_name,
                "calisan_sayisi": it.employee_count,
                "toplam_calisma": _fmt_minutes(it.worked_minutes),
                "toplam_fazla_mesai": _fmt_minutes(it.overtime_minutes),
                "plan_fazla_mesai": _fmt_minutes(it.plan_overtime_minutes),
                "yasal_fazla_mesai": _fmt_minutes(it.legal_overtime_minutes),
            }
            for it in items
        ],
    }


def _tool_sirket_kisi_fazla_mesai(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    year = int(args["year"])
    month = int(args["month"])
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}

    employee_stmt = (
        select(Employee)
        .options(selectinload(Employee.department))
        .where(Employee.is_active.is_(True))
        .order_by(Employee.id.asc())
    )
    if department_id is not None:
        employee_stmt = employee_stmt.where(Employee.department_id == department_id)
    employees = list(db.scalars(employee_stmt).all())

    kisiler: list[dict[str, Any]] = []
    for employee in employees:
        result = _employee_monthly_from_model(db, employee, year, month)
        ot = result.totals.overtime_minutes
        kisiler.append(
            {
                "ad_soyad": employee.full_name,
                "departman": employee.department.name if employee.department else "Departmansiz",
                "fazla_mesai": _fmt_minutes(ot),
                "_ot_dk": ot,
            }
        )
    kisiler.sort(key=lambda k: k["_ot_dk"], reverse=True)
    for k in kisiler:
        del k["_ot_dk"]

    return {
        "donem": f"{year}-{month:02d}",
        "kisi_sayisi": len(kisiler),
        "kisiler": kisiler,
    }


def _tool_gunluk_puantaj(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    employee_id = int(args["employee_id"])
    year = int(args["year"])
    month = int(args["month"])
    employee = db.scalar(
        select(Employee).options(selectinload(Employee.department)).where(Employee.id == employee_id)
    )
    if employee is None:
        return {"hata": f"id={employee_id} calisan bulunamadi."}
    report = calculate_employee_monthly(db, employee_id=employee_id, year=year, month=month)
    gunler: list[dict[str, Any]] = []
    for d in report.days:
        entry: dict[str, Any] = {
            "gun": str(d.date),
            "durum": _DAY_STATUS_TR.get(d.status, d.status),
            "giris": _fmt_local_time(d.check_in),
            "cikis": _fmt_local_time(d.check_out),
            "net_calisma": _fmt_minutes(d.worked_minutes) if d.worked_minutes else None,
            "fazla_mesai": _fmt_minutes(d.overtime_minutes) if d.overtime_minutes else None,
            "gun_tipi": d.day_type if d.day_type != "WORKDAY" else None,
            "izin_turu": d.leave_type.value if d.leave_type else None,
            "vardiya": d.shift_name,
        }
        gunler.append({k: v for k, v in entry.items() if v is not None})
    return {
        "calisan": {
            "id": employee.id,
            "ad_soyad": employee.full_name,
            "departman": employee.department.name if employee.department else None,
        },
        "donem": f"{year}-{month:02d}",
        "gunler": gunler,
    }


def _tool_departman_listesi(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    rows = list(
        db.scalars(
            select(Department)
            .options(selectinload(Department.region), selectinload(Department.employees))
            .order_by(Department.name.asc())
        ).all()
    )
    return {
        "departmanlar": [
            {
                "id": d.id,
                "ad": d.name,
                "bolge": d.region.name if d.region else None,
                "calisan_sayisi": len(d.employees),
                "aktif_calisan": sum(1 for e in d.employees if e.is_active),
            }
            for d in rows
        ],
    }


def _tool_vardiya_listesi(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}
    stmt = (
        select(DepartmentShift)
        .options(selectinload(DepartmentShift.department))
        .where(DepartmentShift.is_active.is_(True))
        .order_by(DepartmentShift.department_id.asc(), DepartmentShift.name.asc())
    )
    if department_id:
        stmt = stmt.where(DepartmentShift.department_id == int(department_id))
    rows = list(db.scalars(stmt).all())
    return {
        "vardiyalar": [
            {
                "id": s.id,
                "ad": s.name,
                "departman": s.department.name if s.department else None,
                "baslangic": s.start_time_local.strftime("%H:%M"),
                "bitis": s.end_time_local.strftime("%H:%M"),
                "mola_dk": s.break_minutes,
            }
            for s in rows
        ],
    }


def _tool_mesai_kurallari(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}
    stmt = (
        select(WorkRule)
        .options(selectinload(WorkRule.department))
        .order_by(WorkRule.department_id.asc())
    )
    if department_id:
        stmt = stmt.where(WorkRule.department_id == int(department_id))
    rows = list(db.scalars(stmt).all())
    return {
        "mesai_kurallari": [
            {
                "departman": w.department.name if w.department else None,
                "gunluk_planlanan": _fmt_minutes(w.daily_minutes_planned),
                "mola_dk": w.break_minutes,
                "giris_tolerans_dk": w.grace_minutes,
                "erken_gelis_tolerans_dk": w.early_arrival_tolerance_minutes,
                "fazla_mesai_tolerans_dk": w.overtime_grace_minutes,
                "net_mesai_esigi": (
                    _fmt_minutes(w.overtime_threshold_minutes)
                    if w.overtime_threshold_minutes
                    else None
                ),
            }
            for w in rows
        ],
    }


def _tool_resmi_tatiller(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    year = args.get("year")
    stmt = select(SpecialDay).where(SpecialDay.is_active.is_(True)).order_by(SpecialDay.day_date.asc())
    if year:
        stmt = stmt.where(
            SpecialDay.day_date >= date(int(year), 1, 1),
            SpecialDay.day_date <= date(int(year), 12, 31),
        )
    rows = list(db.scalars(stmt).all())
    return {
        "ozel_gunler": [
            {
                "tarih": str(s.day_date),
                "ad": s.name,
                "tur": s.day_type.value if s.day_type else None,
                "calisma_politikasi": s.work_policy.value if s.work_policy else None,
            }
            for s in rows
        ],
    }


def _tool_bugun_durumu(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    target = None
    raw = (args.get("target_date") or "").strip()
    if raw:
        try:
            target = date.fromisoformat(raw)
        except ValueError:
            # Sessizce bugune dusme: model gecersiz tarihi sordugunu sanip cevabi uydurmasin.
            return {"hata": f"Gecersiz tarih: '{raw}'. Tarihi YYYY-MM-DD biciminde ver."}
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}
    board = build_daily_attendance_board(
        db,
        target_date=target,
        department_id=department_id,
    )
    s = board.summary
    items = board.items[:40]
    return {
        "tarih": str(board.target_date),
        "ozet": {
            "toplam": s.total,
            "calisiyor": s.working,
            "isi_bitti": s.finished,
            "gelmedi": s.absent,
            "gelmeme_riski": s.absent_risk,
            "henuz_giris_yok": s.not_started,
            "tatil_izin": s.off,
        },
        "kisiler": [
            {
                "ad": r.full_name,
                "departman": r.department_name,
                "durum": _BOARD_STATUS_TR.get(r.status, r.status),
                "giris": _fmt_local_time(r.first_in_utc),
                "cikis": _fmt_local_time(r.last_out_utc),
                "calisma": _fmt_minutes(r.worked_minutes) if r.worked_minutes else None,
            }
            for r in items
        ],
        "not": ("Liste 40 kisiyle sinirlandi; ozet sayilar tum sirketi kapsar." if len(board.items) > 40 else None),
    }


def _tool_sirket_ozeti(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    total_emp = db.scalar(select(func.count()).select_from(Employee))
    active_emp = db.scalar(
        select(func.count()).select_from(Employee).where(Employee.is_active.is_(True))
    )
    dep_count = db.scalar(select(func.count()).select_from(Department))
    region_count = db.scalar(select(func.count()).select_from(Region))
    board = build_daily_attendance_board(db)
    s = board.summary
    return {
        "calisanlar": {"toplam": int(total_emp or 0), "aktif": int(active_emp or 0)},
        "departman_sayisi": int(dep_count or 0),
        "bolge_sayisi": int(region_count or 0),
        "bugun": {
            "tarih": str(board.target_date),
            "calisiyor": s.working,
            "isi_bitti": s.finished,
            "gelmedi": s.absent,
            "henuz_giris_yok": s.not_started,
            "tatil_izin": s.off,
        },
    }


def _tool_izin_listesi(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}

    stmt = (
        select(Leave)
        .options(selectinload(Leave.employee).selectinload(Employee.department))
        .join(Employee, Leave.employee_id == Employee.id)
        .order_by(Leave.start_date.asc())
    )

    employee_id = args.get("employee_id")
    if employee_id is not None:
        stmt = stmt.where(Leave.employee_id == int(employee_id))
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == int(department_id))

    raw_status = (args.get("status") or "").strip().upper()
    status = raw_status if raw_status in LeaveStatus.__members__ else "APPROVED"
    stmt = stmt.where(Leave.status == LeaveStatus[status])

    year = args.get("year")
    month = args.get("month")
    if year and month:
        first = date(int(year), int(month), 1)
        # Ay sonu (haric) siniri: Aralik'ta gelecek yilin 1 Ocak'i. Aksi halde
        # 31 Aralik'ta baslayan izin "start_date < 31 Aralik" ile dusuyordu.
        last = date(int(year) + 1, 1, 1) if int(month) == 12 else date(int(year), int(month) + 1, 1)
        # ay ile kesisen izinler
        stmt = stmt.where(Leave.start_date < last, Leave.end_date >= first)
        donem = f"{int(year)}-{int(month):02d}"
    else:
        today = _now_local().date()
        stmt = stmt.where(Leave.end_date >= today)
        donem = f"{today} ve sonrasi"

    rows = list(db.scalars(stmt.limit(60)).all())
    return {
        "donem": donem,
        "durum_filtresi": _LEAVE_STATUS_TR.get(status, status),
        "adet": len(rows),
        "izinler": [
            {
                "calisan": lv.employee.full_name if lv.employee else None,
                "departman": (lv.employee.department.name if lv.employee and lv.employee.department else None),
                "tur": _LEAVE_TYPE_TR.get(lv.type.value, lv.type.value) if lv.type else None,
                "durum": _LEAVE_STATUS_TR.get(lv.status.value, lv.status.value) if lv.status else None,
                "baslangic": str(lv.start_date),
                "bitis": str(lv.end_date),
                "yarim_gun": lv.half_day,
            }
            for lv in rows
        ],
    }


def _tool_departman_calisanlari(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    department_id, dept_err = _resolve_department_id(db, args)
    if dept_err:
        return {"hata": dept_err}
    if department_id is None:
        return {"hata": "Bir departman belirt (id ya da ad). departman_listesi ile bakabilirsin."}
    department = db.get(Department, int(department_id))
    if department is None:
        return {"hata": f"id={department_id} departman bulunamadi."}
    include_inactive = bool(args.get("include_inactive"))
    stmt = (
        select(Employee)
        .options(selectinload(Employee.shift))
        .where(Employee.department_id == int(department_id))
        .order_by(Employee.full_name.asc())
    )
    if not include_inactive:
        stmt = stmt.where(Employee.is_active.is_(True))
    rows = list(db.scalars(stmt).all())
    return {
        "departman": department.name,
        "adet": len(rows),
        "calisanlar": [
            {
                "id": e.id,
                "ad_soyad": e.full_name,
                "vardiya": e.shift.name if e.shift else None,
                "aktif": e.is_active,
            }
            for e in rows
        ],
    }


def _tool_eksik_gunler(db: Session, args: dict[str, Any]) -> dict[str, Any]:
    employee_id = int(args["employee_id"])
    year = int(args["year"])
    month = int(args["month"])
    employee = db.scalar(
        select(Employee).options(selectinload(Employee.department)).where(Employee.id == employee_id)
    )
    if employee is None:
        return {"hata": f"id={employee_id} calisan bulunamadi."}
    report = calculate_employee_monthly(db, employee_id=employee_id, year=year, month=month)
    gunler: list[dict[str, Any]] = []
    for d in report.days:
        if d.status != "INCOMPLETE":
            continue
        flags = set(d.flags or [])
        if "MISSING_IN" in flags and "MISSING_OUT" not in flags:
            eksik = "giris yok"
        elif "MISSING_OUT" in flags and "MISSING_IN" not in flags:
            eksik = "cikis yok"
        else:
            eksik = "giris/cikis eksik"
        gunler.append(
            {
                "gun": str(d.date),
                "eksik": eksik,
                "giris": _fmt_local_time(d.check_in),
                "cikis": _fmt_local_time(d.check_out),
                "vardiya": d.shift_name,
            }
        )
    return {
        "calisan": {
            "id": employee.id,
            "ad_soyad": employee.full_name,
            "departman": employee.department.name if employee.department else None,
        },
        "donem": f"{year}-{month:02d}",
        "eksik_gun_sayisi": len(gunler),
        "gunler": gunler,
    }


_TOOL_DISPATCH = {
    "calisan_ara": _tool_calisan_ara,
    "kisi_aylik_ozet": _tool_kisi_aylik_ozet,
    "kisi_detay": _tool_kisi_detay,
    "departman_aylik_ozet": _tool_departman_aylik_ozet,
    "sirket_kisi_fazla_mesai": _tool_sirket_kisi_fazla_mesai,
    "gunluk_puantaj": _tool_gunluk_puantaj,
    "departman_listesi": _tool_departman_listesi,
    "vardiya_listesi": _tool_vardiya_listesi,
    "mesai_kurallari": _tool_mesai_kurallari,
    "resmi_tatiller": _tool_resmi_tatiller,
    "bugun_durumu": _tool_bugun_durumu,
    "sirket_ozeti": _tool_sirket_ozeti,
    "izin_listesi": _tool_izin_listesi,
    "departman_calisanlari": _tool_departman_calisanlari,
    "eksik_gunler": _tool_eksik_gunler,
}


def _dispatch_tool(db: Session, name: str, args: dict[str, Any]) -> dict[str, Any]:
    handler = _TOOL_DISPATCH.get(name)
    if handler is None:
        logger.warning("assistant_tool_unknown", extra={"tool": name})
        return {"hata": f"Bilinmeyen arac: {name}"}
    try:
        return handler(db, args)
    except Exception:  # araci cagrisini modele hata olarak geri ver
        # Arg anahtarlarini logla (degerleri DEGIL: ozluk/PII sizmasin).
        # Ham istisna metni modele/kullaniciya verilmez: DB hatalari SQL/sutun/PII sizdirabilir.
        logger.exception(
            "assistant_tool_failed", extra={"tool": name, "arg_keys": sorted(args.keys())}
        )
        return {"hata": "Arac su an calistirilamadi (gecici bir sorun olustu)."}


def dispatch_tool_cached(
    db: Session, name: str, args: dict[str, Any], cache: dict[str, str]
) -> str:
    """Tool'u calistirir ve sonucu (modele verilecek) JSON metni olarak dondurur.
    Ayni (arac + arg) tek bir konusma turunda tekrar cagrilirsa onbellekten doner:
    hem gereksiz DB sorgusunu hem de modelin ayni cagriya farkli sonuc gormesini onler."""
    key = name + "|" + json.dumps(args, sort_keys=True, ensure_ascii=False, default=str)
    cached = cache.get(key)
    if cached is not None:
        logger.info("assistant_tool_cache_hit", extra={"tool": name})
        return cached
    result = _dispatch_tool(db, name, args)
    payload = json.dumps(result, ensure_ascii=False, default=str)
    cache[key] = payload
    return payload
