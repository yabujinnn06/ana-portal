"""Salt-okunur rapor: departman/vardiya/kural durumu.

Hicbir yazma islemi yapmaz. Render shell'den calistir:
    python scripts/report_department_shifts.py

Cikti: her departman icin WorkRule, DepartmentWeeklyRule (haftalik gun kurallari),
DepartmentShift (tanimli vardiyalar) ve DepartmentWeekdayShiftAssignment (gune atanan
vardiyalar) + calisan sayisi / vardiyasiz calisan sayisi.
"""
from __future__ import annotations

from app.db import SessionLocal
from app import models as m

WEEKDAY_NAMES = ["Pazartesi", "Sali", "Carsamba", "Persembe", "Cuma", "Cumartesi", "Pazar"]


def main() -> None:
    db = SessionLocal()
    try:
        departments = (
            db.query(m.Department)
            .outerjoin(m.Region)
            .order_by(m.Region.name.nullslast(), m.Department.name)
            .all()
        )
        print(f"TOPLAM_DEPARTMAN={len(departments)}")
        print("=" * 70)

        for dep in departments:
            region_name = dep.region.name if dep.region else "(bolgesiz)"
            emp_count = db.query(m.Employee).filter(m.Employee.department_id == dep.id).count()
            emp_no_shift = (
                db.query(m.Employee)
                .filter(m.Employee.department_id == dep.id, m.Employee.shift_id.is_(None))
                .count()
            )

            print(f"[DEPT #{dep.id}] {dep.name}  (bolge: {region_name})")
            print(f"  calisan_sayisi={emp_count}  vardiyasiz_calisan={emp_no_shift}")

            wr = db.query(m.WorkRule).filter(m.WorkRule.department_id == dep.id).first()
            if wr:
                print(
                    "  WorkRule: "
                    f"gunluk_dk={wr.daily_minutes_planned} mola_dk={wr.break_minutes} "
                    f"tolerans_dk={wr.grace_minutes} erken_gelis_tolerans={wr.early_arrival_tolerance_minutes} "
                    f"fm_tolerans={wr.overtime_grace_minutes} vardiya_disi_tolerans={wr.off_shift_tolerance_minutes} "
                    f"fm_esik_net_dk={wr.overtime_threshold_minutes}"
                )
            else:
                print("  WorkRule: YOK")

            weekly_rules = (
                db.query(m.DepartmentWeeklyRule)
                .filter(m.DepartmentWeeklyRule.department_id == dep.id)
                .order_by(m.DepartmentWeeklyRule.weekday)
                .all()
            )
            if weekly_rules:
                print("  Haftalik gun kurallari (DepartmentWeeklyRule):")
                for wrule in weekly_rules:
                    gun = WEEKDAY_NAMES[wrule.weekday] if 0 <= wrule.weekday <= 6 else wrule.weekday
                    durum = "calisma_gunu" if wrule.is_workday else "TATIL"
                    print(
                        f"    {gun}: {durum} planlanan_dk={wrule.planned_minutes} mola_dk={wrule.break_minutes}"
                    )
            else:
                print("  Haftalik gun kurallari: YOK (fallback davranis gecerli)")

            shifts = (
                db.query(m.DepartmentShift)
                .filter(m.DepartmentShift.department_id == dep.id)
                .order_by(m.DepartmentShift.name)
                .all()
            )
            if shifts:
                print("  Tanimli vardiyalar (DepartmentShift):")
                for sh in shifts:
                    aktif = "aktif" if sh.is_active else "PASIF"
                    print(
                        f"    #{sh.id} '{sh.name}' {sh.start_time_local}-{sh.end_time_local} "
                        f"mola_dk={sh.break_minutes} [{aktif}]"
                    )
            else:
                print("  Tanimli vardiyalar: YOK")

            assignments = (
                db.query(m.DepartmentWeekdayShiftAssignment, m.DepartmentShift)
                .join(m.DepartmentShift, m.DepartmentShift.id == m.DepartmentWeekdayShiftAssignment.shift_id)
                .filter(m.DepartmentWeekdayShiftAssignment.department_id == dep.id)
                .order_by(m.DepartmentWeekdayShiftAssignment.weekday, m.DepartmentWeekdayShiftAssignment.sort_order)
                .all()
            )
            if assignments:
                print("  Gunluk vardiya plani (DepartmentWeekdayShiftAssignment):")
                for a, sh in assignments:
                    gun = WEEKDAY_NAMES[a.weekday] if 0 <= a.weekday <= 6 else a.weekday
                    durum = "aktif" if a.is_active else "PASIF"
                    print(f"    {gun}: '{sh.name}' {sh.start_time_local}-{sh.end_time_local} [{durum}]")
            else:
                print("  Gunluk vardiya plani: YOK")

            print("-" * 70)

        print("RAPOR_TAMAM")
    finally:
        db.close()


if __name__ == "__main__":
    main()
