"""Departman vardiya/kural kurulumu: Teknik Servis kalibi + Cagri Merkezi kalibi.

Varsayilan calistirma DRY-RUN'dir (hicbir yazma commit edilmez, sadece ne
yapilacagi yazdirilir). Gercekten uygulamak icin --apply bayragi gerekir.

Kullanim (Render shell):
    PYTHONPATH=. python scripts/apply_department_shifts.py            # dry-run (onizleme)
    PYTHONPATH=. python scripts/apply_department_shifts.py --apply    # gercek yazma

Teknik Servis kalibi uygulanan departmanlar (Bursa Teknik Servis referans alindi):
    Muhasebe-ANKARA, Muhasebe-BURSA, Muhasebe-ISTANBUL,
    Bilgi Islem-ANKARA, Idari Isler-BURSA, Yonetici Asistani-BURSA,
    Depo-ANKARA, Depo-BURSA, Depo-ISTANBUL, Sevkiyat-BURSA,
    Teknik Servis-ISTANBUL, Teknik Servis-IZMIR (bunlar bombostu, ayni sablonla dolduruluyor)
  -> 7 gun 08:30-17:30 (mola 60), Cumartesi 08:30-14:30 (mola 60)
  -> WorkRule: net 510dk, tolerans 15, erken gelis 120, fm tolerans 15, vardiya disi tolerans 120

Cagri Merkezi kalibi uygulanan departmanlar:
    Cagri Merkezi-ANKARA, Cagri Merkezi-BURSA, Cagri Merkezi-ISTANBUL
  -> Pazartesi-Cuma 09:00-18:30 (mola 60), Cumartesi 09:00-16:00 (mola 60), Pazar TATIL
  -> WorkRule: net 510dk (hafta ici), tolerans 15, erken gelis 120, fm tolerans 15, vardiya disi tolerans 120

Zaten configured olan Teknik Servis-BURSA ve Teknik Servis-ANKARA'ya DOKUNULMAZ.
"""
from __future__ import annotations

import sys
from datetime import time

from app.db import SessionLocal
from app import models as m

APPLY = "--apply" in sys.argv[1:]

WEEKDAY_NAMES = ["Pazartesi", "Sali", "Carsamba", "Persembe", "Cuma", "Cumartesi", "Pazar"]
MON, TUE, WED, THU, FRI, SAT, SUN = range(7)

TS_WORKRULE = dict(
    daily_minutes_planned=510,
    break_minutes=0,
    grace_minutes=15,
    early_arrival_tolerance_minutes=120,
    overtime_grace_minutes=15,
    off_shift_tolerance_minutes=120,
    overtime_threshold_minutes=None,
)
TS_WEEKDAY_SHIFT = dict(name="830", start_time_local=time(8, 30), end_time_local=time(17, 30), break_minutes=60)
TS_SATURDAY_SHIFT = dict(name="cmt", start_time_local=time(8, 30), end_time_local=time(14, 30), break_minutes=60)
TS_DEPARTMENTS = [
    "Muhasebe-ANKARA",
    "Muhasebe-BURSA",
    "Muhasebe-İSTANBUL",
    "Bilgi İşlem-ANKARA",
    "İdari İşler-BURSA",
    "Yönetici Asistanı-BURSA",
    "Depo-ANKARA",
    "Depo-BURSA",
    "Depo-İSTANBUL",
    "Sevkiyat-BURSA",
    "Teknik Servis-İSTANBUL",
    "Teknik Servis-İZMIR",
]

CM_WORKRULE = dict(
    daily_minutes_planned=510,
    break_minutes=0,
    grace_minutes=15,
    early_arrival_tolerance_minutes=120,
    overtime_grace_minutes=15,
    off_shift_tolerance_minutes=120,
    overtime_threshold_minutes=None,
)
CM_WEEKDAY_SHIFT = dict(name="hafta ici", start_time_local=time(9, 0), end_time_local=time(18, 30), break_minutes=60)
CM_SATURDAY_SHIFT = dict(name="cumartesi", start_time_local=time(9, 0), end_time_local=time(16, 0), break_minutes=60)
CM_DEPARTMENTS = [
    "Çağrı Merkezi-ANKARA",
    "Çağrı Merkezi-BURSA",
    "Çağrı Merkezi-İSTANBUL",
]


def get_department(db, name: str) -> m.Department | None:
    dep = db.query(m.Department).filter(m.Department.name == name).first()
    if not dep:
        print(f"  [ATLANDI] departman bulunamadi: {name}")
    return dep


def upsert_workrule(db, dep: m.Department, values: dict) -> None:
    wr = db.query(m.WorkRule).filter_by(department_id=dep.id).first()
    if wr:
        changed = any(getattr(wr, k) != v for k, v in values.items())
        for k, v in values.items():
            setattr(wr, k, v)
        print(f"  WorkRule {'GUNCELLENDI' if changed else 'ayni (degisiklik yok)'}: {dep.name}")
    else:
        db.add(m.WorkRule(department_id=dep.id, **values))
        print(f"  WorkRule OLUSTURULDU: {dep.name}")


