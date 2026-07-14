from __future__ import annotations

from datetime import date, datetime, time, timezone
import unittest

from app.models import (
    AttendanceEvent,
    AttendanceType,
    BreakEvent,
    DepartmentSchedulePlan,
    DepartmentShift,
    DepartmentWeekdayShiftAssignment,
    DepartmentWeeklyRule,
    Employee,
    EmployeeWeeklyRestDay,
    Leave,
    LeaveStatus,
    LeaveType,
    LocationStatus,
    ManualDayOverride,
    OvertimeCode,
    SchedulePlanTargetType,
    SpecialDay,
    SpecialDayEmployeeOverride,
    SpecialDayType,
    SpecialDayWorkPolicy,
    WorkRule,
)
from app.services.monthly import calculate_employee_monthly


class _ScalarRows:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeMonthlyDB:
    def __init__(self, scalar_values, scalars_values):
        self._scalar_values = list(scalar_values)
        self._scalars_values = list(scalars_values)

    def scalar(self, _statement):  # type: ignore[no-untyped-def]
        if not self._scalar_values:
            return None
        return self._scalar_values.pop(0)

    def scalars(self, _statement):  # type: ignore[no-untyped-def]
        if not self._scalars_values:
            return _ScalarRows([])
        return _ScalarRows(self._scalars_values.pop(0))


