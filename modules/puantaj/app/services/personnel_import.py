"""Excel'den toplu ozluk/personel ice aktarma.

Kaynak dosya format (musteri Excel'i): SIRA NO, ADI SOYADI, T.C. KIMLIK NO,
ISE GIRIS TARIHI, TARIH (rapor tarihi, kullanilmaz), ISTEN AYRILIS TARIHI,
KIDEM (hesaplanan, kullanilmaz), CINSIYET, DOGUM TARIHI, ADRES (aktarilmaz),
CEP NO, IS CEP NO, LOKASYON, DEPARTMAN, GOREVI, HESAP NO (bos genelde),
IBAN NO, SICIL NO.

Musteri Excel'inde DEPARTMAN kolonu tutarsiz dolduruldugu icin (bazen gorev
unvani yazilmis) LOKASYON + DEPARTMAN ikilisinden TEK bir kurumsal departman
adi turetiriz (orn. LOKASYON=MERKEZ + DEPARTMAN=TEKNIK SERVIS -> "Teknik
Servis-Bursa"). Bolge, LOKASYON'dan turetilir. Eslesme oncelikle TC kimlik
no ile yapilir: profilde ayni TC varsa GUNCELLE. TC eslesmezse (orn. mevcut
calisanin profilinde henuz TC girilmemisse) isim uzerinden yedek eslesme
denenir; ayni isimde tek calisan varsa GUNCELLE, birden fazla/ hic yoksa
YENI calisan olusturulur (belirsizlik durumunda uyari eklenir, kullanici
elle kontrol eder). Bu yedek eslesme, ozluk excel'i ilk kez yuklenirken
mevcut calisanlarin TC'si bos oldugu icin duplicate kayit olusmasini
engellemek icin eklendi.

Iki asamali akis: build_import_preview (DB'ye yazmaz, sadece hesaplar) ve
commit_import_rows (gercek yazma; preview ile ayni hesaplamayi tekrar
calistirir, cagiran taraf hangi SIRA NO'larin atlanacagini bildirir).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from io import BytesIO

import openpyxl
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Department, Employee, EmployeePayrollProfile, Region

# --- LOKASYON -> bolge adi (bkz. modul docstring; iki satirda LOKASYON
# eksik/YONETIM oldugu icin Bursa/Merkez varsayildi; kullaniciyla teyitli). ---
LOCATION_TO_REGION: dict[str, str] = {
    "MERKEZ": "Bursa",
    "KORUPARK": "Bursa",
    "BALAT SAN. CAD.": "Bursa",
    "İZMİR YOLU": "Bursa",
    "İST. CAD.": "Bursa",
    "BARIŞ MAH.": "Bursa",
    "ÇANKAYA": "Ankara",
    "BAYRAKLI": "İzmir",
    "ATAŞEHİR": "İstanbul",
    "YÖNETİM": "Bursa",
    "": "Bursa",
}

# DEPARTMAN (excel) -> kurumsal departman etiketi (bolge eklenmeden once).
# Bazi tek/az kisilik hatali etiketler (yanlis kolona unvan yazilmasi) burada
# mantikli departmana birlestirildi; kullaniciyla teyitli.
DEPARTMENT_LABEL: dict[str, str] = {
    "TEKNİK SERVİS": "Teknik Servis",
    "ŞOFÖR": "Sürücü",
    "SATIŞ GÖREVLİSİ": "Satış Görevlisi",
    "SATIŞ-DEMOBANK MÜDÜRÜ": "Satış Görevlisi",
    "SATIŞ-EĞİTİM MÜDÜRÜ": "Satış Görevlisi",
    "MAĞAZA": "Mağaza",
    "MUHASEBE": "Muhasebe",
    "ANKARA ÖN MUHASEBE": "Muhasebe",
    "ÇAĞRI MERKEZİ": "Çağrı Merkezi",
    "DEPO": "Depo",
    "STAND": "Stand",
    "BEKÇİ": "Bekçi",
    "SEVKİYAT": "Sevkiyat",
    "TEMİZLİK": "Temizlik",
    "TEMİZLİK GÖREVLİSİ": "Temizlik",
    "BİLGİ İŞLEM": "Bilgi İşlem",
    "GRAFİK VE TASARIM": "Grafik ve Tasarım",
    "İDARİ İŞLER": "İdari İşler",
    "YÖNETİCİ ASİSTANI": "Yönetici Asistanı",
    "İNSAN KAYNAKLARI UZMANI": "İnsan Kaynakları",
    "YÖNETİM": "Yönetim",
}

# Bazi DEPARTMAN etiketleri aslinda unvan; departman birlestirilirken bu
# unvan GOREVI (pozisyon) alanina yazilir, excel'deki GOREVI degeri yerine.
POZISYON_OVERRIDE: dict[str, str] = {
    "SATIŞ-DEMOBANK MÜDÜRÜ": "Satış-Demobank Müdürü",
    "SATIŞ-EĞİTİM MÜDÜRÜ": "Satış-Eğitim Müdürü",
}

_TR_UPPER_TO_LOWER = {"İ": "i", "I": "ı", "Ş": "ş", "Ğ": "ğ", "Ü": "ü", "Ö": "ö", "Ç": "ç"}
_TR_LOWER_TO_UPPER = {v: k for k, v in _TR_UPPER_TO_LOWER.items()}


def tr_lower(value: str) -> str:
    return "".join(_TR_UPPER_TO_LOWER.get(ch, ch.lower()) for ch in value)


def tr_title(value: str) -> str:
    words = value.strip().split(" ")
    out: list[str] = []
    for word in words:
        if not word:
            continue
        lowered = tr_lower(word)
        first = _TR_LOWER_TO_UPPER.get(lowered[0], lowered[0].upper())
        out.append(first + lowered[1:])
    return " ".join(out)


def _clean_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _digits_only_phone(value: object) -> str | None:
    text = _clean_str(value)
    if text is None:
        return None
    digits = "".join(ch for ch in text if ch.isdigit())
    if not digits:
        return None
    if not digits.startswith("0"):
        digits = "0" + digits
    return digits


def _clean_iban(value: object) -> str | None:
    text = _clean_str(value)
    if text is None:
        return None
    return "".join(text.split())


def _parse_dogum_tarihi(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text or len(text) > 20:
        return None
    parts = text.split(".")
    if len(parts) != 3:
        return None
    try:
        day, month, year = (int(p) for p in parts)
        return date(year, month, day)
    except ValueError:
        return None


def _parse_ise_giris(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


def _tc_kimlik(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.replace(".0", "").isdigit():
        return str(int(float(text)))
    return text


def _normalize_name(value: str) -> str:
    """TC kimlik eslesmedigi zaman yedek eslesme icin isim normalize eder."""
    return " ".join(tr_lower(value).split())


def resolve_region_name(lokasyon: str | None) -> str:
    key = (lokasyon or "").strip().upper()
    return LOCATION_TO_REGION.get(key, tr_title(key) if key else "Bursa")


def resolve_department_label(departman: str | None) -> str:
    key = (departman or "").strip().upper()
    return DEPARTMENT_LABEL.get(key, tr_title(key) if key else "Diğer")


def resolve_pozisyon(departman: str | None, gorevi: str | None) -> str | None:
    key = (departman or "").strip().upper()
    override = POZISYON_OVERRIDE.get(key)
    if override:
        return override
    text = _clean_str(gorevi)
    return tr_title(text) if text else None


@dataclass
class PersonnelImportRow:
    sira_no: int
    full_name: str
    tc_kimlik_no: str
    region_name: str
    department_name: str
    pozisyon: str | None
    ise_giris_tarihi: date | None
    dogum_tarihi: date | None
    cinsiyet: str | None
    cep_telefonu: str | None
    sirket_telefonu: str | None
    adres: str | None
    hesap_no: str | None
    sgk_sicil_no: str | None
    action: str  # "CREATE" | "UPDATE"
    employee_id: int | None = None
    changed_fields: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class PersonnelImportPreview:
    rows: list[PersonnelImportRow]
    new_regions: list[str]
    new_departments: list[str]
    parse_errors: list[str]


HEADER_COLUMNS = [
    "SIRA NO",
    "ADI SOYADI",
    "T.C. KİMLİK NO",
    "İŞE GİRİŞ TARİHİ",
    "TARİH",
    "İŞTEN AYRILIŞ TARİHİ",
    "KIDEM",
    "CİNSİYET",
    "DOĞUM TARİHİ",
    "ADRES",
    "CEP NO",
    "İŞ CEP NO",
    "LOKASYON",
    "DEPARTMAN",
    "GÖREVİ",
    "HESAP NO",
    "IBAN NO",
    "SİCİL NO",
]


def _iter_source_rows(file_bytes: bytes) -> list[dict]:
    wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
    ws = wb.worksheets[0]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    out = []
    for raw in rows:
        if raw is None or all(v is None for v in raw):
            continue
        padded = list(raw) + [None] * (18 - len(raw))
        out.append(
            {
                "sira_no": padded[0],
                "full_name": padded[1],
                "tc_kimlik_no": padded[2],
                "ise_giris_tarihi": padded[3],
                "isten_ayrilis_tarihi": padded[5],
                "cinsiyet": padded[7],
                "dogum_tarihi": padded[8],
                "adres": padded[9],
                "cep_no": padded[10],
                "is_cep_no": padded[11],
                "lokasyon": padded[12],
                "departman": padded[13],
                "gorevi": padded[14],
                "iban_no": padded[16],
                "sicil_no": padded[17],
            }
        )
    return out


def _compute_rows(db: Session, file_bytes: bytes) -> tuple[list[PersonnelImportRow], list[str]]:
    parse_errors: list[str] = []
    source_rows = _iter_source_rows(file_bytes)

    tc_list = [_tc_kimlik(r["tc_kimlik_no"]) for r in source_rows]
    existing_by_tc: dict[str, Employee] = {}
    if tc_list:
        matches = db.execute(
            select(EmployeePayrollProfile, Employee)
            .join(Employee, Employee.id == EmployeePayrollProfile.employee_id)
            .where(EmployeePayrollProfile.tc_kimlik_no.in_([tc for tc in tc_list if tc]))
        ).all()
        for profile, employee in matches:
            if profile.tc_kimlik_no:
                existing_by_tc[profile.tc_kimlik_no] = employee

    # Yedek eslesme: TC kimlik no ile eslesmeyen satirlar icin, profilinde
    # (henuz) TC girilmemis calisanlari isim uzerinden eslestiririz. Bu,
    # ozluk excel'i ilk kez yuklenirken TC bos oldugu icin ayni calisanin
    # ikinci kez (duplicate) olusturulmasini engeller. Ayni isimde birden
    # fazla calisan varsa otomatik eslestirme YAPILMAZ (belirsizlik uyarisi
    # eklenir), guvenlik icin yeni kayit olusturulur ve elle kontrol istenir.
    employees_without_tc = db.execute(
        select(Employee)
        .outerjoin(EmployeePayrollProfile, EmployeePayrollProfile.employee_id == Employee.id)
        .where(Employee.is_active.is_(True))
        .where(
            (EmployeePayrollProfile.id.is_(None))
            | (EmployeePayrollProfile.tc_kimlik_no.is_(None))
            | (EmployeePayrollProfile.tc_kimlik_no == "")
        )
    ).scalars().all()
    existing_by_name: dict[str, list[Employee]] = {}
    for employee in employees_without_tc:
        key = _normalize_name(employee.full_name)
        existing_by_name.setdefault(key, []).append(employee)

    used_employee_ids: set[int] = set()

    result: list[PersonnelImportRow] = []
    for idx, r in enumerate(source_rows, start=2):
        full_name = _clean_str(r["full_name"])
        tc = _tc_kimlik(r["tc_kimlik_no"])
        if not full_name or not tc:
            parse_errors.append(f"Satır {idx}: ad soyad veya TC kimlik no eksik, atlandı.")
            continue

        isten_ayrilis = r["isten_ayrilis_tarihi"]
        warnings: list[str] = []
        if isten_ayrilis:
            warnings.append("İşten ayrılış tarihi dolu; bu kişi pasif/ayrılmış olabilir.")

        lokasyon = _clean_str(r["lokasyon"]) or ""
        departman = _clean_str(r["departman"]) or ""
        region_name = resolve_region_name(lokasyon)
        department_label = resolve_department_label(departman)
        department_name = f"{department_label}-{region_name.upper()}"
        pozisyon = resolve_pozisyon(departman, r["gorevi"])

        dogum_tarihi = _parse_dogum_tarihi(r["dogum_tarihi"])
        if r["dogum_tarihi"] and dogum_tarihi is None:
            warnings.append("Doğum tarihi okunamadı (hatalı hücre), boş bırakıldı.")

        cinsiyet_raw = (_clean_str(r["cinsiyet"]) or "").upper()
        cinsiyet = "K" if cinsiyet_raw == "KADIN" else "E" if cinsiyet_raw == "ERKEK" else None

        existing = existing_by_tc.get(tc)
        if existing is not None and existing.id in used_employee_ids:
            existing = None
        if existing is None:
            candidates = [
                emp for emp in existing_by_name.get(_normalize_name(full_name), [])
                if emp.id not in used_employee_ids
            ]
            if len(candidates) == 1:
                existing = candidates[0]
                warnings.append(
                    "TC kimlik no ile eşleşen kayıt bulunamadı; isim benzerliğiyle "
                    f"mevcut çalışan (#{existing.id}) güncellendi. TC numarasını kontrol edin."
                )
            elif len(candidates) > 1:
                ids = ", ".join(f"#{emp.id}" for emp in candidates)
                warnings.append(
                    f"Aynı isimde birden fazla çalışan bulundu ({ids}); otomatik eşleştirme "
                    "yapılmadı, YENİ kayıt oluşturulacak. Lütfen elle kontrol edip yinelenen "
                    "kaydı birleştirin/silin."
                )
        if existing is not None:
            used_employee_ids.add(existing.id)

        action = "UPDATE" if existing else "CREATE"
        changed_fields: list[str] = []
        if existing and existing.full_name != full_name:
            changed_fields.append("full_name")
        if existing and (existing.department is None or existing.department.name != department_name):
            changed_fields.append("department")

        result.append(
            PersonnelImportRow(
                sira_no=int(r["sira_no"]) if r["sira_no"] is not None else idx,
                full_name=tr_title(full_name),
                tc_kimlik_no=tc,
                region_name=region_name,
                department_name=department_name,
                pozisyon=pozisyon,
                ise_giris_tarihi=_parse_ise_giris(r["ise_giris_tarihi"]),
                dogum_tarihi=dogum_tarihi,
                cinsiyet=cinsiyet,
                cep_telefonu=_digits_only_phone(r["cep_no"]),
                sirket_telefonu=_digits_only_phone(r["is_cep_no"]),
                adres=(_clean_str(r["adres"]) or "")[:500] or None,
                hesap_no=_clean_iban(r["iban_no"]),
                sgk_sicil_no=_clean_str(r["sicil_no"]),
                action=action,
                employee_id=existing.id if existing else None,
                changed_fields=changed_fields,
                warnings=warnings,
            )
        )
    return result, parse_errors


def build_import_preview(db: Session, file_bytes: bytes) -> PersonnelImportPreview:
    rows, parse_errors = _compute_rows(db, file_bytes)

    existing_region_names = {r.name for r in db.scalars(select(Region))}
    existing_department_names = {d.name for d in db.scalars(select(Department))}

    new_regions = sorted({row.region_name for row in rows if row.region_name not in existing_region_names})
    new_departments = sorted(
        {row.department_name for row in rows if row.department_name not in existing_department_names}
    )

    return PersonnelImportPreview(
        rows=rows,
        new_regions=new_regions,
        new_departments=new_departments,
        parse_errors=parse_errors,
    )


def _get_or_create_region(db: Session, name: str, cache: dict[str, Region]) -> Region:
    if name in cache:
        return cache[name]
    region = db.scalar(select(Region).where(Region.name == name))
    if region is None:
        region = Region(name=name, is_active=True)
        db.add(region)
        db.flush()
    cache[name] = region
    return region


def _get_or_create_department(
    db: Session, name: str, region_id: int, cache: dict[str, Department]
) -> Department:
    if name in cache:
        return cache[name]
    department = db.scalar(select(Department).where(Department.name == name))
    if department is None:
        department = Department(name=name, region_id=region_id)
        db.add(department)
        db.flush()
    cache[name] = department
    return department


@dataclass
class PersonnelImportCommitResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    created_regions: list[str] = field(default_factory=list)
    created_departments: list[str] = field(default_factory=list)


def commit_import_rows(
    db: Session, file_bytes: bytes, *, skip_sira_nos: set[int]
) -> PersonnelImportCommitResult:
    rows, _parse_errors = _compute_rows(db, file_bytes)

    region_cache: dict[str, Region] = {}
    department_cache: dict[str, Department] = {}
    result = PersonnelImportCommitResult()

    existing_region_names = {r.name for r in db.scalars(select(Region))}
    existing_department_names = {d.name for d in db.scalars(select(Department))}

    for row in rows:
        if row.sira_no in skip_sira_nos:
            result.skipped += 1
            continue

        region = _get_or_create_region(db, row.region_name, region_cache)
        if row.region_name not in existing_region_names:
            result.created_regions.append(row.region_name)
            existing_region_names.add(row.region_name)
        department = _get_or_create_department(db, row.department_name, region.id, department_cache)
        if row.department_name not in existing_department_names:
            result.created_departments.append(row.department_name)
            existing_department_names.add(row.department_name)

        employee = db.get(Employee, row.employee_id) if row.employee_id else None
        if employee is None:
            employee = Employee(full_name=row.full_name, is_active=True)
            db.add(employee)
            result.created += 1
        else:
            result.updated += 1
        employee.full_name = row.full_name
        employee.region_id = region.id
        employee.department_id = department.id
        employee.is_active = True
        db.flush()

        profile = db.scalar(
            select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id == employee.id)
        )
        if profile is None:
            profile = EmployeePayrollProfile(employee_id=employee.id)
            db.add(profile)

        profile.tc_kimlik_no = row.tc_kimlik_no
        if row.pozisyon:
            profile.pozisyon = row.pozisyon
        if row.ise_giris_tarihi:
            profile.ise_giris_tarihi = row.ise_giris_tarihi
        if row.dogum_tarihi:
            profile.dogum_tarihi = row.dogum_tarihi
        if row.cinsiyet:
            profile.cinsiyet = row.cinsiyet
        if row.cep_telefonu:
            profile.cep_telefonu = row.cep_telefonu
        if row.sirket_telefonu:
            profile.sirket_telefonu = row.sirket_telefonu
        if row.adres:
            profile.adres = row.adres
        if row.hesap_no:
            profile.hesap_no = row.hesap_no
        if row.sgk_sicil_no:
            profile.sgk_sicil_no = row.sgk_sicil_no

    db.commit()
    return result


__all__ = [
    "PersonnelImportRow",
    "PersonnelImportPreview",
    "PersonnelImportCommitResult",
    "build_import_preview",
    "commit_import_rows",
]
