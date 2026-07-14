from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AttendanceEvent,
    AttendanceEventSource,
    AttendanceType,
    DepartmentSchedulePlan,
    DepartmentShift,
    DepartmentWeeklyRule,
    Employee,
    WorkRule,
)
from app.schemas import (
    DailyBoardEmployeeRow,
    DailyBoardResponse,
    DailyBoardStatus,
    DailyBoardSummary,
    EmployeeAttendanceHistoryAggregate,
    EmployeeAttendanceHistoryDay,
    EmployeeAttendanceHistoryResponse,
)
from app.services.attendance import _attendance_timezone
from app.services.control_room import (
    _build_intervals,
    _local_day,
    _normalize_utc,
    _resolve_shift_context,
    _sum_interval_minutes,
)
from app.services.weekday_shift_assignments import (
    build_department_weekday_shift_map,
    list_department_weekday_shift_assignments,
)

MAX_HISTORY_DAYS = 366


def _day_bounds_utc(day_date: date, tz: Any) -> tuple[datetime, datetime]:
    start_utc = datetime.combine(day_date, time.min, tzinfo=tz).astimezone(timezone.utc)
    end_utc = datetime.combine(day_date + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    return start_utc, end_utc


def _derive_day_state(
    schedule: Any,
    day_events: list[AttendanceEvent],
    *,
    day_date: date,
    tz: Any,
    now_utc: datetime,
    now_local: datetime,
    today_local_date: date,
) -> dict[str, Any]:
    sorted_events = sorted(day_events, key=lambda item: (_normalize_utc(item.ts_utc) or now_utc, item.id))
    first_in = next((event for event in sorted_events if event.type == AttendanceType.IN), None)
    last_out = next((event for event in reversed(sorted_events) if event.type == AttendanceType.OUT), None)

    first_in_ts = _normalize_utc(first_in.ts_utc) if first_in is not None else None
    last_out_ts = _normalize_utc(last_out.ts_utc) if last_out is not None else None
    has_in = first_in is not None
    has_valid_out = last_out_ts is not None and first_in_ts is not None and last_out_ts >= first_in_ts

    day_start_utc, day_end_utc = _day_bounds_utc(day_date, tz)
    intervals = _build_intervals(sorted_events, now_utc=now_utc)
    worked_minutes = _sum_interval_minutes(intervals, window_start_utc=day_start_utc, window_end_utc=day_end_utc)

    # is_workday default'u kuralsiz calisanlarda True kalabilir; gercek bir plan
    # sinyali (vardiya saati veya planli dakika) yoksa devamsizlik iddia etme.
    effective_workday = bool(
        schedule.is_workday and (schedule.planned_minutes > 0 or schedule.shift_start_local is not None)
    )
    manual_checkin = bool(first_in is not None and first_in.source == AttendanceEventSource.MANUAL)
    qr_missing = bool(effective_workday and not has_in)

    shift_start = schedule.shift_start_local
    shift_end = schedule.shift_end_local
    grace = max(0, int(schedule.grace_minutes or 0))

    if has_in:
        if has_valid_out:
            status: DailyBoardStatus = "FINISHED"
        elif day_date < today_local_date:
            # Gecmis gunden kapanmamis kayit = cikis yapilmadi (unutulmus).
            status = "OPEN_OVERDUE"
        else:
            # Bugun giris var + cikis yok ise vardiya sonu gecmis olsa bile mesai aciktir.
            status = "IN_PROGRESS"
    elif not effective_workday:
        status = "OFF"
    elif day_date > today_local_date:
        status = "NOT_STARTED"
    elif day_date < today_local_date:
        status = "ABSENT"
    elif shift_end is not None and now_local >= shift_end:
        status = "ABSENT"
    elif shift_start is not None and now_local >= shift_start + timedelta(minutes=grace):
        status = "ABSENT_RISK"
    else:
        status = "NOT_STARTED"

    return {
        "status": status,
        "is_workday": effective_workday,
        "first_in_utc": first_in_ts,
        "last_out_utc": last_out_ts if has_valid_out else None,
        "worked_minutes": worked_minutes,
        "qr_missing": qr_missing,
        "manual_checkin": manual_checkin,
        "shift_window_label": schedule.shift_window_label,
    }


def _load_schedule_maps(db: Session, department_ids: list[int]) -> dict[str, Any]:
    if not department_ids:
        return {
            "work_rule_map": {},
            "weekly_rule_map": defaultdict(dict),
            "shift_map": defaultdict(dict),
            "plan_map": defaultdict(list),
            "weekday_shift_map": {},
        }

    work_rule_rows = list(db.scalars(select(WorkRule).where(WorkRule.department_id.in_(department_ids))).all())
    weekly_rule_rows = list(
        db.scalars(select(DepartmentWeeklyRule).where(DepartmentWeeklyRule.department_id.in_(department_ids))).all()
    )
    shift_rows = list(db.scalars(select(DepartmentShift).where(DepartmentShift.department_id.in_(department_ids))).all())
    plan_rows = list(
        db.scalars(
            select(DepartmentSchedulePlan).where(
                DepartmentSchedulePlan.department_id.in_(department_ids),
                DepartmentSchedulePlan.is_active.is_(True),
            )
        ).all()
    )
    weekday_shift_rows = list_department_weekday_shift_assignments(
        db,
        department_ids=department_ids,
        active_only=True,
    )

    weekly_rule_map: dict[int, dict[int, DepartmentWeeklyRule]] = defaultdict(dict)
    for item in weekly_rule_rows:
        weekly_rule_map[item.department_id][item.weekday] = item
    shift_map: dict[int, dict[int, DepartmentShift]] = defaultdict(dict)
    for item in shift_rows:
        shift_map[item.department_id][item.id] = item
    plan_map: dict[int, list[DepartmentSchedulePlan]] = defaultdict(list)
    for item in sorted(plan_rows, key=lambda row: (row.start_date, row.end_date, row.id)):
        plan_map[item.department_id].append(item)

    return {
        "work_rule_map": {item.department_id: item for item in work_rule_rows},
        "weekly_rule_map": weekly_rule_map,
        "shift_map": shift_map,
        "plan_map": plan_map,
        "weekday_shift_map": build_department_weekday_shift_map(weekday_shift_rows),
    }


def build_daily_attendance_board(
    db: Session,
    *,
    target_date: date | None = None,
    q: str | None = None,
    region_id: int | None = None,
    department_id: int | None = None,
    include_inactive: bool = False,
) -> DailyBoardResponse:
    now_utc = datetime.now(timezone.utc)
    tz = _attendance_timezone()
    now_local = now_utc.astimezone(tz)
    today_local_date = now_local.date()
    if target_date is None:
        target_date = today_local_date

    employee_filters: list[Any] = []
    if not include_inactive:
        employee_filters.append(Employee.is_active.is_(True))
    if region_id is not None:
        employee_filters.append(Employee.region_id == region_id)
    if department_id is not None:
        employee_filters.append(Employee.department_id == department_id)
    normalized_q = (q or "").strip()
    if normalized_q:
        search_filters = [Employee.full_name.ilike(f"%{normalized_q}%")]
        numeric = normalized_q.replace("#", "").strip()
        if numeric.isdigit():
            search_filters.append(Employee.id == int(numeric))
        employee_filters.append(or_(*search_filters))

    employees = list(
        db.scalars(
            select(Employee)
            .options(
                selectinload(Employee.region),
                selectinload(Employee.department),
                selectinload(Employee.shift),
            )
            .where(*employee_filters)
            .order_by(Employee.full_name.asc(), Employee.id.asc())
        ).all()
    )

    summary = DailyBoardSummary(total=len(employees))
    if not employees:
        return DailyBoardResponse(
            generated_at_utc=now_utc,
            target_date=target_date,
            summary=summary,
            items=[],
        )

    employee_ids = [item.id for item in employees]
    department_ids = sorted({item.department_id for item in employees if item.department_id is not None})
    maps = _load_schedule_maps(db, department_ids)

    day_start_utc, day_end_utc = _day_bounds_utc(target_date, tz)
    event_rows = list(
        db.scalars(
            select(AttendanceEvent)
            .where(
                AttendanceEvent.employee_id.in_(employee_ids),
                AttendanceEvent.deleted_at.is_(None),
                AttendanceEvent.ts_utc >= day_start_utc,
                AttendanceEvent.ts_utc < day_end_utc,
            )
            .order_by(AttendanceEvent.employee_id.asc(), AttendanceEvent.ts_utc.asc(), AttendanceEvent.id.asc())
        ).all()
    )
    events_by_employee: dict[int, list[AttendanceEvent]] = defaultdict(list)
    for row in event_rows:
        events_by_employee[row.employee_id].append(row)

    items: list[DailyBoardEmployeeRow] = []
    for employee in employees:
        schedule = _resolve_shift_context(
            employee=employee,
            day_date=target_date,
            work_rule_map=maps["work_rule_map"],
            weekly_rule_map=maps["weekly_rule_map"],
            weekday_shift_map=maps["weekday_shift_map"],
            shift_map=maps["shift_map"],
            plan_map=maps["plan_map"],
        )
        state = _derive_day_state(
            schedule,
            events_by_employee.get(employee.id, []),
            day_date=target_date,
            tz=tz,
            now_utc=now_utc,
            now_local=now_local,
            today_local_date=today_local_date,
        )
        items.append(
            DailyBoardEmployeeRow(
                employee_id=employee.id,
                full_name=employee.full_name,
                region_id=employee.region_id,
                region_name=employee.region.name if employee.region is not None else None,
                department_id=employee.department_id,
                department_name=employee.department.name if employee.department is not None else None,
                is_active=employee.is_active,
                status=state["status"],
                is_workday=state["is_workday"],
                shift_window_label=state["shift_window_label"],
                first_in_utc=state["first_in_utc"],
                last_out_utc=state["last_out_utc"],
                worked_minutes=state["worked_minutes"],
                qr_missing=state["qr_missing"],
                manual_checkin=state["manual_checkin"],
            )
        )

    summary.active = sum(1 for row in items if row.is_active)
    summary.working = sum(1 for row in items if row.status == "IN_PROGRESS")
    summary.finished = sum(1 for row in items if row.status == "FINISHED")
    summary.absent = sum(1 for row in items if row.status == "ABSENT")
    summary.absent_risk = sum(1 for row in items if row.status == "ABSENT_RISK")
    summary.not_started = sum(1 for row in items if row.status == "NOT_STARTED")
    summary.open_overdue = sum(1 for row in items if row.status == "OPEN_OVERDUE")
    summary.off = sum(1 for row in items if row.status == "OFF")
    summary.qr_missing = sum(1 for row in items if row.qr_missing)

    return DailyBoardResponse(
        generated_at_utc=now_utc,
        target_date=target_date,
        summary=summary,
        items=items,
    )


def build_employee_attendance_history(
    db: Session,
    *,
    employee_id: int,
    start_date: date,
    end_date: date,
) -> EmployeeAttendanceHistoryResponse:
    employee = db.scalar(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.shift))
        .where(Employee.id == employee_id)
    )
    if employee is None:
        raise ValueError("employee not found")

    if end_date < start_date:
        start_date, end_date = end_date, start_date
    span_days = (end_date - start_date).days + 1
    if span_days > MAX_HISTORY_DAYS:
        start_date = end_date - timedelta(days=MAX_HISTORY_DAYS - 1)

    now_utc = datetime.now(timezone.utc)
    tz = _attendance_timezone()
    now_local = now_utc.astimezone(tz)
    today_local_date = now_local.date()

    department_ids = [employee.department_id] if employee.department_id is not None else []
    maps = _load_schedule_maps(db, department_ids)

    range_start_utc, _ = _day_bounds_utc(start_date, tz)
    _, range_end_utc = _day_bounds_utc(end_date, tz)
    event_rows = list(
        db.scalars(
            select(AttendanceEvent)
            .where(
                AttendanceEvent.employee_id == employee_id,
                AttendanceEvent.deleted_at.is_(None),
                AttendanceEvent.ts_utc >= range_start_utc,
                AttendanceEvent.ts_utc < range_end_utc,
            )
            .order_by(AttendanceEvent.ts_utc.asc(), AttendanceEvent.id.asc())
        ).all()
    )
    events_by_day: dict[date, list[AttendanceEvent]] = defaultdict(list)
    for row in event_rows:
        local_day = _local_day(row.ts_utc, tz)
        if local_day is not None:
            events_by_day[local_day].append(row)

    days: list[EmployeeAttendanceHistoryDay] = []
    aggregate = EmployeeAttendanceHistoryAggregate()
    for offset in range(span_days):
        day_date = start_date + timedelta(days=offset)
        schedule = _resolve_shift_context(
            employee=employee,
            day_date=day_date,
            work_rule_map=maps["work_rule_map"],
            weekly_rule_map=maps["weekly_rule_map"],
            weekday_shift_map=maps["weekday_shift_map"],
            shift_map=maps["shift_map"],
            plan_map=maps["plan_map"],
        )
        state = _derive_day_state(
            schedule,
            events_by_day.get(day_date, []),
            day_date=day_date,
            tz=tz,
            now_utc=now_utc,
            now_local=now_local,
            today_local_date=today_local_date,
        )
        days.append(
            EmployeeAttendanceHistoryDay(
                day=day_date,
                is_workday=state["is_workday"],
                status=state["status"],
                first_in_utc=state["first_in_utc"],
                last_out_utc=state["last_out_utc"],
                worked_minutes=state["worked_minutes"],
                qr_missing=state["qr_missing"],
                manual_checkin=state["manual_checkin"],
            )
        )
        if state["is_workday"]:
            aggregate.workday_count += 1
        if state["status"] in ("FINISHED", "IN_PROGRESS", "OPEN_OVERDUE"):
            aggregate.worked_days += 1
        if state["status"] == "ABSENT":
            aggregate.absent_days += 1
            aggregate.absent_dates.append(day_date)
        if state["qr_missing"]:
            aggregate.qr_missing_days += 1
        if state["status"] == "OPEN_OVERDUE":
            aggregate.incomplete_days += 1

    return EmployeeAttendanceHistoryResponse(
        employee_id=employee.id,
        full_name=employee.full_name,
        department_name=employee.department.name if employee.department is not None else None,
        start_date=start_date,
        end_date=end_date,
        aggregate=aggregate,
        days=days,
    )
