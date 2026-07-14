from __future__ import annotations

import unittest
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.models import AttendanceEvent, AttendanceEventSource, AttendanceType
from app.services.attendance_board import _derive_day_state
from app.services.control_room import ScheduleContext

TZ = ZoneInfo("Europe/Istanbul")
DAY = date(2026, 6, 3)


def _utc(hour: int, minute: int, day: date = DAY) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=TZ).astimezone(timezone.utc)


def _sched(*, is_workday: bool = True, planned: int = 540, with_times: bool = True, grace: int = 5) -> ScheduleContext:
    start = datetime.combine(DAY, time(9, 0), tzinfo=TZ) if with_times else None
    end = datetime.combine(DAY, time(18, 0), tzinfo=TZ) if with_times else None
    return ScheduleContext(
        shift_name="Vardiya",
        shift_window_label="09:00 - 18:00",
        shift_start_local=start,
        shift_end_local=end,
        planned_minutes=planned,
        break_minutes=60,
        grace_minutes=grace,
        early_arrival_tolerance_minutes=0,
        overtime_grace_minutes=0,
        off_shift_tolerance_minutes=0,
        is_workday=is_workday,
    )


def _ev(eid: int, etype: AttendanceType, hour: int, minute: int, *, source=AttendanceEventSource.DEVICE, day=DAY) -> AttendanceEvent:
    return AttendanceEvent(id=eid, type=etype, ts_utc=_utc(hour, minute, day), source=source)


def _derive(schedule, events, *, now_h=12, now_m=0, day_date=DAY, today=DAY):
    now_utc = datetime.combine(today, time(now_h, now_m), tzinfo=TZ).astimezone(timezone.utc)
    return _derive_day_state(
        schedule,
        events,
        day_date=day_date,
        tz=TZ,
        now_utc=now_utc,
        now_local=now_utc.astimezone(TZ),
        today_local_date=today,
    )


class DeriveDayStateTests(unittest.TestCase):
    def test_absent_risk_after_grace(self) -> None:
        state = _derive(_sched(), [], now_h=10, now_m=0)
        self.assertEqual(state["status"], "ABSENT_RISK")
        self.assertTrue(state["qr_missing"])

    def test_absent_after_shift_end(self) -> None:
        state = _derive(_sched(), [], now_h=19, now_m=0)
        self.assertEqual(state["status"], "ABSENT")

    def test_not_started_before_grace(self) -> None:
        state = _derive(_sched(), [], now_h=8, now_m=0)
        self.assertEqual(state["status"], "NOT_STARTED")
        self.assertTrue(state["qr_missing"])

    def test_past_workday_without_checkin_is_absent(self) -> None:
        past = DAY - timedelta(days=1)
        state = _derive(_sched(), [], now_h=10, now_m=0, day_date=past)
        self.assertEqual(state["status"], "ABSENT")

    def test_in_progress(self) -> None:
        state = _derive(_sched(), [_ev(1, AttendanceType.IN, 9, 10)], now_h=12, now_m=0)
        self.assertEqual(state["status"], "IN_PROGRESS")
        self.assertFalse(state["qr_missing"])

    def test_today_open_after_shift_end_stays_in_progress(self) -> None:
        state = _derive(_sched(), [_ev(1, AttendanceType.IN, 9, 10)], now_h=19, now_m=0)
        self.assertEqual(state["status"], "IN_PROGRESS")

    def test_past_open_without_checkout_is_open_overdue(self) -> None:
        past = DAY - timedelta(days=1)
        state = _derive(
            _sched(),
            [_ev(1, AttendanceType.IN, 9, 10, day=past)],
            now_h=12,
            now_m=0,
            day_date=past,
        )
        self.assertEqual(state["status"], "OPEN_OVERDUE")

    def test_finished_with_worked_minutes(self) -> None:
        events = [_ev(1, AttendanceType.IN, 9, 10), _ev(2, AttendanceType.OUT, 18, 5)]
        state = _derive(_sched(), events, now_h=19, now_m=0)
        self.assertEqual(state["status"], "FINISHED")
        self.assertEqual(state["worked_minutes"], 535)

    def test_manual_checkin_counts_as_scanned(self) -> None:
        events = [_ev(1, AttendanceType.IN, 9, 10, source=AttendanceEventSource.MANUAL)]
        state = _derive(_sched(), events, now_h=12, now_m=0)
        self.assertTrue(state["manual_checkin"])
        self.assertFalse(state["qr_missing"])

    def test_off_day_without_events(self) -> None:
        state = _derive(_sched(is_workday=False, planned=0, with_times=False), [], now_h=12, now_m=0)
        self.assertEqual(state["status"], "OFF")
        self.assertFalse(state["qr_missing"])

    def test_unscheduled_workday_is_not_absent(self) -> None:
        past = DAY - timedelta(days=1)
        state = _derive(
            _sched(is_workday=True, planned=0, with_times=False),
            [],
            now_h=12,
            now_m=0,
            day_date=past,
        )
        self.assertEqual(state["status"], "OFF")


if __name__ == "__main__":
    unittest.main()
