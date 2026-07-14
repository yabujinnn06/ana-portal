#!/usr/bin/env python
"""Özlük excel importunun (TC eşleşmesi olmadığı için) ürettiği duplicate
çalışan kayıtlarını temizler VE bu duplicate'lerdeki özlük bilgilerini
(TC kimlik no, adres, telefon, pozisyon, işe giriş tarihi vb.) silmeden önce
mevcut (korunan) orijinal çalışan kaydına işler.

Kullanım (üretim veritabanına DATABASE_URL ile bağlanarak):

    # 1) Önce SADECE önizleme (hiçbir şey silmez/güncellemez):
    python scripts/cleanup_ozluk_duplicates.py --after-id 66

    # 2) Önizleme çıktısı doğruysa gerçekten uygula:
    python scripts/cleanup_ozluk_duplicates.py --after-id 66 --apply

Güvenlik kuralları:
  * SADECE id > --after-id (varsayılan 66) olan çalışanlar SİLİNEBİLİR aday
    olarak değerlendirilir. id <= --after-id olan kayıtlar asla silinmez;
    sadece (boş olan) özlük alanları doldurulur — dolu bir alan ASLA
    üzerine yazılmaz.
  * Bir duplicate'in cihazı (device), yoklama kaydı (attendance_events) veya
    izin kaydı (leaves) varsa OTOMATİK SİLİNMEZ — "cihazı/geçmişi var,
    manuel kontrol et" diye raporlanır ve atlanır.
  * SADECE aynı isimde TEK bir orijinal (id <= after-id) kayıt varsa
    "duplicate" sayılır: özlük bilgileri o orijinale işlenir, sonra
    duplicate silinir. Aynı isimde BİRDEN FAZLA orijinal varsa (belirsiz)
    dokunulmaz, manuel kontrol istenir.
  * id > after-id adayları arasında aynı isimden birden fazla kopya varsa
    (excel iki kez yüklenmişse), en küçük id tutulur, diğerleri silinir.
  * Sistemde hiçbir yerde eşi/aynı ismi olmayan (gerçekten yeni, sadece
    excel ile eklenmiş) çalışanlar SİLİNMEZ — "YENİ ÇALIŞAN, korunuyor"
    diye raporlanır.
  * --apply verilmeden hiçbir DB yazması yapılmaz (dry-run varsayılan).
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, text

ROOT_DIR = Path(__file__).resolve().parents[1]

_TR_UPPER_TO_LOWER = {"İ": "i", "I": "ı", "Ş": "ş", "Ğ": "ğ", "Ü": "ü", "Ö": "ö", "Ç": "ç"}

# personnel_import.py'nin excel'den doldurduğu ozluk alanlari (bkz.
# commit_import_rows). Reconcile sirasinda SADECE bu alanlar, SADECE
# orijinalde BOS ise duplicate'ten kopyalanir.
PROFILE_FIELDS = [
    "tc_kimlik_no",
    "pozisyon",
    "ise_giris_tarihi",
    "dogum_tarihi",
    "cinsiyet",
    "cep_telefonu",
    "sirket_telefonu",
    "adres",
    "hesap_no",
    "sgk_sicil_no",
]


def _tr_lower(value: str) -> str:
    return "".join(_TR_UPPER_TO_LOWER.get(ch, ch.lower()) for ch in value)


def _normalize_name(value: str) -> str:
    return " ".join(_tr_lower(value or "").split())


def load_env_if_exists() -> None:
    env_file = ROOT_DIR / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def _is_blank(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--after-id",
        type=int,
        default=66,
        help="Bu ID'den BÜYÜK olan çalışanlar aday olarak değerlendirilir (varsayılan: 66).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Verilmezse sadece önizleme yapılır, hiçbir şey silinmez/güncellenmez.",
    )
    args = parser.parse_args()

    load_env_if_exists()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL bulunamadı (.env veya ortam değişkeni olarak ayarlayın).")

    engine = create_engine(database_url)

    profile_cols = ", ".join(f"p.{col}" for col in PROFILE_FIELDS)
    with engine.connect() as conn:
        all_employees = conn.execute(
            text(
                f"""
                select
                    e.id,
                    e.full_name,
                    e.department_id,
                    e.region_id,
                    coalesce(d.device_count, 0) as device_count,
                    coalesce(a.attendance_count, 0) as attendance_count,
                    coalesce(l.leave_count, 0) as leave_count,
                    p.id as profile_id,
                    {profile_cols}
                from employees e
                left join (
                    select employee_id, count(*) as device_count
                    from devices group by employee_id
                ) d on d.employee_id = e.id
                left join (
                    select employee_id, count(*) as attendance_count
                    from attendance_events group by employee_id
                ) a on a.employee_id = e.id
                left join (
                    select employee_id, count(*) as leave_count
                    from leaves group by employee_id
                ) l on l.employee_id = e.id
                left join employee_payroll_profiles p on p.employee_id = e.id
                order by e.id
                """
            )
        ).mappings().all()

    base_rows = [row for row in all_employees if row["id"] <= args.after_id]
    candidate_rows = [row for row in all_employees if row["id"] > args.after_id]

    if not candidate_rows:
        print(f"id > {args.after_id} olan hiç çalışan yok. Yapılacak bir şey yok.")
        return

    base_by_name: dict[str, list] = {}
    for row in base_rows:
        base_by_name.setdefault(_normalize_name(row["full_name"]), []).append(row)

    candidates_by_name: dict[str, list] = {}
    for row in candidate_rows:
        candidates_by_name.setdefault(_normalize_name(row["full_name"]), []).append(row)

    deletable_ids: list[int] = []
    # employee_id -> {field: value} doldurulacak ozluk alanlari
    reconcile_updates: dict[int, dict[str, object]] = {}
    kept_new_count = 0
    print(f"id > {args.after_id} olan {len(candidate_rows)} kayıt bulundu:\n")

    for row in candidate_rows:
        name_key = _normalize_name(row["full_name"])
        has_history = row["device_count"] > 0 or row["attendance_count"] > 0 or row["leave_count"] > 0
        base_matches = base_by_name.get(name_key, [])
        same_name_candidates = candidates_by_name[name_key]
        is_internal_duplicate = len(same_name_candidates) > 1

        if has_history:
            verdict = "ATLANDI (cihaz/geçmiş var, manuel kontrol et)"
        elif len(base_matches) > 1:
            verdict = f"ATLANDI (aynı isimde {len(base_matches)} orijinal var, belirsiz, manuel kontrol et)"
        elif len(base_matches) == 1:
            base = base_matches[0]
            filled_fields: dict[str, object] = {}
            for field in PROFILE_FIELDS:
                base_value = base.get(field)
                dup_value = row.get(field)
                if _is_blank(base_value) and not _is_blank(dup_value):
                    filled_fields[field] = dup_value
            existing = reconcile_updates.get(base["id"], {})
            existing.update(filled_fields)
            reconcile_updates[base["id"]] = existing
            if filled_fields:
                verdict = (
                    f"SİLİNECEK (duplicate) -> #{base['id']} özlük alanları dolduruluyor: "
                    + ", ".join(filled_fields.keys())
                )
            else:
                verdict = f"SİLİNECEK (duplicate) -> #{base['id']} zaten dolu, doldurulacak alan yok"
            deletable_ids.append(row["id"])
        elif is_internal_duplicate:
            keeper_id = min(r["id"] for r in same_name_candidates)
            if row["id"] == keeper_id:
                verdict = f"KORUNUYOR (aynı isimden {len(same_name_candidates)} tane var, bu tutuluyor)"
                kept_new_count += 1
            else:
                verdict = f"SİLİNECEK (aynı isimden fazladan kopya, #{keeper_id} tutuluyor)"
                deletable_ids.append(row["id"])
        else:
            verdict = "KORUNUYOR (sistemde eşi yok, yeni çalışan)"
            kept_new_count += 1

        print(f"  #{row['id']:<5} {row['full_name']:<35} -> {verdict}")

    history_skipped = sum(
        1
        for row in candidate_rows
        if (row["device_count"] > 0 or row["attendance_count"] > 0 or row["leave_count"] > 0)
    )
    print(
        f"\nToplam {len(candidate_rows)} kayıt: {len(deletable_ids)} silinecek (duplicate), "
        f"{kept_new_count} korunuyor (yeni/eşsiz çalışan), "
        f"{history_skipped} atlandı (cihaz/geçmiş kaydı var), "
        f"{len(reconcile_updates)} orijinal kayda özlük bilgisi işlenecek."
    )

    if not deletable_ids and not reconcile_updates:
        print("Yapılacak bir işlem yok.")
        return

    if not args.apply:
        print("\nBu bir ÖNİZLEME idi, hiçbir şey silinmedi/güncellenmedi. Uygulamak için --apply ekleyin:")
        print(f"  python scripts/cleanup_ozluk_duplicates.py --after-id {args.after_id} --apply")
        return

    base_by_id = {row["id"]: row for row in base_rows}
    with engine.begin() as conn:
        updated_profiles = 0
        for employee_id, fields in reconcile_updates.items():
            if not fields:
                continue
            base = base_by_id[employee_id]
            if base["profile_id"] is None:
                columns = ", ".join(["employee_id", *fields.keys()])
                placeholders = ", ".join([":employee_id", *[f":{k}" for k in fields]])
                conn.execute(
                    text(f"insert into employee_payroll_profiles ({columns}) values ({placeholders})"),
                    {"employee_id": employee_id, **fields},
                )
            else:
                set_clause = ", ".join(f"{k} = :{k}" for k in fields)
                conn.execute(
                    text(f"update employee_payroll_profiles set {set_clause} where employee_id = :employee_id"),
                    {"employee_id": employee_id, **fields},
                )
            updated_profiles += 1
        print(f"{updated_profiles} orijinal çalışanın özlük profili güncellendi.")

        if deletable_ids:
            result = conn.execute(
                text("delete from employees where id = any(:ids)"),
                {"ids": deletable_ids},
            )
            print(f"{result.rowcount} duplicate çalışan kaydı silindi: {deletable_ids}")


if __name__ == "__main__":
    main()