def upsert_shift(db, dep: m.Department, spec: dict) -> m.DepartmentShift:
    sh = (
        db.query(m.DepartmentShift)
        .filter_by(department_id=dep.id, name=spec["name"])
        .first()
    )
    if sh:
        sh.start_time_local = spec["start_time_local"]
        sh.end_time_local = spec["end_time_local"]
        sh.break_minutes = spec["break_minutes"]
        sh.is_active = True
        print(f"    Vardiya GUNCELLENDI: {dep.name} / '{spec['name']}'")
    else:
        sh = m.DepartmentShift(department_id=dep.id, is_active=True, **spec)
        db.add(sh)
        db.flush()
        print(f"    Vardiya OLUSTURULDU: {dep.name} / '{spec['name']}'")
    return sh


def set_weekday_shift(db, dep: m.Department, weekday: int, shift: m.DepartmentShift) -> None:
    existing = (
        db.query(m.DepartmentWeekdayShiftAssignment)
        .filter_by(department_id=dep.id, weekday=weekday)
        .all()
    )
    for a in existing:
        if a.shift_id != shift.id:
            db.delete(a)
    keep = next((a for a in existing if a.shift_id == shift.id), None)
    if keep:
        if not keep.is_active:
            keep.is_active = True
            print(f"    Gun atamasi tekrar AKTIF edildi: {dep.name} {WEEKDAY_NAMES[weekday]} -> '{shift.name}'")
    else:
        db.add(
            m.DepartmentWeekdayShiftAssignment(
                department_id=dep.id, weekday=weekday, shift_id=shift.id, sort_order=0, is_active=True
            )
        )
        print(f"    Gun atamasi EKLENDI: {dep.name} {WEEKDAY_NAMES[weekday]} -> '{shift.name}'")


def clear_weekday_shift(db, dep: m.Department, weekday: int) -> None:
    existing = (
        db.query(m.DepartmentWeekdayShiftAssignment)
        .filter_by(department_id=dep.id, weekday=weekday)
        .all()
    )
    for a in existing:
        db.delete(a)
    if existing:
        print(f"    Gun atamasi KALDIRILDI (kapali gun): {dep.name} {WEEKDAY_NAMES[weekday]}")


def set_weekly_rule(db, dep: m.Department, weekday: int, is_workday: bool, planned_minutes: int, break_minutes: int) -> None:
    rule = db.query(m.DepartmentWeeklyRule).filter_by(department_id=dep.id, weekday=weekday).first()
    if rule:
        rule.is_workday = is_workday
        rule.planned_minutes = planned_minutes
        rule.break_minutes = break_minutes
    else:
        db.add(
            m.DepartmentWeeklyRule(
                department_id=dep.id,
                weekday=weekday,
                is_workday=is_workday,
                planned_minutes=planned_minutes,
                break_minutes=break_minutes,
            )
        )


def apply_ts_template(db) -> None:
    print("== TEKNIK SERVIS KALIBI ==")
    for name in TS_DEPARTMENTS:
        dep = get_department(db, name)
        if not dep:
            continue
        print(f" -> {name}")
        upsert_workrule(db, dep, TS_WORKRULE)
        weekday_shift = upsert_shift(db, dep, TS_WEEKDAY_SHIFT)
        saturday_shift = upsert_shift(db, dep, TS_SATURDAY_SHIFT)
        for wd in (MON, TUE, WED, THU, FRI, SUN):
            set_weekday_shift(db, dep, wd, weekday_shift)
        set_weekday_shift(db, dep, SAT, saturday_shift)


def apply_cm_template(db) -> None:
    print("== CAGRI MERKEZI KALIBI ==")
    for name in CM_DEPARTMENTS:
        dep = get_department(db, name)
        if not dep:
            continue
        print(f" -> {name}")
        upsert_workrule(db, dep, CM_WORKRULE)
        weekday_shift = upsert_shift(db, dep, CM_WEEKDAY_SHIFT)
        saturday_shift = upsert_shift(db, dep, CM_SATURDAY_SHIFT)
        for wd in (MON, TUE, WED, THU, FRI):
            set_weekday_shift(db, dep, wd, weekday_shift)
            set_weekly_rule(db, dep, wd, is_workday=True, planned_minutes=510, break_minutes=60)
        set_weekday_shift(db, dep, SAT, saturday_shift)
        set_weekly_rule(db, dep, SAT, is_workday=True, planned_minutes=360, break_minutes=60)
        clear_weekday_shift(db, dep, SUN)
        set_weekly_rule(db, dep, SUN, is_workday=False, planned_minutes=0, break_minutes=0)


def main() -> None:
    db = SessionLocal()
    try:
        apply_ts_template(db)
        apply_cm_template(db)

        if APPLY:
            db.commit()
            print("APPLY_OK: degisiklikler kaydedildi.")
        else:
            db.rollback()
            print("DRY_RUN_OK: hicbir sey kaydedilmedi. Uygulamak icin --apply ile tekrar calistir.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
