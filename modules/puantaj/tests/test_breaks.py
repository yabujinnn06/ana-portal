from __future__ import annotations

import unittest
import warnings
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import Session

from app.models import Base, BreakEvent, Department, Employee, WorkRule
from app.services import breaks as break_service


class BreakServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        warnings.filterwarnings("ignore", category=SAWarning)
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                Department.__table__,
                Employee.__table__,
                WorkRule.__table__,
                BreakEvent.__table__,
            ],
        )
        self.db = Session(self.engine)
        self.db.add(Department(id=1, name="Uretim"))
        self.db.add(Employee(id=1, full_name="Ahmet", is_active=True, department_id=1))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _rule(self, minutes: int) -> None:
        self.db.add(WorkRule(department_id=1, break_minutes=minutes))
        self.db.commit()

    def test_limit_from_workrule_else_default(self) -> None:
        emp = self.db.get(Employee, 1)
        self.assertEqual(break_service.resolve_break_limit_minutes(self.db, emp), 60)
        self._rule(45)
        self.assertEqual(break_service.resolve_break_limit_minutes(self.db, emp), 45)

    def test_daily_map_sums_durations(self) -> None:
        now = datetime.now(timezone.utc)
        self.db.add(BreakEvent(employee_id=1, started_at=now - timedelta(minutes=40), ended_at=now - timedelta(minutes=20)))
        self.db.add(BreakEvent(employee_id=1, started_at=now - timedelta(minutes=15), ended_at=now - timedelta(minutes=5)))
        self.db.commit()
        day = break_service._local_day(now)
        result = break_service.daily_break_minutes_map(self.db, employee_id=1, year=day.year, month=day.month)
        self.assertEqual(result.get(day), 30)  # 20 + 10

    def test_over_limit_alerts_both_once(self) -> None:
        self._rule(30)  # limit 30; alert when > 40 (grace 10)
        now = datetime.now(timezone.utc)
        # Acik mola 45 dk -> 45 > 40 -> uyari
        self.db.add(BreakEvent(employee_id=1, started_at=now - timedelta(minutes=45), ended_at=None))
        self.db.commit()

        with patch.object(break_service, "send_push_to_employees") as emp_push, patch.object(
            break_service, "send_push_to_admins"
        ) as admin_push:
            alerted = break_service.check_break_over_limits(now, db=self.db)
            self.assertEqual(alerted, 1)
            emp_push.assert_called_once()
            admin_push.assert_called_once()
            # Ikinci kosumda tekrar uyarmaz (gunde 1)
            alerted2 = break_service.check_break_over_limits(now, db=self.db)
            self.assertEqual(alerted2, 0)
            emp_push.assert_called_once()

    def test_under_limit_no_alert(self) -> None:
        self._rule(60)  # limit 60; 35 dk mola -> uyari yok
        now = datetime.now(timezone.utc)
        self.db.add(BreakEvent(employee_id=1, started_at=now - timedelta(minutes=35), ended_at=None))
        self.db.commit()
        with patch.object(break_service, "send_push_to_employees") as emp_push, patch.object(
            break_service, "send_push_to_admins"
        ) as admin_push:
            alerted = break_service.check_break_over_limits(now, db=self.db)
            self.assertEqual(alerted, 0)
            emp_push.assert_not_called()
            admin_push.assert_not_called()


if __name__ == "__main__":
    unittest.main()
