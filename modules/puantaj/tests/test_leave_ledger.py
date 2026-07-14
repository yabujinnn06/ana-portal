from __future__ import annotations

import unittest
import warnings
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import Session

from app.db import Base
from app.models import Employee, EmployeePayrollProfile, Leave, LeaveStatus, LeaveType
from app.services.leaves import (
    annual_entitlement_for_service_year,
    annual_leave_used_days,
    build_leave_ledger,
    completed_service_years,
    cumulative_annual_entitlement,
)


class LeaveEntitlementTests(unittest.TestCase):
    def test_entitlement_brackets(self) -> None:
        self.assertEqual(annual_entitlement_for_service_year(1), 14)
        self.assertEqual(annual_entitlement_for_service_year(5), 14)
        self.assertEqual(annual_entitlement_for_service_year(6), 20)
        self.assertEqual(annual_entitlement_for_service_year(14), 20)
        self.assertEqual(annual_entitlement_for_service_year(15), 26)

    def test_cumulative(self) -> None:
        self.assertEqual(cumulative_annual_entitlement(0), 0)
        self.assertEqual(cumulative_annual_entitlement(1), 14)
        self.assertEqual(cumulative_annual_entitlement(5), 70)
        self.assertEqual(cumulative_annual_entitlement(6), 90)  # 5*14 + 20
        self.assertEqual(cumulative_annual_entitlement(15), 276)  # 70 + 9*20 + 26

    def test_completed_years(self) -> None:
        self.assertEqual(completed_service_years(date(2020, 1, 1), date(2026, 6, 15)), 6)
        self.assertEqual(completed_service_years(date(2020, 7, 1), date(2026, 6, 15)), 5)

    def test_used_days_excludes_sunday(self) -> None:
        # 2026-06-15 Pazartesi -> 2026-06-19 Cuma = 5 is gunu
        self.assertEqual(annual_leave_used_days(date(2026, 6, 15), date(2026, 6, 19), False), Decimal("5"))
        # 2026-06-15 Pzt -> 2026-06-21 Pazar = 6 (Pazar haric)
        self.assertEqual(annual_leave_used_days(date(2026, 6, 15), date(2026, 6, 21), False), Decimal("6"))
        self.assertEqual(annual_leave_used_days(date(2026, 6, 15), date(2026, 6, 15), True), Decimal("0.5"))


class LeaveLedgerDbTests(unittest.TestCase):
    def setUp(self) -> None:
        warnings.filterwarnings("ignore", category=SAWarning)
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                Employee.__table__,
                EmployeePayrollProfile.__table__,
                Leave.__table__,
            ],
        )
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_ledger_computes_remaining(self) -> None:
        self.db.add(Employee(id=1, full_name="Kidemli", is_active=True))
        self.db.add(EmployeePayrollProfile(employee_id=1, ise_giris_tarihi=date(2020, 1, 1)))
        self.db.add(
            Leave(
                employee_id=1,
                start_date=date(2026, 3, 2),  # Pzt
                end_date=date(2026, 3, 6),  # Cuma -> 5 gun
                type=LeaveType.ANNUAL,
                status=LeaveStatus.APPROVED,
            )
        )
        self.db.commit()
        rows = build_leave_ledger(self.db, as_of=date(2026, 6, 15), year=2026)
        row = rows[0]
        self.assertEqual(row["completed_service_years"], 6)
        self.assertEqual(row["entitled_total"], Decimal("90"))
        self.assertEqual(row["used_total"], Decimal("5"))
        self.assertEqual(row["used_year"], Decimal("5"))
        self.assertEqual(row["remaining"], Decimal("85"))

    def test_ledger_without_hire_date(self) -> None:
        self.db.add(Employee(id=2, full_name="Tarihsiz", is_active=True))
        self.db.commit()
        rows = build_leave_ledger(self.db, as_of=date(2026, 6, 15))
        row = rows[0]
        self.assertFalse(row["has_hire_date"])
        self.assertEqual(row["entitled_total"], Decimal("0"))
        self.assertEqual(row["remaining"], Decimal("0"))


if __name__ == "__main__":
    unittest.main()