class WeeklyRulesAndShiftsTests(unittest.TestCase):
    def test_off_day_status_when_weekly_rule_marks_non_workday(self) -> None:
        employee = Employee(id=1, full_name="Test", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=1,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        sunday_off = DepartmentWeeklyRule(
            id=1,
            department_id=1,
            weekday=6,
            is_workday=False,
            planned_minutes=0,
            break_minutes=0,
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [],
                [],
                [],
                [sunday_off],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=1, year=2026, month=2)
        first_day = next((day for day in report.days if day.date == date(2026, 2, 1)), None)
        self.assertIsNotNone(first_day)
        self.assertEqual(first_day.status, "OFF")
        self.assertEqual(first_day.worked_minutes, 0)

    def test_weekday_shift_assignment_overrides_legacy_weekly_off_rule(self) -> None:
        employee = Employee(id=11, full_name="Assigned User", department_id=1, shift_id=10, is_active=True)
        work_rule = WorkRule(
            id=11,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        sunday_off = DepartmentWeeklyRule(
            id=11,
            department_id=1,
            weekday=6,
            is_workday=False,
            planned_minutes=0,
            break_minutes=0,
        )
        shift = DepartmentShift(
            id=10,
            department_id=1,
            name="Pazar 09:00-14:00",
            start_time_local=time(9, 0),
            end_time_local=time(14, 0),
            break_minutes=0,
            is_active=True,
        )
        assignment = DepartmentWeekdayShiftAssignment(
            id=1,
            department_id=1,
            weekday=6,
            shift_id=10,
            sort_order=0,
            is_active=True,
        )
        assignment.shift = shift

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [],
                [],
                [],
                [sunday_off],
                [shift],
                [assignment],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=11, year=2026, month=2)
        first_day = next((day for day in report.days if day.date == date(2026, 2, 1)), None)
        self.assertIsNotNone(first_day)
        assert first_day is not None
        self.assertEqual(first_day.status, "INCOMPLETE")
        self.assertEqual(first_day.shift_id, 10)
        self.assertIn("MISSING_IN", first_day.flags)
        self.assertNotEqual(first_day.status, "OFF")

    def test_shift_assignment_changes_daily_planned_and_overtime(self) -> None:
        employee = Employee(id=2, full_name="Shift User", department_id=1, shift_id=10, is_active=True)
        work_rule = WorkRule(
            id=2,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        shift = DepartmentShift(
            id=10,
            department_id=1,
            name="Stant 10-18",
            start_time_local=time(10, 0),
            end_time_local=time(18, 0),
            break_minutes=60,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=101,
            employee_id=2,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 2, 7, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=102,
            employee_id=2,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 2, 16, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [shift],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=2, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 2)), None)
        self.assertIsNotNone(target_day)
        self.assertEqual(target_day.status, "OK")
        self.assertEqual(target_day.shift_id, 10)
        self.assertEqual(target_day.shift_name, "Stant 10-18")
        # Vardiya sonrasi ham fazla mesai 60 dk; tolerans (overtime_grace_minutes) tanimli
        # degil (0) oldugundan tamami FM1 olarak kalir (gun ici mola artik FM1'den dusulmez).
        self.assertEqual(target_day.plan_overtime_minutes, 60)
        self.assertEqual(target_day.overtime_minutes, 60)

    def test_monthly_report_prefers_event_shift_over_default_weekday_shift(self) -> None:
        employee = Employee(id=22, full_name="Basak Celik", department_id=1, shift_id=10, is_active=True)
        work_rule = WorkRule(
            id=22,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        morning_shift = DepartmentShift(
            id=10,
            department_id=1,
            name="10-18 stant",
            start_time_local=time(10, 0),
            end_time_local=time(18, 0),
            break_minutes=60,
            is_active=True,
        )
        late_shift = DepartmentShift(
            id=20,
            department_id=1,
            name="14-22 stant",
            start_time_local=time(14, 0),
            end_time_local=time(22, 0),
            break_minutes=60,
            is_active=True,
        )
        monday_morning = DepartmentWeekdayShiftAssignment(
            id=10,
            department_id=1,
            weekday=0,
            shift_id=10,
            sort_order=0,
            is_active=True,
        )
        monday_morning.shift = morning_shift
        monday_late = DepartmentWeekdayShiftAssignment(
            id=20,
            department_id=1,
            weekday=0,
            shift_id=20,
            sort_order=1,
            is_active=True,
        )
        monday_late.shift = late_shift
        event_in = AttendanceEvent(
            id=2201,
            employee_id=22,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 2, 11, 37, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={"SHIFT_ID": 20, "AUTO_SHIFT_ASSIGNED": True},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in],
                [],
                [],
                [],
                [morning_shift, late_shift],
                [monday_morning, monday_late],
                [],
                [],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=22, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 2)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.check_in, event_in.ts_utc)
        self.assertEqual(target_day.shift_id, 20)
        self.assertEqual(target_day.shift_name, "14-22 stant")
        self.assertIn("AUTO_SHIFT_ASSIGNED", target_day.flags)

    def test_early_arrival_is_reported_separately_from_overtime(self) -> None:
        employee = Employee(id=21, full_name="Early User", department_id=1, shift_id=10, is_active=True)
        work_rule = WorkRule(
            id=21,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        shift = DepartmentShift(
            id=10,
            department_id=1,
            name="Sabah 09:30-18:30",
            start_time_local=time(9, 30),
            end_time_local=time(18, 30),
            break_minutes=60,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=211,
            employee_id=21,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 3, 6, 15, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=212,
            employee_id=21,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 3, 15, 30, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [shift],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=21, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 3)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.early_arrival_minutes, 15)
        self.assertEqual(target_day.overtime_minutes, 0)
        self.assertEqual(report.totals.early_arrival_minutes, 15)

    def test_shift_and_weekly_rule_conflict_adds_flag(self) -> None:
        employee = Employee(id=3, full_name="Conflict User", department_id=1, shift_id=10, is_active=True)
        work_rule = WorkRule(
            id=3,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        monday_rule = DepartmentWeeklyRule(
            id=2,
            department_id=1,
            weekday=0,
            is_workday=True,
            planned_minutes=540,
            break_minutes=60,
        )
        shift = DepartmentShift(
            id=10,
            department_id=1,
            name="Stant 10-18",
            start_time_local=time(10, 0),
            end_time_local=time(18, 0),
            break_minutes=30,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=201,
            employee_id=3,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 2, 7, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=202,
            employee_id=3,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 2, 15, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [monday_rule],
                [shift],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=3, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 2)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertIn("SHIFT_WEEKLY_RULE_OVERRIDE", target_day.flags)

    def test_employee_weekly_rest_day_counts_work_as_fm2(self) -> None:
        employee = Employee(id=31, full_name="Rest User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=31,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        rest_day = EmployeeWeeklyRestDay(
            id=1,
            employee_id=31,
            weekday=1,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=311,
            employee_id=31,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 3, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=312,
            employee_id=31,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 3, 11, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [],
                [],
                [rest_day],
                [],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=31, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 3)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.day_type, "WEEKLY_REST")
        self.assertIn("EMPLOYEE_WEEKLY_REST_DAY", target_day.flags)
        self.assertEqual(target_day.fm3_minutes, target_day.worked_minutes)
        self.assertEqual(target_day.plan_overtime_minutes, 0)
        self.assertEqual(report.totals.plan_overtime_minutes, 0)
        self.assertEqual(report.totals.weekly_rest_work_minutes, target_day.worked_minutes)

    def test_special_day_off_counts_work_as_configured_fm_code(self) -> None:
        employee = Employee(id=32, full_name="Holiday User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=32,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        special_day = SpecialDay(
            id=1,
            day_date=date(2026, 2, 4),
            name="Sirket Ozel Gunu",
            day_type=SpecialDayType.COMPANY_HOLIDAY,
            work_policy=SpecialDayWorkPolicy.OFF,
            counts_as_paid_leave=True,
            overtime_code=OvertimeCode.FM2,
            overtime_multiplier=2.0,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=321,
            employee_id=32,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 4, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=322,
            employee_id=32,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 4, 10, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [],
                [],
                [],
                [special_day],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=32, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 4)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.day_type, "SPECIAL_DAY")
        self.assertEqual(target_day.special_day_name, "Sirket Ozel Gunu")
        self.assertEqual(target_day.fm2_minutes, target_day.worked_minutes)
        self.assertEqual(target_day.plan_overtime_minutes, 0)
        self.assertEqual(report.totals.plan_overtime_minutes, 0)
        self.assertEqual(report.totals.special_day_work_minutes, target_day.worked_minutes)

    def test_half_day_special_day_counts_only_after_13_as_fm2(self) -> None:
        employee = Employee(id=34, full_name="Arife User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=34,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        special_day = SpecialDay(
            id=3,
            day_date=date(2026, 3, 19),
            name="Ramazan Bayrami Arifesi",
            day_type=SpecialDayType.HALF_DAY,
            work_policy=SpecialDayWorkPolicy.HALF_DAY,
            planned_minutes_override=240,
            counts_as_paid_leave=True,
            overtime_code=OvertimeCode.FM2,
            overtime_multiplier=1.0,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=341,
            employee_id=34,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 3, 19, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=342,
            employee_id=34,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 3, 19, 14, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [],
                [],
                [],
                [special_day],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=34, year=2026, month=3)
        target_day = next((day for day in report.days if day.date == date(2026, 3, 19)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.worked_minutes, 480)
        self.assertEqual(target_day.fm2_minutes, 240)
        self.assertEqual(target_day.fm3_minutes, 0)
        self.assertEqual(target_day.plan_overtime_minutes, 0)
        self.assertEqual(report.totals.plan_overtime_minutes, 0)

    def test_half_day_special_day_custom_overtime_start(self) -> None:
        employee = Employee(id=36, full_name="Custom Cutoff User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=36,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        special_day = SpecialDay(
            id=4,
            day_date=date(2026, 3, 19),
            name="Arife 14:00",
            day_type=SpecialDayType.HALF_DAY,
            work_policy=SpecialDayWorkPolicy.HALF_DAY,
            planned_minutes_override=240,
            half_day_overtime_start=time(14, 0),
            counts_as_paid_leave=True,
            overtime_code=OvertimeCode.FM2,
            overtime_multiplier=1.0,
            is_active=True,
        )
        event_in = AttendanceEvent(
            id=361,
            employee_id=36,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 3, 19, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=362,
            employee_id=36,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 3, 19, 14, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [],
                [],
                [],
                [special_day],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=36, year=2026, month=3)
        target_day = next((day for day in report.days if day.date == date(2026, 3, 19)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        # 09:00-17:00 lokal calisma; FM2 sadece 14:00 sonrasi = 180 dk.
        self.assertEqual(target_day.worked_minutes, 480)
        self.assertEqual(target_day.fm2_minutes, 180)

    def test_half_day_leave_with_work_uses_event_flow(self) -> None:
        employee = Employee(id=37, full_name="Half Leave User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=37,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        leave = Leave(
            id=371,
            employee_id=37,
            start_date=date(2026, 3, 17),
            end_date=date(2026, 3, 17),
            type=LeaveType.ANNUAL,
            status=LeaveStatus.APPROVED,
            half_day=True,
        )
        event_in = AttendanceEvent(
            id=371,
            employee_id=37,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 3, 17, 5, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=372,
            employee_id=37,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 3, 17, 8, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [leave],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=37, year=2026, month=3)
        target_day = next((day for day in report.days if day.date == date(2026, 3, 17)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        # Net plan 480 -> yarim 240, mola 0; 08:00-11:00 lokal = 180 dk calisma, 60 dk eksik.
        self.assertEqual(target_day.status, "OK")
        self.assertEqual(target_day.worked_minutes, 180)
        self.assertEqual(target_day.applied_planned_minutes, 240)
        self.assertEqual(target_day.missing_minutes, 60)
        self.assertEqual(target_day.leave_type, LeaveType.ANNUAL)
        self.assertIn("HALF_DAY_LEAVE", target_day.flags)

    def test_half_day_leave_without_events_marks_half_plan_missing(self) -> None:
        employee = Employee(id=38, full_name="Half Leave Absent", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=38,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        leave = Leave(
            id=381,
            employee_id=38,
            start_date=date(2026, 3, 17),
            end_date=date(2026, 3, 17),
            type=LeaveType.EXCUSE,
            status=LeaveStatus.APPROVED,
            half_day=True,
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [],
                [leave],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=38, year=2026, month=3)
        target_day = next((day for day in report.days if day.date == date(2026, 3, 17)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.status, "LEAVE")
        self.assertEqual(target_day.applied_planned_minutes, 240)
        self.assertEqual(target_day.missing_minutes, 240)
        self.assertEqual(target_day.leave_type, LeaveType.EXCUSE)
        self.assertIn("HALF_DAY_LEAVE", target_day.flags)

    def test_special_day_employee_override_can_exempt_one_worker(self) -> None:
        employee = Employee(id=33, full_name="Override User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=33,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        special_day = SpecialDay(
            id=2,
            day_date=date(2026, 2, 5),
            name="Departman Calisma Gunu",
            day_type=SpecialDayType.COMPANY_HOLIDAY,
            work_policy=SpecialDayWorkPolicy.WORKDAY,
            counts_as_paid_leave=False,
            overtime_code=OvertimeCode.FM1,
            overtime_multiplier=1.5,
            department_id=1,
            is_active=True,
        )
        override = SpecialDayEmployeeOverride(
            id=1,
            special_day_id=2,
            employee_id=33,
            work_policy=SpecialDayWorkPolicy.OFF,
            counts_as_paid_leave=True,
            overtime_code=OvertimeCode.FM2,
            overtime_multiplier=2.0,
            is_active=True,
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [],
                [],
                [],
                [],
                [],
                [],
                [],
                [special_day],
                [override],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=33, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 5)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.status, "LEAVE")
        self.assertEqual(target_day.day_type, "SPECIAL_DAY")
        self.assertEqual(target_day.special_day_work_policy, SpecialDayWorkPolicy.OFF)
        self.assertIn("SPECIAL_DAY_EMPLOYEE_OVERRIDE", target_day.flags)

    def test_legal_break_enforcement_is_disabled_by_default(self) -> None:
        employee = Employee(id=4, full_name="No Break Enforce", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=4,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        saturday_rule = DepartmentWeeklyRule(
            id=3,
            department_id=1,
            weekday=5,
            is_workday=True,
            planned_minutes=300,
            break_minutes=0,
        )
        event_in = AttendanceEvent(
            id=301,
            employee_id=4,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 7, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=302,
            employee_id=4,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 7, 11, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [saturday_rule],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=4, year=2026, month=2)
        saturday = next((day for day in report.days if day.date == date(2026, 2, 7)), None)
        self.assertIsNotNone(saturday)
        assert saturday is not None
        self.assertEqual(saturday.worked_minutes, 300)
        self.assertNotIn("MIN_BREAK_NOT_MET", saturday.flags)

    def test_underworked_day_has_missing_minutes_and_flag(self) -> None:
        employee = Employee(id=5, full_name="Underworked User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=5,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        event_in = AttendanceEvent(
            id=401,
            employee_id=5,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 9, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=402,
            employee_id=5,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 9, 11, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=5, year=2026, month=2)
        monday = next((day for day in report.days if day.date == date(2026, 2, 9)), None)
        self.assertIsNotNone(monday)
        assert monday is not None
        self.assertEqual(monday.worked_minutes, 240)
        # planned 540 and break 60 are treated as 480 net target
        self.assertEqual(monday.missing_minutes, 240)
        self.assertIn("UNDERWORKED", monday.flags)

    def test_second_checkin_after_checkout_marks_day_incomplete(self) -> None:
        employee = Employee(id=55, full_name="Second Checkin User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=55,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        event_in_1 = AttendanceEvent(
            id=551,
            employee_id=55,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 9, 6, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out_1 = AttendanceEvent(
            id=552,
            employee_id=55,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 9, 11, 0, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_in_2 = AttendanceEvent(
            id=553,
            employee_id=55,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 9, 12, 30, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={"SECOND_CHECKIN_APPROVED": True},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in_1, event_out_1, event_in_2],
                [],
                [],
                [],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=55, year=2026, month=2)
        day = next((item for item in report.days if item.date == date(2026, 2, 9)), None)
        self.assertIsNotNone(day)
        assert day is not None
        self.assertEqual(day.status, "INCOMPLETE")
        self.assertIsNone(day.check_out)
        self.assertEqual(day.worked_minutes, 240)
        self.assertIn("OPEN_SHIFT_ACTIVE", day.flags)
        self.assertIn("MISSING_OUT", day.flags)

    def test_cross_midnight_checkout_is_attached_to_checkin_day(self) -> None:
        employee = Employee(id=6, full_name="Night Shift User", department_id=1, shift_id=None, is_active=True)
        work_rule = WorkRule(
            id=6,
            department_id=1,
            daily_minutes_planned=540,
            break_minutes=60,
            grace_minutes=5,
        )
        # Europe/Istanbul local:
        # IN  : 2026-02-10 23:30
        # OUT : 2026-02-11 01:15
        event_in = AttendanceEvent(
            id=601,
            employee_id=6,
            device_id=1,
            type=AttendanceType.IN,
            ts_utc=datetime(2026, 2, 10, 20, 30, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )
        event_out = AttendanceEvent(
            id=602,
            employee_id=6,
            device_id=1,
            type=AttendanceType.OUT,
            ts_utc=datetime(2026, 2, 10, 22, 15, tzinfo=timezone.utc),
            location_status=LocationStatus.NO_LOCATION,
            flags={},
        )

        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, work_rule, None],
            scalars_values=[
                [event_in, event_out],
                [],
                [],
                [],
                [],
            ],
        )

        report = calculate_employee_monthly(fake_db, employee_id=6, year=2026, month=2)
        target_day = next((day for day in report.days if day.date == date(2026, 2, 10)), None)
        self.assertIsNotNone(target_day)
        assert target_day is not None
        self.assertEqual(target_day.check_in, event_in.ts_utc)
        self.assertEqual(target_day.check_out, event_out.ts_utc)
        self.assertIn("CROSS_MIDNIGHT_CHECKOUT", target_day.flags)


class FmOvertimeRulesTests(unittest.TestCase):
    """FM1/FM2/FM3 yeni hesap kurallari (vardiya sonrasi gercek sure, brut tatil suresi)."""

    @staticmethod
    def _utc(*args) -> datetime:
        return datetime(*args, tzinfo=timezone.utc)

    def _shift(self, *, shift_id: int, start: time, end: time, break_minutes: int) -> DepartmentShift:
        return DepartmentShift(
            id=shift_id,
            department_id=1,
            name=f"Shift {shift_id}",
            start_time_local=start,
            end_time_local=end,
            break_minutes=break_minutes,
            is_active=True,
        )

    def _in_out(self, *, employee_id: int, in_utc: datetime, out_utc: datetime, base: int):
        event_in = AttendanceEvent(
            id=base, employee_id=employee_id, device_id=1, type=AttendanceType.IN,
            ts_utc=in_utc, location_status=LocationStatus.NO_LOCATION, flags={},
        )
        event_out = AttendanceEvent(
            id=base + 1, employee_id=employee_id, device_id=1, type=AttendanceType.OUT,
            ts_utc=out_utc, location_status=LocationStatus.NO_LOCATION, flags={},
        )
        return event_in, event_out

    def _work_rule(self, employee_id: int) -> WorkRule:
        return WorkRule(
            id=employee_id, department_id=1, daily_minutes_planned=540,
            break_minutes=60, grace_minutes=5,
        )

    # --- FM1: tanimli mola dusulmus plan ustu sure ---

    def test_fm1_normal_day_real_events(self) -> None:
        # Vardiya 08:30-17:30, cikis 18:30 -> FM1 = 60.
        employee = Employee(id=70, full_name="FM1 Real", department_id=1, shift_id=70, is_active=True)
        shift = self._shift(shift_id=70, start=time(8, 30), end=time(17, 30), break_minutes=0)
        event_in, event_out = self._in_out(
            employee_id=70, in_utc=self._utc(2026, 2, 2, 5, 30), out_utc=self._utc(2026, 2, 2, 15, 30), base=701,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(70), None],
            scalars_values=[[event_in, event_out], [], [], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=70, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 60)
        self.assertEqual(day.plan_overtime_minutes, 60)
        self.assertEqual(day.overtime_minutes, 60)
        self.assertEqual(day.missing_minutes, 0)

    def test_fm1_not_reduced_by_shift_break_when_no_grace_configured(self) -> None:
        # Ayni vardiya/cikis, mola 45 -> ham vardiya-sonrasi sure 60 dk. Gun ici planli
        # mola artik FM1'den AYRICA dusulmez (worked_minutes_net'ten zaten dusulmustur);
        # tolerans (overtime_grace_minutes) tanimli degil (0) oldugundan FM1 = 60 kalir.
        employee = Employee(id=72, full_name="FM1 Break", department_id=1, shift_id=72, is_active=True)
        shift = self._shift(shift_id=72, start=time(8, 30), end=time(17, 30), break_minutes=45)
        event_in, event_out = self._in_out(
            employee_id=72, in_utc=self._utc(2026, 2, 2, 5, 30), out_utc=self._utc(2026, 2, 2, 15, 30), base=721,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(72), None],
            scalars_values=[[event_in, event_out], [], [], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=72, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 60)
        self.assertEqual(day.plan_overtime_minutes, 60)
        self.assertEqual(day.overtime_minutes, 60)

    def test_fm1_reduced_by_overtime_grace(self) -> None:
        # Ibrahim vakasi: vardiya 08:30-17:30 (mola 60), giris 08:25, cikis 18:21.
        # Ham vardiya-sonrasi sure = 51 dk; tolerans (overtime_grace_minutes) 15 dk
        # dusulur -> FM1 = 36. Mola FM1'den AYRICA dusulmez.
        employee = Employee(id=76, full_name="FM1 Grace", department_id=1, shift_id=76, is_active=True)
        shift = self._shift(shift_id=76, start=time(8, 30), end=time(17, 30), break_minutes=60)
        rule = WorkRule(
            id=76, department_id=1, daily_minutes_planned=540,
            break_minutes=60, grace_minutes=5, overtime_grace_minutes=15,
        )
        event_in, event_out = self._in_out(
            employee_id=76, in_utc=self._utc(2026, 2, 2, 5, 25), out_utc=self._utc(2026, 2, 2, 15, 21), base=761,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, rule, None],
            scalars_values=[[event_in, event_out], [], [], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=76, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 36)
        self.assertEqual(day.plan_overtime_minutes, 36)
        self.assertEqual(day.overtime_minutes, 36)

    def test_fm1_zero_when_after_shift_below_overtime_grace(self) -> None:
        # Vardiya-sonrasi sure toleransin altinda kalirsa FM1 yazilmaz:
        # cikis 17:40 -> ham 10 dk < 15 dk tolerans -> FM1 = 0.
        employee = Employee(id=77, full_name="FM1 Grace Zero", department_id=1, shift_id=77, is_active=True)
        shift = self._shift(shift_id=77, start=time(8, 30), end=time(17, 30), break_minutes=60)
        rule = WorkRule(
            id=77, department_id=1, daily_minutes_planned=540,
            break_minutes=60, grace_minutes=5, overtime_grace_minutes=15,
        )
        event_in, event_out = self._in_out(
            employee_id=77, in_utc=self._utc(2026, 2, 2, 5, 25), out_utc=self._utc(2026, 2, 2, 14, 40), base=771,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, rule, None],
            scalars_values=[[event_in, event_out], [], [], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=77, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 0)
        self.assertEqual(day.plan_overtime_minutes, 0)
        self.assertEqual(day.overtime_minutes, 0)

    def test_fm1_late_entry_not_reduced_by_configured_break(self) -> None:
        # Gec giris FM1'i sisirmemeli (anchor vardiya-bitisinden hesaplanir); gun ici mola
        # da FM1'den ayrica dusulmez -> ham vardiya-sonrasi 60 dk aynen kalir.
        employee = Employee(id=73, full_name="FM1 Late", department_id=1, shift_id=73, is_active=True)
        shift = self._shift(shift_id=73, start=time(8, 30), end=time(17, 30), break_minutes=45)
        event_in, event_out = self._in_out(
            employee_id=73, in_utc=self._utc(2026, 2, 2, 6, 30), out_utc=self._utc(2026, 2, 2, 15, 30), base=731,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(73), None],
            scalars_values=[[event_in, event_out], [], [], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=73, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 60)

    def test_department_break_no_shift_uses_plan_overtime_without_double_deduction(self) -> None:
        # Vardiya yok (shift_end_ts None) -> fallback dali plan_overtime_minutes'i aynen
        # kullanir; calculate_day_metrics zaten molayi worked_minutes_net'ten dusmustur,
        # burada ikinci kez dusulmez.
        employee = Employee(id=74, full_name="Department Break", department_id=1, shift_id=None, is_active=True)
        rule = WorkRule(
            id=74, department_id=1, daily_minutes_planned=540,
            break_minutes=45, grace_minutes=5,
        )
        event_in, event_out = self._in_out(
            employee_id=74, in_utc=self._utc(2026, 2, 2, 6, 0), out_utc=self._utc(2026, 2, 2, 16, 0), base=741,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, rule, None],
            scalars_values=[[event_in, event_out], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=74, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.applied_break_minutes, 45)
        self.assertEqual(day.fm1_minutes, 60)
        self.assertEqual(day.plan_overtime_minutes, 60)
        self.assertEqual(day.overtime_minutes, 60)

    def test_fm1_net_model_threshold_break_reduces_fm_early_arrival_excluded(self) -> None:
        # Departman NET hedef = 480 dk. Vardiya 10:00-18:00 (mola 60). Erken giris 09:00
        # (haric tutulmali) + cikis 20:00. Net is = (20:00-10:00 anchor) - 60 mola = 600-60=540.
        # FM = 540 - 480 = 60. Eski vardiya-bitis modeli 120 verirdi; bu test molanin
        # FM'den dustugunu ve erken gelisin sayilmadigini yakalar.
        employee = Employee(id=91, full_name="Net OT", department_id=1, shift_id=91, is_active=True)
        shift = self._shift(shift_id=91, start=time(10, 0), end=time(18, 0), break_minutes=60)
        rule = WorkRule(
            id=91, department_id=1, daily_minutes_planned=540, break_minutes=60,
            grace_minutes=5, overtime_threshold_minutes=480,
        )
        event_in, event_out = self._in_out(
            employee_id=91, in_utc=self._utc(2026, 2, 2, 6, 0), out_utc=self._utc(2026, 2, 2, 17, 0), base=911,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, rule, None],
            scalars_values=[[event_in, event_out], [], [], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=91, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 60)
        self.assertEqual(day.early_arrival_minutes, 60)

    def test_schedule_plan_overtime_threshold_overrides_base_rule(self) -> None:
        employee = Employee(id=92, full_name="Plan Net OT", department_id=1, shift_id=92, is_active=True)
        shift = self._shift(shift_id=92, start=time(10, 0), end=time(18, 0), break_minutes=60)
        rule = WorkRule(id=92, department_id=1, daily_minutes_planned=540, break_minutes=60, grace_minutes=5)
        plan = DepartmentSchedulePlan(
            id=92,
            department_id=1,
            target_type=SchedulePlanTargetType.DEPARTMENT,
            shift_id=92,
            overtime_threshold_minutes=480,
            start_date=date(2026, 2, 2),
            end_date=date(2026, 2, 2),
            is_active=True,
        )
        event_in, event_out = self._in_out(
            employee_id=92, in_utc=self._utc(2026, 2, 2, 6, 0), out_utc=self._utc(2026, 2, 2, 17, 0), base=921,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, rule, None],
            scalars_values=[[event_in, event_out], [], [], [], [shift], [], [], [], [plan], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=92, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 60)
        self.assertEqual(day.plan_overtime_minutes, 60)
        self.assertEqual(day.overtime_minutes, 60)
        self.assertIn("SCHEDULE_PLAN_RULE", day.flags)

    def test_break_taken_above_planned_reduces_plan_overtime_and_fm1(self) -> None:
        employee = Employee(id=95, full_name="Break Adjust", department_id=1, shift_id=95, is_active=True)
        shift = self._shift(shift_id=95, start=time(10, 0), end=time(18, 30), break_minutes=30)
        event_in, event_out = self._in_out(
            employee_id=95,
            in_utc=self._utc(2026, 2, 2, 7, 0),
            out_utc=self._utc(2026, 2, 2, 16, 30),
            base=950,
        )
        break_event = BreakEvent(
            id=95,
            employee_id=95,
            started_at=self._utc(2026, 2, 2, 9, 0),
            ended_at=self._utc(2026, 2, 2, 9, 45),
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(95), None],
            scalars_values=[[event_in, event_out], [], [], [], [shift], [], [], [], [], [break_event]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=95, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.applied_break_minutes, 30)
        self.assertEqual(day.break_taken_minutes, 45)
        # Ham FM1 (vardiya sonrasi) = 60; buton molasi plandan 15 dk fazla alindigi
        # icin _apply_break_overtime_adjustments bu fazlayi ayrica duser -> 60-15=45.
        self.assertEqual(day.fm1_minutes, 45)
        self.assertEqual(day.plan_overtime_minutes, 45)
        self.assertEqual(day.overtime_minutes, 45)
        self.assertEqual(report.totals.fm1_minutes, 45)
        self.assertEqual(report.totals.plan_overtime_minutes, 45)
        self.assertEqual(report.totals.overtime_minutes, 45)

    def test_fm1_manual_override(self) -> None:
        employee = Employee(id=71, full_name="FM1 Manual", department_id=1, shift_id=71, is_active=True)
        shift = self._shift(shift_id=71, start=time(8, 30), end=time(17, 30), break_minutes=0)
        override = ManualDayOverride(
            id=1, employee_id=71, day_date=date(2026, 2, 2),
            in_ts=self._utc(2026, 2, 2, 5, 30), out_ts=self._utc(2026, 2, 2, 15, 30), is_absent=False,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(71), None],
            scalars_values=[[], [], [override], [], [shift]],
        )
        report = calculate_employee_monthly(fake_db, employee_id=71, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.fm1_minutes, 60)
        self.assertEqual(day.missing_minutes, 0)

    # --- FM3: Pazar / hafta tatili brut sure ---

    def test_fm3_sunday_short_real_events(self) -> None:
        # Pazar 08:30-12:30 -> FM3 = 240, eksik = 0, UNDERWORKED yok.
        employee = Employee(id=80, full_name="Sunday Short", department_id=1, shift_id=None, is_active=True)
        event_in, event_out = self._in_out(
            employee_id=80, in_utc=self._utc(2026, 2, 1, 5, 30), out_utc=self._utc(2026, 2, 1, 9, 30), base=801,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(80), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=80, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 1))
        self.assertEqual(day.day_type, "SUNDAY")
        self.assertEqual(day.fm3_minutes, 240)
        self.assertEqual(day.fm2_minutes, 0)
        self.assertEqual(day.plan_overtime_minutes, 0)
        self.assertEqual(day.missing_minutes, 0)
        # Pazar: mola dusulmez, calisma da brut (FM3 ile tutarli).
        self.assertEqual(day.worked_minutes, 240)
        self.assertNotIn("UNDERWORKED", day.flags)

    def test_fm3_sunday_long_real_events(self) -> None:
        # Pazar 08:30-18:30 -> FM3 = 600, eksik = 0.
        employee = Employee(id=81, full_name="Sunday Long", department_id=1, shift_id=None, is_active=True)
        event_in, event_out = self._in_out(
            employee_id=81, in_utc=self._utc(2026, 2, 1, 5, 30), out_utc=self._utc(2026, 2, 1, 15, 30), base=811,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(81), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=81, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 1))
        self.assertEqual(day.fm3_minutes, 600)
        self.assertEqual(day.missing_minutes, 0)

    def test_fm3_employee_weekly_rest_4h(self) -> None:
        # Pazar disindaki hafta tatili, 4 saat -> FM3 = 240, eksik = 0.
        employee = Employee(id=82, full_name="Rest 4h", department_id=1, shift_id=None, is_active=True)
        rest_day = EmployeeWeeklyRestDay(id=1, employee_id=82, weekday=1, is_active=True)
        event_in, event_out = self._in_out(
            employee_id=82, in_utc=self._utc(2026, 2, 3, 6, 0), out_utc=self._utc(2026, 2, 3, 10, 0), base=821,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(82), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [rest_day], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=82, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 3))
        self.assertEqual(day.day_type, "WEEKLY_REST")
        self.assertEqual(day.fm3_minutes, 240)
        self.assertEqual(day.worked_minutes, 240)
        self.assertEqual(day.missing_minutes, 0)
        self.assertNotIn("UNDERWORKED", day.flags)

    def test_fm3_cross_midnight_sunday(self) -> None:
        # Pazar 22:00 -> Pazartesi 02:00 (gun asan) -> FM3 = 240.
        employee = Employee(id=83, full_name="Sunday Night", department_id=1, shift_id=None, is_active=True)
        event_in, event_out = self._in_out(
            employee_id=83, in_utc=self._utc(2026, 2, 1, 19, 0), out_utc=self._utc(2026, 2, 1, 23, 0), base=831,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(83), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=83, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 1))
        self.assertEqual(day.day_type, "SUNDAY")
        self.assertEqual(day.fm3_minutes, 240)
        self.assertEqual(day.missing_minutes, 0)

    def test_fm3_sunday_manual_override(self) -> None:
        employee = Employee(id=84, full_name="Sunday Manual", department_id=1, shift_id=None, is_active=True)
        override = ManualDayOverride(
            id=1, employee_id=84, day_date=date(2026, 2, 1),
            in_ts=self._utc(2026, 2, 1, 5, 30), out_ts=self._utc(2026, 2, 1, 9, 30), is_absent=False,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(84), None],
            scalars_values=[[], [], [override], [], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=84, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 1))
        self.assertEqual(day.fm3_minutes, 240)
        self.assertEqual(day.missing_minutes, 0)
        self.assertNotIn("UNDERWORKED", day.flags)

    # --- FM2: tam gun / yarim gun tatil ---

    def test_fm2_full_holiday_no_missing(self) -> None:
        # Tam gun ozel tatil (FM2), 08:30-12:30 -> FM2 = 240, eksik = 0.
        employee = Employee(id=90, full_name="Holiday Full", department_id=1, shift_id=None, is_active=True)
        special_day = SpecialDay(
            id=1, day_date=date(2026, 2, 4), name="Tam Gun Tatil",
            day_type=SpecialDayType.COMPANY_HOLIDAY, work_policy=SpecialDayWorkPolicy.OFF,
            counts_as_paid_leave=True, overtime_code=OvertimeCode.FM2, overtime_multiplier=2.0, is_active=True,
        )
        event_in, event_out = self._in_out(
            employee_id=90, in_utc=self._utc(2026, 2, 4, 5, 30), out_utc=self._utc(2026, 2, 4, 9, 30), base=901,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(90), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [], [special_day], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=90, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 4))
        self.assertEqual(day.fm2_minutes, 240)
        self.assertEqual(day.fm3_minutes, 0)
        self.assertEqual(day.missing_minutes, 0)
        self.assertNotIn("UNDERWORKED", day.flags)

    def test_fm2_half_day_holiday_after_cutoff(self) -> None:
        # Yarim gun tatil, calisma 08:30-17:30, cutoff 13:00 -> FM2 = 270.
        employee = Employee(id=91, full_name="Holiday Half", department_id=1, shift_id=None, is_active=True)
        special_day = SpecialDay(
            id=2, day_date=date(2026, 3, 19), name="Arife",
            day_type=SpecialDayType.HALF_DAY, work_policy=SpecialDayWorkPolicy.HALF_DAY,
            planned_minutes_override=240, counts_as_paid_leave=True,
            overtime_code=OvertimeCode.FM2, overtime_multiplier=1.0, is_active=True,
        )
        event_in, event_out = self._in_out(
            employee_id=91, in_utc=self._utc(2026, 3, 19, 5, 30), out_utc=self._utc(2026, 3, 19, 14, 30), base=911,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(91), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [], [special_day], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=91, year=2026, month=3)
        day = next(d for d in report.days if d.date == date(2026, 3, 19))
        self.assertEqual(day.fm2_minutes, 270)

    def test_fm2_special_on_sunday_takes_priority_over_fm3(self) -> None:
        # Pazar ayni zamanda FM2 ozel gunu -> sure yalniz FM2, FM3 = 0.
        employee = Employee(id=92, full_name="Sunday Special", department_id=1, shift_id=None, is_active=True)
        special_day = SpecialDay(
            id=3, day_date=date(2026, 2, 1), name="Pazar Tatil",
            day_type=SpecialDayType.COMPANY_HOLIDAY, work_policy=SpecialDayWorkPolicy.OFF,
            counts_as_paid_leave=True, overtime_code=OvertimeCode.FM2, overtime_multiplier=2.0, is_active=True,
        )
        event_in, event_out = self._in_out(
            employee_id=92, in_utc=self._utc(2026, 2, 1, 5, 30), out_utc=self._utc(2026, 2, 1, 9, 30), base=921,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(92), None],
            scalars_values=[[event_in, event_out], [], [], [], [], [], [], [special_day], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=92, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 1))
        self.assertEqual(day.fm2_minutes, 240)
        self.assertEqual(day.fm3_minutes, 0)

    # --- Eksik kayit ve normal gun korunumu ---

    def test_incomplete_day_has_no_fm(self) -> None:
        employee = Employee(id=93, full_name="Incomplete", department_id=1, shift_id=None, is_active=True)
        event_in = AttendanceEvent(
            id=931, employee_id=93, device_id=1, type=AttendanceType.IN,
            ts_utc=self._utc(2026, 2, 2, 5, 30), location_status=LocationStatus.NO_LOCATION, flags={},
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(93), None],
            scalars_values=[[event_in], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=93, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.status, "INCOMPLETE")
        self.assertEqual(day.fm1_minutes, 0)
        self.assertEqual(day.fm2_minutes, 0)
        self.assertEqual(day.fm3_minutes, 0)

    def test_normal_weekday_missing_still_computed(self) -> None:
        # Hafta ici eksik calisma: missing korunur, FM1 yok.
        employee = Employee(id=94, full_name="Underwork", department_id=1, shift_id=None, is_active=True)
        event_in, event_out = self._in_out(
            employee_id=94, in_utc=self._utc(2026, 2, 2, 6, 0), out_utc=self._utc(2026, 2, 2, 11, 0), base=941,
        )
        fake_db = _FakeMonthlyDB(
            scalar_values=[employee, self._work_rule(94), None],
            scalars_values=[[event_in, event_out], [], [], [], []],
        )
        report = calculate_employee_monthly(fake_db, employee_id=94, year=2026, month=2)
        day = next(d for d in report.days if d.date == date(2026, 2, 2))
        self.assertEqual(day.worked_minutes, 240)
        self.assertEqual(day.missing_minutes, 240)
        self.assertIn("UNDERWORKED", day.flags)
        self.assertEqual(day.fm1_minutes, 0)


if __name__ == "__main__":
    unittest.main()
