"""Demo veri olusturucu - sadece lokal tanitim/SS amacli.

Gercek calisan PII'si KULLANILMAZ. Tum isimler uydurma demo verisidir.
Calistirma: .venv/Scripts/python.exe scripts/seed_demo.py
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.db import SessionLocal, engine
from app import models as m

IST = ZoneInfo("Europe/Istanbul")


def local_to_utc(d: date, hh: int, mm: int) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=IST).astimezone(timezone.utc)


def wipe(db):
    # Demo amacli temiz baslangic icin iliskili tablolari bosalt.
    for table in [
        m.AttendanceEvent, m.DeviceInvite, m.EmployeeLocation, m.Leave,
        m.Device, m.Employee, m.DepartmentShift, m.WorkRule, m.Department, m.Region,
    ]:
        db.query(table).delete()
    db.commit()


def main() -> None:
    db = SessionLocal()
    try:
        wipe(db)

        region = m.Region(name="Istanbul Merkez", is_active=True)
        db.add(region)
        db.flush()

        dep_defs = [
            ("Uretim", time(8, 0), time(18, 0)),
            ("Idari Isler", time(9, 0), time(18, 0)),
            ("Lojistik", time(8, 0), time(17, 0)),
        ]
        deps = {}
        shifts = {}
        for name, start, end in dep_defs:
            dep = m.Department(name=name, region_id=region.id)
            db.add(dep)
            db.flush()
            deps[name] = dep
            db.add(m.WorkRule(department_id=dep.id, daily_minutes_planned=540, break_minutes=60, grace_minutes=5))
            sh = m.DepartmentShift(
                department_id=dep.id, name="Gunduz", start_time_local=start,
                end_time_local=end, break_minutes=60, is_active=True,
            )
            db.add(sh)
            db.flush()
            shifts[name] = sh

        # (ad, departman, bugunku_durum) -> durum: full|late|in|leave
        people = [
            ("Ahmet Yilmaz", "Uretim", "in"),
            ("Ayse Demir", "Uretim", "in"),
            ("Mehmet Kaya", "Uretim", "late"),
            ("Fatma Sahin", "Idari Isler", "in"),
            ("Mustafa Celik", "Idari Isler", "leave"),
            ("Zeynep Arslan", "Idari Isler", "in"),
            ("Emre Dogan", "Lojistik", "in"),
            ("Elif Yildiz", "Lojistik", "full"),
            ("Burak Ozturk", "Lojistik", "in"),
        ]

        base_lat, base_lon = 41.0608, 28.9870  # Istanbul Sisli civari
        employees = []
        for idx, (full_name, dep_name, _state) in enumerate(people):
            emp = m.Employee(
                full_name=full_name,
                region_id=region.id,
                department_id=deps[dep_name].id,
                shift_id=shifts[dep_name].id,
                is_active=True,
                contract_weekly_minutes=2700,  # 45 saat
            )
            db.add(emp)
            db.flush()
            db.add(m.EmployeeLocation(
                employee_id=emp.id,
                home_lat=base_lat + idx * 0.0006,
                home_lon=base_lon + idx * 0.0006,
                radius_m=150,
            ))
            dev = m.Device(
                employee_id=emp.id,
                device_fingerprint=f"demo-fp-{emp.id:03d}-{full_name.split()[0].lower()}",
                is_active=True,
            )
            db.add(dev)
            db.flush()
            employees.append((emp, dev, _state))

        today = datetime.now(IST).date()
        now_local = datetime.now(IST)

        def add_event(emp_id, dev_id, ts_utc, etype):
            db.add(m.AttendanceEvent(
                employee_id=emp_id, device_id=dev_id, type=etype, ts_utc=ts_utc,
                lat=base_lat, lon=base_lon, accuracy_m=18.0,
                location_status=m.LocationStatus.VERIFIED_HOME,
                source=m.AttendanceEventSource.DEVICE,
            ))

        # Gecmis 6 is gunu: tam giris-cikis, bazi gunlerde fazla mesai.
        ot_pattern = [0, 90, 0, 45, 0, 120]  # dakika fazla mesai
        for emp, dev, state in employees:
            day_offset = 0
            collected = 0
            d = today
            while collected < 6:
                d = d - timedelta(days=1)
                if d.weekday() == 6:  # Pazar tatil
                    continue
                in_min = 0 if emp.id % 3 else 7
                add_event(emp.id, dev.id, local_to_utc(d, 8, in_min), m.AttendanceType.IN)
                ot = ot_pattern[(emp.id + collected) % len(ot_pattern)]
                out_dt = datetime(d.year, d.month, d.day, 18, 0, tzinfo=IST) + timedelta(minutes=ot)
                add_event(emp.id, dev.id, out_dt.astimezone(timezone.utc), m.AttendanceType.OUT)
                collected += 1
                day_offset += 1

        # Bugun: canli board icin durumlar.
        for emp, dev, state in employees:
            if state == "leave":
                continue
            if state == "late":
                add_event(emp.id, dev.id, local_to_utc(today, 9, 32), m.AttendanceType.IN)
            elif state == "full":
                add_event(emp.id, dev.id, local_to_utc(today, 8, 2), m.AttendanceType.IN)
                out_full = now_local - timedelta(minutes=20)
                add_event(emp.id, dev.id, out_full.astimezone(timezone.utc), m.AttendanceType.OUT)
            else:  # in
                in_dt = now_local - timedelta(hours=3, minutes=40)
                if in_dt.time() < time(7, 30):
                    in_dt = now_local.replace(hour=8, minute=4, second=0, microsecond=0)
                add_event(emp.id, dev.id, in_dt.astimezone(timezone.utc), m.AttendanceType.IN)

        # Izinler: bugun izinli olan + bekleyen talep.
        mustafa = next(e for e, _, s in employees if s == "leave")
        db.add(m.Leave(
            employee_id=mustafa.id, start_date=today, end_date=today,
            type=m.LeaveType.ANNUAL, status=m.LeaveStatus.APPROVED,
            note="Yillik izin", requested_by_employee=True,
            decided_at=datetime.now(timezone.utc),
        ))
        zeynep = next(e for e, _, s in employees if e.full_name == "Zeynep Arslan")
        db.add(m.Leave(
            employee_id=zeynep.id,
            start_date=today + timedelta(days=3), end_date=today + timedelta(days=4),
            type=m.LeaveType.EXCUSE, status=m.LeaveStatus.PENDING,
            note="Saglik raporu randevusu", requested_by_employee=True,
        ))

        # Bagli olmayan calisan + aktif davet (claim token ekrani icin).
        pending_emp = m.Employee(
            full_name="Yeni Calisan", region_id=region.id,
            department_id=deps["Uretim"].id, shift_id=shifts["Uretim"].id,
            is_active=True, contract_weekly_minutes=2700,
        )
        db.add(pending_emp)
        db.flush()
        db.add(m.DeviceInvite(
            employee_id=pending_emp.id,
            token="demo-davet-7h2k9p",
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            is_used=False, max_attempts=5,
        ))

        db.commit()

        emp_count = db.query(m.Employee).count()
        ev_count = db.query(m.AttendanceEvent).count()
        print(f"SEED_OK employees={emp_count} events={ev_count} invite_token=demo-davet-7h2k9p")
    finally:
        db.close()


if __name__ == "__main__":
    main()
