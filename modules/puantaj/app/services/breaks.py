"""Calisan mola takibi: basla/bitir/durum + gunluk limit asim uyarisi.

Aylik puantaj, planlanan molayi asan fiili mola dakikasini plan ustu/FM1'den
duser. Limit departman WorkRule.break_minutes'tan gelir; gunluk toplam mola
limiti + tolerans (10 dk) asarsa hem calisana hem admine push gider (gunde 1 kez)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import BreakEvent, Device, Employee, WorkRule
from app.services.attendance import (
    _attendance_timezone,
    _resolve_active_device,
    _resolve_today_status_for_employee,
)
from app.services.push_notifications import send_push_to_admins, send_push_to_employees

BREAK_ALERT_GRACE_MINUTES = 10
DEFAULT_BREAK_LIMIT_MINUTES = 60


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _local_day(value: datetime) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(_attendance_timezone()).date()


def _local_day_bounds_utc(local_day: date) -> tuple[datetime, datetime]:
    tz = _attendance_timezone()
    start = datetime.combine(local_day, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(local_day + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    return start, end


def _duration_minutes(break_row: BreakEvent, *, now: datetime) -> int:
    end = break_row.ended_at or now
    started = break_row.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    return max(0, int((end - started).total_seconds() // 60))


def resolve_break_limit_minutes(db: Session, employee: Employee) -> int:
    if employee.department_id is None:
        return DEFAULT_BREAK_LIMIT_MINUTES
    rule = db.scalar(select(WorkRule).where(WorkRule.department_id == employee.department_id))
    if rule is None:
        return DEFAULT_BREAK_LIMIT_MINUTES
    return max(0, int(rule.break_minutes))


def _open_break(db: Session, employee_id: int) -> BreakEvent | None:
    return db.scalar(
        select(BreakEvent)
        .where(BreakEvent.employee_id == employee_id, BreakEvent.ended_at.is_(None))
        .order_by(BreakEvent.started_at.desc())
    )


def _breaks_for_local_day(db: Session, employee_id: int, local_day: date) -> list[BreakEvent]:
    start, end = _local_day_bounds_utc(local_day)
    return list(
        db.scalars(
            select(BreakEvent)
            .where(
                BreakEvent.employee_id == employee_id,
                BreakEvent.started_at >= start,
                BreakEvent.started_at < end,
            )
            .order_by(BreakEvent.started_at.asc())
        ).all()
    )


def _today_total_minutes(db: Session, employee_id: int, *, now: datetime) -> int:
    rows = _breaks_for_local_day(db, employee_id, _local_day(now))
    return sum(_duration_minutes(r, now=now) for r in rows)


def _device_employee(db: Session, device_fingerprint: str) -> tuple[Device, Employee]:
    device = _resolve_active_device(db, device_fingerprint=device_fingerprint)
    employee = db.get(Employee, device.employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return device, employee


def _maybe_alert_over_limit(
    db: Session, employee: Employee, *, now: datetime, trigger: BreakEvent | None
) -> bool:
    """Gunluk mola limit + 10 dk asildiysa ve bugun henuz uyarilmadiysa cift push gonder."""
    limit = resolve_break_limit_minutes(db, employee)
    local_day = _local_day(now)
    rows = _breaks_for_local_day(db, employee.id, local_day)
    total = sum(_duration_minutes(r, now=now) for r in rows)
    if total <= limit + BREAK_ALERT_GRACE_MINUTES:
        return False
    if any(r.over_limit_alerted for r in rows):
        return False  # bugun zaten uyarildi

    marked = trigger or _open_break(db, employee.id) or (rows[-1] if rows else None)
    if marked is not None:
        marked.over_limit_alerted = True
        db.commit()

    name = employee.full_name or f"#{employee.id}"
    send_push_to_employees(
        db,
        employee_ids=[employee.id],
        title="Mola süresi aşıldı",
        body=f"Bugünkü toplam molan {total} dk (limit {limit} dk). Lütfen işbaşı yap.",
        data={"type": "BREAK_OVER_LIMIT", "total_minutes": total, "limit_minutes": limit},
    )
    send_push_to_admins(
        db,
        title="Mola limiti aşıldı",
        body=f"{name} bugün {total} dk mola yaptı (limit {limit} dk).",
        data={"type": "BREAK_OVER_LIMIT", "employee_id": employee.id, "total_minutes": total},
    )
    return True


def _local_hhmm(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(_attendance_timezone()).strftime("%H:%M")


def _notify_admin_break(db: Session, employee: Employee, *, started: bool, when: datetime, minutes: int | None = None) -> None:
    name = employee.full_name or f"#{employee.id}"
    if started:
        title = "Mola başladı"
        body = f"{name} {_local_hhmm(when)} itibarıyla molaya çıktı."
    else:
        suffix = f" ({minutes} dk)" if minutes is not None else ""
        title = "Moladan dönüldü"
        body = f"{name} {_local_hhmm(when)} itibarıyla moladan döndü{suffix}."
    send_push_to_admins(
        db,
        title=title,
        body=body,
        data={"type": "BREAK_STARTED" if started else "BREAK_ENDED", "employee_id": employee.id},
    )


def start_break(db: Session, *, device_fingerprint: str) -> BreakEvent:
    device, employee = _device_employee(db, device_fingerprint)
    today_status, _, _, _ = _resolve_today_status_for_employee(db, employee_id=employee.id)
    if today_status != "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Mesai başlamadan mola alınamaz. Önce giriş yapın.",
        )
    if _open_break(db, employee.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Zaten devam eden bir mola var.")
    now = _now()
    row = BreakEvent(employee_id=employee.id, device_id=device.id, started_at=now)
    db.add(row)
    db.commit()
    db.refresh(row)
    _notify_admin_break(db, employee, started=True, when=now)
    return row


def end_break(db: Session, *, device_fingerprint: str) -> BreakEvent:
    _, employee = _device_employee(db, device_fingerprint)
    row = _open_break(db, employee.id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Devam eden mola yok.")
    now = _now()
    row.ended_at = now
    db.commit()
    db.refresh(row)
    _notify_admin_break(db, employee, started=False, when=now, minutes=_duration_minutes(row, now=now))
    _maybe_alert_over_limit(db, employee, now=now, trigger=row)
    return row


def get_break_status(db: Session, *, device_fingerprint: str) -> dict:
    _, employee = _device_employee(db, device_fingerprint)
    now = _now()
    open_break = _open_break(db, employee.id)
    if open_break is not None:
        _maybe_alert_over_limit(db, employee, now=now, trigger=open_break)
    limit = resolve_break_limit_minutes(db, employee)
    total = _today_total_minutes(db, employee.id, now=now)
    return {
        "employee_id": employee.id,
        "on_break": open_break is not None,
        "current_started_at": open_break.started_at if open_break is not None else None,
        "current_elapsed_minutes": _duration_minutes(open_break, now=now) if open_break is not None else 0,
        "today_total_minutes": total,
        "limit_minutes": limit,
        "over_limit": total > limit + BREAK_ALERT_GRACE_MINUTES,
    }


def check_break_over_limits(now: datetime | None = None, *, db: Session | None = None) -> int:
    """Periyodik worker: acik molasi limit+10'u asmis calisanlari uyar (app kapali olsa bile)."""
    if db is None:
        with SessionLocal() as managed_db:
            return check_break_over_limits(now, db=managed_db)
    now = now or _now()
    open_breaks = list(db.scalars(select(BreakEvent).where(BreakEvent.ended_at.is_(None))).all())
    alerted = 0
    for row in open_breaks:
        employee = db.get(Employee, row.employee_id)
        if employee is None:
            continue
        if _maybe_alert_over_limit(db, employee, now=now, trigger=row):
            alerted += 1
    return alerted


def daily_break_minutes_map(db: Session, *, employee_id: int, year: int, month: int) -> dict[date, int]:
    """Ay icindeki gunluk mola dakikalari (aylik rapor icin). Acik mola simdiye kadar sayilir."""
    first = date(year, month, 1)
    next_month = date(year + (month // 12), (month % 12) + 1, 1)
    start, _ = _local_day_bounds_utc(first)
    _, end = _local_day_bounds_utc(next_month - timedelta(days=1))
    now = _now()
    rows = db.scalars(
        select(BreakEvent)
        .where(
            BreakEvent.employee_id == employee_id,
            BreakEvent.started_at >= start,
            BreakEvent.started_at < end,
        )
    ).all()
    result: dict[date, int] = {}
    for row in rows:
        day = _local_day(row.started_at)
        result[day] = result.get(day, 0) + _duration_minutes(row, now=now)
    return result
