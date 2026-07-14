from __future__ import annotations

import unittest
import warnings
from dataclasses import replace
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import Session

from app.db import Base
from app.models import (
    CompensationBasis,
    Employee,
    EmployeeCompensation,
    EmployeePayrollProfile,
    LeaveType,
    PayrollComponent,
    PayrollComponentKind,
    PayrollItem,
    PayrollParameter,
    PayrollRun,
    PayrollRunStatus,
    SgkStatus,
)
from app.schemas import (
    MonthlyEmployeeDay,
    MonthlyEmployeeResponse,
    MonthlyEmployeeTotals,
)
from app.services.payroll import (
    EffectivePayrollParameters,
    approve_payroll_run,
    compute_legal_deductions,
    compute_payroll_amounts,
    compute_sgk_days,
    cumulative_tax_base_prior,
    delete_payroll_run,
    generate_payroll_run,
    minimum_wage_monthly_exemption,
    progressive_income_tax,
    resolve_compensation_for_period,
    resolve_effective_parameters,
    solve_gross_for_net,
    unpaid_leave_minutes_from_days,
)


def _params(
    *,
    divisor: str = "225",
    fm1: str = "1.5",
    fm2: str = "2",
    fm3: str = "2",
    deduct_missing: bool = True,
) -> EffectivePayrollParameters:
    return EffectivePayrollParameters(
        year=2026,
        monthly_hours_divisor=Decimal(divisor),
        overtime_multiplier_fm1=Decimal(fm1),
        overtime_multiplier_fm2=Decimal(fm2),
        overtime_multiplier_fm3=Decimal(fm3),
        deduct_missing_minutes=deduct_missing,
        is_persisted=True,
    )


def _day(
    *,
    day_date: date,
    status: str = "OK",
    missing: int = 0,
    applied_planned: int = 480,
    leave_type: LeaveType | None = None,
) -> MonthlyEmployeeDay:
    return MonthlyEmployeeDay(
        date=day_date,
        status=status,  # type: ignore[arg-type]
        worked_minutes=0,
        overtime_minutes=0,
        missing_minutes=missing,
        applied_planned_minutes=applied_planned,
        leave_type=leave_type,
    )


def _monthly(
    *,
    worked: int = 0,
    fm1: int = 0,
    fm2: int = 0,
    fm3: int = 0,
    incomplete: int = 0,
    days: list[MonthlyEmployeeDay] | None = None,
) -> MonthlyEmployeeResponse:
    return MonthlyEmployeeResponse(
        employee_id=1,
        year=2026,
        month=5,
        days=days or [],
        totals=MonthlyEmployeeTotals(
            worked_minutes=worked,
            overtime_minutes=0,
            fm1_minutes=fm1,
            fm2_minutes=fm2,
            fm3_minutes=fm3,
            incomplete_days=incomplete,
        ),
        worked_minutes_net=worked,
        annual_overtime_used_minutes=0,
        annual_overtime_remaining_minutes=0,
        annual_overtime_cap_exceeded=False,
    )


class PayrollMathTests(unittest.TestCase):
    def test_basic_amounts_round_numbers(self) -> None:
        result = compute_payroll_amounts(
            gross_monthly=Decimal("22500"),
            params=_params(),
            fm1_minutes=90,
            fm2_minutes=120,
            fm3_minutes=60,
            missing_minutes=30,
            unpaid_leave_minutes=480,
        )
        self.assertEqual(result.hourly_rate, Decimal("100.0000"))
        self.assertEqual(result.base_earning, Decimal("22500.00"))
        # 1.5h x 100 x 1.5
        self.assertEqual(result.overtime_fm1_amount, Decimal("225.00"))
        # 2h x 100 x 2
        self.assertEqual(result.overtime_fm2_amount, Decimal("400.00"))
        # 1h x 100 x 2
        self.assertEqual(result.overtime_fm3_amount, Decimal("200.00"))
        # 0.5h x 100
        self.assertEqual(result.missing_deduction, Decimal("50.00"))
        # 8h x 100
        self.assertEqual(result.unpaid_leave_deduction, Decimal("800.00"))
        self.assertEqual(result.gross_total, Decimal("22475.00"))

    def test_rounding_half_up(self) -> None:
        result = compute_payroll_amounts(
            gross_monthly=Decimal("20000"),
            params=_params(),
            fm1_minutes=30,
            fm2_minutes=0,
            fm3_minutes=0,
            missing_minutes=0,
            unpaid_leave_minutes=0,
        )
        # 20000 / 225 = 88.8888... -> 88.8889
        self.assertEqual(result.hourly_rate, Decimal("88.8889"))
        # 0.5h x 88.8889 x 1.5 = 66.666675 -> 66.67
        self.assertEqual(result.overtime_fm1_amount, Decimal("66.67"))
        self.assertEqual(result.gross_total, Decimal("20066.67"))

    def test_holiday_fm_minutes_map_to_hours_without_missing_deduction(self) -> None:
        # 240 dk FM2 + 240 dk FM3 -> 4'er saat; tatil gunu icin eksik kesinti yok.
        result = compute_payroll_amounts(
            gross_monthly=Decimal("22500"),  # 225 boleni -> saat ucreti 100
            params=_params(),
            fm1_minutes=0,
            fm2_minutes=240,
            fm3_minutes=240,
            missing_minutes=0,
            unpaid_leave_minutes=0,
        )
        self.assertEqual(result.hourly_rate, Decimal("100.0000"))
        # 4h x 100 x 2
        self.assertEqual(result.overtime_fm2_amount, Decimal("800.00"))
        self.assertEqual(result.overtime_fm3_amount, Decimal("800.00"))
        self.assertEqual(result.missing_deduction, Decimal("0.00"))
        self.assertEqual(result.gross_total, Decimal("24100.00"))

    def test_missing_deduction_disabled(self) -> None:
        result = compute_payroll_amounts(
            gross_monthly=Decimal("22500"),
            params=_params(deduct_missing=False),
            fm1_minutes=0,
            fm2_minutes=0,
            fm3_minutes=0,
            missing_minutes=600,
            unpaid_leave_minutes=0,
        )
        self.assertEqual(result.missing_deduction, Decimal("0.00"))
        self.assertEqual(result.gross_total, Decimal("22500.00"))

    def test_invalid_inputs_raise(self) -> None:
        with self.assertRaises(ValueError):
            compute_payroll_amounts(
                gross_monthly=Decimal("0"),
                params=_params(),
                fm1_minutes=0,
                fm2_minutes=0,
                fm3_minutes=0,
                missing_minutes=0,
                unpaid_leave_minutes=0,
            )
        with self.assertRaises(ValueError):
            compute_payroll_amounts(
                gross_monthly=Decimal("1000"),
                params=_params(divisor="0"),
                fm1_minutes=0,
                fm2_minutes=0,
                fm3_minutes=0,
                missing_minutes=0,
                unpaid_leave_minutes=0,
            )

    def test_unpaid_leave_minutes_rule(self) -> None:
        monthly = _monthly(
            days=[
                # Tam gun ucretsiz izin: plan kadar dusulur.
                _day(day_date=date(2026, 5, 4), status="LEAVE", applied_planned=480, leave_type=LeaveType.UNPAID),
                # Yarim gun ucretsiz izin (gelmedi): plan yariya inmis, izinli yari 240.
                _day(
                    day_date=date(2026, 5, 5),
                    status="LEAVE",
                    applied_planned=240,
                    missing=240,
                    leave_type=LeaveType.UNPAID,
                ),
                # Ucretli yillik izin sayilmaz.
                _day(day_date=date(2026, 5, 6), status="LEAVE", applied_planned=480, leave_type=LeaveType.ANNUAL),
                # Normal gun sayilmaz.
                _day(day_date=date(2026, 5, 7), status="OK", applied_planned=480),
            ]
        )
        self.assertEqual(unpaid_leave_minutes_from_days(monthly), 720)


class PayrollLegalTests(unittest.TestCase):
    """Brutten nete yasal motor (2026 TR parametreleri)."""

    def test_minimum_wage_nets_to_published_value(self) -> None:
        d = compute_legal_deductions(
            total_gross=Decimal("33030"), params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        self.assertEqual(d.sgk_employee, Decimal("4624.20"))
        self.assertEqual(d.unemployment_employee, Decimal("330.30"))
        # Istisnalar GV ve damgayi tam sifirlar.
        self.assertEqual(d.income_tax_payable, Decimal("0.00"))
        self.assertEqual(d.stamp_tax_payable, Decimal("0.00"))
        self.assertEqual(d.net_total, Decimal("28075.50"))

    def test_gross_50000_january_full_breakdown(self) -> None:
        d = compute_legal_deductions(
            total_gross=Decimal("50000"), params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        self.assertEqual(d.income_tax_calculated, Decimal("6375.00"))
        self.assertEqual(d.income_tax_exemption, Decimal("4211.33"))
        self.assertEqual(d.income_tax_payable, Decimal("2163.67"))
        self.assertEqual(d.stamp_tax_payable, Decimal("128.80"))
        self.assertEqual(d.net_total, Decimal("40207.53"))
        # Isveren maliyeti: 50000 + 50000*0.2075 + 50000*0.02 - 50000*0.05
        self.assertEqual(d.sgk_employer, Decimal("10375.00"))
        self.assertEqual(d.unemployment_employer, Decimal("1000.00"))
        self.assertEqual(d.employer_incentive, Decimal("2500.00"))
        self.assertEqual(d.employer_cost_total, Decimal("58875.00"))

    def test_minimum_wage_exemption_rises_mid_year(self) -> None:
        ratio = Decimal("1")
        self.assertEqual(minimum_wage_monthly_exemption(month=1, params=_params(), days_ratio=ratio), Decimal("4211.33"))
        self.assertEqual(minimum_wage_monthly_exemption(month=6, params=_params(), days_ratio=ratio), Decimal("4211.33"))
        # Temmuz gecis ayi, Agustos'tan itibaren tam %20 dilimi.
        self.assertEqual(minimum_wage_monthly_exemption(month=7, params=_params(), days_ratio=ratio), Decimal("4537.75"))
        self.assertEqual(minimum_wage_monthly_exemption(month=8, params=_params(), days_ratio=ratio), Decimal("5615.10"))

    def test_progressive_tax_crosses_bracket(self) -> None:
        brackets = _params().income_tax_brackets or None
        # 196528.5 = 190000*0.15 + 6528.5*0.20
        self.assertEqual(
            progressive_income_tax(Decimal("196528.5"), _params().income_tax_brackets),
            Decimal("29805.70"),
        )
        self.assertIsNone(brackets)  # _params brackets'i bos birakir; motor default'a duser

    def test_ceiling_clamps_sgk_base(self) -> None:
        d = compute_legal_deductions(
            total_gross=Decimal("350000"), params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        self.assertEqual(d.sgk_base, Decimal("297270.00"))
        self.assertEqual(d.sgk_employee, Decimal("41617.80"))

    def test_net_to_gross_roundtrip(self) -> None:
        for target in (Decimal("28075.50"), Decimal("40000"), Decimal("75000")):
            gross = solve_gross_for_net(
                target_net=target, params=_params(), month=1, cumulative_prev_base=Decimal("0")
            )
            back = compute_legal_deductions(
                total_gross=gross, params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
            ).net_total
            self.assertEqual(back, target)
        # Asgari net -> brut asgari ucret
        self.assertEqual(
            solve_gross_for_net(target_net=Decimal("28075.50"), params=_params(), month=1, cumulative_prev_base=Decimal("0")),
            Decimal("33030.00"),
        )

    def test_net_to_gross_roundtrip_emekli(self) -> None:
        target = Decimal("40000")
        gross = solve_gross_for_net(
            target_net=target, params=_params(), month=1, cumulative_prev_base=Decimal("0"),
            sgk_status=SgkStatus.EMEKLI,
        )
        back = compute_legal_deductions(
            total_gross=gross, params=_params(), month=1, sgk_days=30,
            cumulative_prev_base=Decimal("0"), sgk_status=SgkStatus.EMEKLI,
        ).net_total
        self.assertEqual(back, target)

    def test_emekli_sgdp(self) -> None:
        # Ugur Erturk ornegi: brut 52.698,24 emekli, Mart kumulatif onceki 46.469,64.
        d = compute_legal_deductions(
            total_gross=Decimal("52698.24"),
            params=_params(),
            month=3,
            sgk_days=30,
            cumulative_prev_base=Decimal("46469.64"),
            sgk_status=SgkStatus.EMEKLI,
        )
        self.assertEqual(d.sgk_employee, Decimal("3952.37"))  # %7,5 SGDP
        self.assertEqual(d.unemployment_employee, Decimal("0.00"))  # emekli issizlik yok
        self.assertEqual(d.income_tax_payable, Decimal("3100.55"))
        self.assertEqual(d.stamp_tax_payable, Decimal("149.28"))
        self.assertEqual(d.net_total, Decimal("45496.04"))
        # Isveren: SGDP %22,5, issizlik yok, tesvik yok
        self.assertEqual(d.sgk_employer, Decimal("11857.10"))
        self.assertEqual(d.unemployment_employer, Decimal("0.00"))
        self.assertEqual(d.employer_incentive, Decimal("0.00"))

    def test_sgk_days_from_unpaid_leave(self) -> None:
        monthly = _monthly(
            days=[
                _day(day_date=date(2026, 3, d), status="LEAVE", applied_planned=480, leave_type=LeaveType.UNPAID)
                for d in range(1, 6)
            ]
        )
        self.assertEqual(compute_sgk_days(monthly), 25)

    def test_sgk_days_part_time(self) -> None:
        monthly = _monthly(worked=7200)  # 120 saat / 7,5 = 16 gun
        self.assertEqual(compute_sgk_days(monthly, is_part_time=True), 16)
        monthly_full = _monthly(worked=15000)  # 250 saat -> cap 30
        self.assertEqual(compute_sgk_days(monthly_full, is_part_time=True), 30)

    def test_exempt_earning_adds_to_net_only(self) -> None:
        base = compute_legal_deductions(
            total_gross=Decimal("50000"), params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        d = compute_legal_deductions(
            total_gross=Decimal("50000"),
            income_tax_gross=Decimal("50000"),
            stamp_gross=Decimal("50000"),
            extra_net_earnings=Decimal("2000"),
            params=_params(),
            month=1,
            sgk_days=30,
            cumulative_prev_base=Decimal("0"),
        )
        # Tam istisna kazanc: hicbir vergi degismez, net 2000 artar.
        self.assertEqual(d.sgk_employee, base.sgk_employee)
        self.assertEqual(d.income_tax_payable, base.income_tax_payable)
        self.assertEqual(d.stamp_tax_payable, base.stamp_tax_payable)
        self.assertEqual(d.net_total, base.net_total + Decimal("2000.00"))

    def test_net_deduction_reduces_net_only(self) -> None:
        base = compute_legal_deductions(
            total_gross=Decimal("50000"), params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        d = compute_legal_deductions(
            total_gross=Decimal("50000"),
            net_deductions=Decimal("3000"),
            params=_params(),
            month=1,
            sgk_days=30,
            cumulative_prev_base=Decimal("0"),
        )
        self.assertEqual(d.income_tax_payable, base.income_tax_payable)
        self.assertEqual(d.net_total, base.net_total - Decimal("3000.00"))

    def test_taxable_earning_raises_sgk_base(self) -> None:
        d = compute_legal_deductions(
            total_gross=Decimal("55000"),
            params=_params(),
            month=1,
            sgk_days=30,
            cumulative_prev_base=Decimal("0"),
        )
        self.assertEqual(d.sgk_employee, Decimal("7700.00"))  # 55000 * 0.14

    def test_h2_minimum_wage_raises_july_exemption(self) -> None:
        h1_only = _params()  # H2 tanimsiz
        with_h2 = replace(_params(), minimum_wage_gross_h2=Decimal("45000"), minimum_wage_h2_month=7)
        ratio = Decimal("1")
        # Haziran (gecis oncesi) degismez
        self.assertEqual(
            minimum_wage_monthly_exemption(month=6, params=with_h2, days_ratio=ratio),
            minimum_wage_monthly_exemption(month=6, params=h1_only, days_ratio=ratio),
        )
        # Temmuz: H2 zammi istisnayi yukseltir
        self.assertGreater(
            minimum_wage_monthly_exemption(month=7, params=with_h2, days_ratio=ratio),
            minimum_wage_monthly_exemption(month=7, params=h1_only, days_ratio=ratio),
        )

    def test_disability_reduction_lowers_income_tax(self) -> None:
        base = compute_legal_deductions(
            total_gross=Decimal("50000"), params=_params(), month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        d = compute_legal_deductions(
            total_gross=Decimal("50000"), params=_params(), month=1, sgk_days=30,
            cumulative_prev_base=Decimal("0"), disability_reduction=Decimal("5000"),
        )
        self.assertEqual(d.disability_reduction, Decimal("5000.00"))
        self.assertEqual(d.income_tax_base, base.income_tax_base - Decimal("5000.00"))
        self.assertLess(d.income_tax_payable, base.income_tax_payable)
        self.assertGreater(d.net_total, base.net_total)

    def test_termination_settlement(self) -> None:
        from app.services.payroll import compute_termination_settlement, notice_weeks_for_service

        self.assertEqual(notice_weeks_for_service(Decimal("0.3")), 2)
        self.assertEqual(notice_weeks_for_service(Decimal("1")), 4)
        self.assertEqual(notice_weeks_for_service(Decimal("2")), 6)
        self.assertEqual(notice_weeks_for_service(Decimal("5")), 8)

        # 6 tam yil, brut 60000, tavan 50000 -> kidem 50000*(2190/365)=50000*6=300000
        params = replace(_params(), severance_ceiling_gross=Decimal("50000"))
        r = compute_termination_settlement(
            hire_date=date(2020, 1, 1),
            termination_date=date(2026, 1, 1),  # 2192 gun
            base_gross=Decimal("60000"),
            params=params,
        )
        self.assertTrue(r["ceiling_applied"])
        self.assertEqual(r["severance_base_monthly"], Decimal("50000.00"))
        # 2192/365 = 6.0055 -> 50000*6.0055 ~ 300273.97
        self.assertEqual(r["severance_gross"], Decimal("300273.97"))
        self.assertEqual(r["severance_stamp"], Decimal("2279.08"))  # *0.00759
        self.assertEqual(r["severance_net"], Decimal("297994.89"))
        self.assertEqual(r["notice_weeks"], 8)
        # gunluk 2000 * 7 * 8 = 112000
        self.assertEqual(r["notice_gross"], Decimal("112000.00"))

    def test_employer_incentive_toggle(self) -> None:
        no_incentive = replace(_params(), apply_employer_incentive=False)
        d = compute_legal_deductions(
            total_gross=Decimal("50000"), params=no_incentive, month=1, sgk_days=30, cumulative_prev_base=Decimal("0")
        )
        self.assertEqual(d.employer_incentive, Decimal("0.00"))
        self.assertEqual(d.employer_cost_total, Decimal("61375.00"))


class PayrollDbTests(unittest.TestCase):
    def setUp(self) -> None:
        warnings.filterwarnings("ignore", category=SAWarning)
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                Employee.__table__,
                EmployeeCompensation.__table__,
                EmployeePayrollProfile.__table__,
                PayrollParameter.__table__,
                PayrollComponent.__table__,
                PayrollRun.__table__,
                PayrollItem.__table__,
            ],
        )
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _add_employee(self, *, employee_id: int, name: str, active: bool = True) -> Employee:
        employee = Employee(id=employee_id, full_name=name, is_active=active)
        self.db.add(employee)
        self.db.commit()
        return employee

    def _add_compensation(self, *, employee_id: int, gross: str, effective: date) -> None:
        self.db.add(
            EmployeeCompensation(
                employee_id=employee_id,
                gross_monthly=Decimal(gross),
                effective_from=effective,
            )
        )
        self.db.commit()

    def _add_net_compensation(self, *, employee_id: int, net: str, effective: date) -> None:
        self.db.add(
            EmployeeCompensation(
                employee_id=employee_id,
                gross_monthly=Decimal("0"),
                basis=CompensationBasis.NET,
                net_monthly=Decimal(net),
                effective_from=effective,
            )
        )
        self.db.commit()

    def test_net_basis_solves_gross_to_target_net(self) -> None:
        self._add_employee(employee_id=1, name="Net User")
        self._add_net_compensation(employee_id=1, net="40000", effective=date(2026, 1, 1))
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=3)
        item = run.items[0]
        self.assertEqual(item.compensation_basis, CompensationBasis.NET)
        self.assertEqual(Decimal(item.gross_total), Decimal("49709.72"))
        self.assertEqual(Decimal(item.net_total), Decimal("40000.00"))

    def test_gross_basis_full_legal_breakdown(self) -> None:
        self._add_employee(employee_id=1, name="Gross User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        item = run.items[0]
        self.assertEqual(Decimal(item.sgk_employee), Decimal("7000.00"))
        self.assertEqual(Decimal(item.income_tax_payable), Decimal("2163.67"))
        self.assertEqual(Decimal(item.stamp_tax_payable), Decimal("128.80"))
        self.assertEqual(Decimal(item.net_total), Decimal("40207.53"))
        self.assertEqual(Decimal(item.employer_cost_total), Decimal("58875.00"))

    def test_emekli_profile_applies_sgdp(self) -> None:
        self._add_employee(employee_id=1, name="Emekli User")
        self._add_compensation(employee_id=1, gross="52698.24", effective=date(2026, 1, 1))
        self.db.add(EmployeePayrollProfile(employee_id=1, sgk_status=SgkStatus.EMEKLI, kanun_no="00000"))
        self.db.commit()
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        item = run.items[0]
        self.assertEqual(item.sgk_status, SgkStatus.EMEKLI)
        self.assertEqual(item.kanun_no, "00000")
        self.assertEqual(Decimal(item.sgk_employee), Decimal("3952.37"))  # %7,5
        self.assertEqual(Decimal(item.unemployment_employee), Decimal("0.00"))

    def test_eksik_gun_from_unpaid_leave(self) -> None:
        self._add_employee(employee_id=1, name="Part Time")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        monthly = _monthly(
            worked=4800,
            days=[
                _day(day_date=date(2026, 1, d), status="LEAVE", applied_planned=480, leave_type=LeaveType.UNPAID)
                for d in range(1, 11)
            ],
        )
        with patch("app.services.payroll.calculate_employee_monthly", return_value=monthly):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        self.assertEqual(run.items[0].sgk_days, 20)  # 30 - 10 ucretsiz izin

    def test_cumulative_base_accumulates_across_months(self) -> None:
        self._add_employee(employee_id=1, name="Cum User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            jan, _ = generate_payroll_run(self.db, year=2026, month=1)
            self.assertEqual(Decimal(jan.items[0].income_tax_base), Decimal("42500.00"))
            feb, _ = generate_payroll_run(self.db, year=2026, month=2)
        self.assertEqual(Decimal(feb.items[0].cumulative_income_tax_base), Decimal("85000.00"))

    def test_manual_components_fold_into_item(self) -> None:
        self._add_employee(employee_id=1, name="Comp User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        self.db.add_all(
            [
                PayrollComponent(
                    employee_id=1, year=2026, month=1, kind=PayrollComponentKind.EARNING,
                    code="PRIM", label="Prim", amount=Decimal("5000"),
                ),
                PayrollComponent(
                    employee_id=1, year=2026, month=1, kind=PayrollComponentKind.EARNING,
                    code="YOL", label="Yol", amount=Decimal("2000"),
                    sgk_exempt=True, income_tax_exempt=True,
                ),
                PayrollComponent(
                    employee_id=1, year=2026, month=1, kind=PayrollComponentKind.DEDUCTION,
                    code="AVANS", label="Avans", amount=Decimal("3000"),
                ),
                # Baska ayin kalemi hesaba girmemeli.
                PayrollComponent(
                    employee_id=1, year=2026, month=2, kind=PayrollComponentKind.EARNING,
                    code="PRIM", label="Subat Prim", amount=Decimal("9999"),
                ),
            ]
        )
        self.db.commit()
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        item = run.items[0]
        self.assertEqual(Decimal(item.additional_earnings), Decimal("7000.00"))
        self.assertEqual(Decimal(item.additional_deductions), Decimal("3000.00"))
        self.assertEqual(len(item.components), 3)
        # SGK matrahi = 50000 + 5000 prim (yol istisnali) = 55000
        self.assertEqual(Decimal(item.sgk_employee), Decimal("7700.00"))
        # Yol SGK+GV istisnali ama damgaya tabi: SGK/GV matrahi 55000, damga 57000.
        legal = compute_legal_deductions(
            total_gross=Decimal("55000"),
            income_tax_gross=Decimal("55000"),
            stamp_gross=Decimal("57000"),
            extra_net_earnings=Decimal("2000"),
            net_deductions=Decimal("3000"),
            params=resolve_effective_parameters(self.db, 2026),
            month=1, sgk_days=30, cumulative_prev_base=Decimal("0"),
        )
        self.assertEqual(Decimal(item.net_total), legal.net_total)

    def test_exempt_limit_splits_earning(self) -> None:
        self._add_employee(employee_id=1, name="Limit User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        # Yemek 3000, aylik istisna tavani 2000: 2000 SGK+GV istisna, 1000 vergiye tabi.
        self.db.add(
            PayrollComponent(
                employee_id=1, year=2026, month=1, kind=PayrollComponentKind.EARNING,
                code="YEMEK", label="Yemek", amount=Decimal("3000"),
                exempt_limit=Decimal("2000"), sgk_exempt=True, income_tax_exempt=True,
            )
        )
        self.db.commit()
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        item = run.items[0]
        # SGK matrahi = 50000 + 1000 (tavan ustu) = 51000 -> %14
        self.assertEqual(Decimal(item.sgk_employee), Decimal("7140.00"))

    def test_disability_profile_applies_reduction(self) -> None:
        self._add_employee(employee_id=1, name="Engelli User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        self.db.add(EmployeePayrollProfile(employee_id=1, disability_degree=1))
        self.db.add(
            PayrollParameter(year=2026, disability_degree1_monthly=Decimal("9900"))
        )
        self.db.commit()
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        item = run.items[0]
        self.assertEqual(Decimal(item.disability_reduction), Decimal("9900.00"))
        # Matrah 42500 - 9900 = 32600
        self.assertEqual(Decimal(item.income_tax_base), Decimal("32600.00"))

    def test_dashboard_and_employee_history(self) -> None:
        from app.services.payroll import build_employee_payroll_history, build_payroll_dashboard

        self._add_employee(employee_id=1, name="Tarih User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            generate_payroll_run(self.db, year=2026, month=1)
            generate_payroll_run(self.db, year=2026, month=2)

        dash = build_payroll_dashboard(self.db, limit=12)
        self.assertEqual(len(dash["rows"]), 2)
        # kronolojik: son satir Subat
        self.assertEqual((dash["latest"]["year"], dash["latest"]["month"]), (2026, 2))
        self.assertEqual(dash["rows"][0]["month"], 1)
        self.assertTrue(dash["latest"]["net_total"] > 0)

        hist = build_employee_payroll_history(self.db, employee_id=1)
        self.assertEqual(len(hist["items"]), 2)
        # en yeni once
        self.assertEqual(hist["items"][0]["month"], 2)
        self.assertEqual(len(hist["compensations"]), 1)

    def test_resolve_compensation_picks_latest_effective(self) -> None:
        self._add_employee(employee_id=1, name="Comp User")
        self._add_compensation(employee_id=1, gross="20000", effective=date(2026, 1, 1))
        self._add_compensation(employee_id=1, gross="25000", effective=date(2026, 6, 1))

        may = resolve_compensation_for_period(self.db, employee_id=1, period_end=date(2026, 5, 31))
        june = resolve_compensation_for_period(self.db, employee_id=1, period_end=date(2026, 6, 30))
        assert may is not None and june is not None
        self.assertEqual(Decimal(may.gross_monthly), Decimal("20000"))
        self.assertEqual(Decimal(june.gross_monthly), Decimal("25000"))

        before = resolve_compensation_for_period(self.db, employee_id=1, period_end=date(2025, 12, 31))
        self.assertIsNone(before)

    def test_resolve_effective_parameters_defaults_and_persisted(self) -> None:
        defaults = resolve_effective_parameters(self.db, 2026)
        self.assertFalse(defaults.is_persisted)
        self.assertEqual(defaults.monthly_hours_divisor, Decimal("225"))
        self.assertEqual(defaults.overtime_multiplier_fm1, Decimal("1.5"))
        self.assertTrue(defaults.deduct_missing_minutes)

        self.db.add(
            PayrollParameter(
                year=2026,
                monthly_hours_divisor=Decimal("220"),
                overtime_multiplier_fm1=Decimal("1.6"),
                overtime_multiplier_fm2=Decimal("2.5"),
                overtime_multiplier_fm3=Decimal("2.25"),
                deduct_missing_minutes=False,
            )
        )
        self.db.commit()

        persisted = resolve_effective_parameters(self.db, 2026)
        self.assertTrue(persisted.is_persisted)
        self.assertEqual(persisted.monthly_hours_divisor, Decimal("220"))
        self.assertEqual(persisted.overtime_multiplier_fm2, Decimal("2.5"))
        self.assertFalse(persisted.deduct_missing_minutes)

    def test_generate_run_items_and_skipped(self) -> None:
        self._add_employee(employee_id=1, name="Paid User")
        self._add_employee(employee_id=2, name="No Comp User")
        self._add_employee(employee_id=3, name="Inactive User", active=False)
        self._add_compensation(employee_id=1, gross="22500", effective=date(2026, 1, 1))

        monthly = _monthly(worked=9600, fm1=90, fm2=120, days=[_day(day_date=date(2026, 5, 4), missing=30)])
        with patch("app.services.payroll.calculate_employee_monthly", return_value=monthly) as calc:
            run, skipped = generate_payroll_run(self.db, year=2026, month=5)

        self.assertEqual(run.status, PayrollRunStatus.DRAFT)
        self.assertEqual([item.employee_id for item in run.items], [1])
        self.assertEqual([emp.id for emp in skipped], [2])
        # Pasif calisan icin monthly hic cagrilmamali.
        self.assertEqual(calc.call_count, 1)

        item = run.items[0]
        self.assertEqual(item.employee_name, "Paid User")
        self.assertEqual(Decimal(item.hourly_rate), Decimal("100.0000"))
        self.assertEqual(item.worked_minutes, 9600)
        self.assertEqual(item.missing_minutes, 30)
        self.assertEqual(Decimal(item.overtime_fm1_amount), Decimal("225.00"))
        self.assertEqual(Decimal(item.overtime_fm2_amount), Decimal("400.00"))
        self.assertEqual(Decimal(item.missing_deduction), Decimal("50.00"))
        self.assertEqual(Decimal(item.gross_total), Decimal("23075.00"))

    def test_regenerate_replaces_items(self) -> None:
        self._add_employee(employee_id=1, name="Paid User")
        self._add_compensation(employee_id=1, gross="22500", effective=date(2026, 1, 1))

        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=5)
        self.assertEqual(Decimal(run.items[0].gross_total), Decimal("22500.00"))

        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600, fm2=60)):
            run, _ = generate_payroll_run(self.db, year=2026, month=5)
        self.assertEqual(len(run.items), 1)
        self.assertEqual(Decimal(run.items[0].gross_total), Decimal("22700.00"))
        self.assertEqual(self.db.query(PayrollItem).count(), 1)

    def test_approve_freezes_run(self) -> None:
        self._add_employee(employee_id=1, name="Paid User")
        self._add_compensation(employee_id=1, gross="22500", effective=date(2026, 1, 1))

        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=5)

        approved = approve_payroll_run(self.db, run_id=run.id, approved_by="admin")
        self.assertEqual(approved.status, PayrollRunStatus.APPROVED)
        self.assertIsNotNone(approved.approved_at)
        self.assertEqual(approved.approved_by, "admin")

        with self.assertRaises(HTTPException) as ctx:
            generate_payroll_run(self.db, year=2026, month=5)
        self.assertEqual(ctx.exception.status_code, 409)

        with self.assertRaises(HTTPException) as ctx:
            approve_payroll_run(self.db, run_id=run.id, approved_by="admin")
        self.assertEqual(ctx.exception.status_code, 409)

        with self.assertRaises(HTTPException) as ctx:
            delete_payroll_run(self.db, run_id=run.id)
        self.assertEqual(ctx.exception.status_code, 409)

    def test_approve_empty_run_rejected(self) -> None:
        self._add_employee(employee_id=1, name="No Comp User")
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly()):
            run, skipped = generate_payroll_run(self.db, year=2026, month=5)
        self.assertEqual(len(run.items), 0)
        self.assertEqual(len(skipped), 1)

        with self.assertRaises(HTTPException) as ctx:
            approve_payroll_run(self.db, run_id=run.id, approved_by="admin")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_bank_payment_exports(self) -> None:
        from datetime import datetime as _dt

        from app.services.exports import build_bank_payment_txt_bytes, build_bank_payment_xlsx_bytes

        self._add_employee(employee_id=1, name="Banka User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        profile = EmployeePayrollProfile(
            employee_id=1, tc_kimlik_no="12345678901", banka_adi="X Bank",
            hesap_no="TR12 0001 0001 0001",
        )
        self.db.add(profile)
        self.db.commit()
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        profiles = {1: profile}
        txt = build_bank_payment_txt_bytes(run, run.items, profiles).decode("utf-8-sig")
        self.assertEqual(txt.splitlines()[0], "IBAN;Tutar;Ad Soyad;TC;Aciklama")
        self.assertIn("TR12000100010001;40207.53;Banka User;12345678901", txt)  # IBAN bosluksuz
        self.assertIn("Banka User", txt)
        xlsx = build_bank_payment_xlsx_bytes(
            run, run.items, profiles, generated_at=_dt(2026, 1, 31)
        )
        self.assertEqual(xlsx[:2], b"PK")  # xlsx zip imzasi

    def test_payroll_report_aggregates(self) -> None:
        from datetime import datetime as _dt

        from app.services.exports import build_payroll_report_xlsx_bytes
        from app.services.payroll import aggregate_payroll_report

        self._add_employee(employee_id=1, name="A User")
        self._add_employee(employee_id=2, name="B User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        self._add_compensation(employee_id=2, gross="30000", effective=date(2026, 1, 1))
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)
        report = aggregate_payroll_report(run, list(run.items))
        self.assertEqual(report["summary"]["employee_count"], 2)
        self.assertEqual(len(report["tax_lines"]), 2)
        # Iki calisan da departmansiz -> tek grup, count 2
        self.assertEqual(len(report["by_department"]), 1)
        self.assertEqual(report["by_department"][0]["employee_count"], 2)
        # Normal/4a tek SGK grubu
        self.assertEqual(report["sgk_accrual"][0]["employee_count"], 2)
        # Net toplami kalemlerle tutarli
        self.assertEqual(
            report["summary"]["net_total"],
            sum(Decimal(i.net_total) for i in run.items),
        )
        xlsx = build_payroll_report_xlsx_bytes(run, report, generated_at=_dt(2026, 1, 31))
        self.assertEqual(xlsx[:2], b"PK")

    def test_delete_draft_run(self) -> None:
        self._add_employee(employee_id=1, name="Paid User")
        self._add_compensation(employee_id=1, gross="22500", effective=date(2026, 1, 1))
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=5)

        delete_payroll_run(self.db, run_id=run.id)
        self.assertEqual(self.db.query(PayrollRun).count(), 0)
        self.assertEqual(self.db.query(PayrollItem).count(), 0)

    def test_logo_mahsup_balances_with_manual_components(self) -> None:
        from datetime import datetime as _dt

        from app.services.logo_export import (
            _mahsup_lines,
            build_logo_mahsup_xlsx_bytes,
            build_logo_puantaj_xlsx_bytes,
        )

        self._add_employee(employee_id=1, name="A User")
        self._add_employee(employee_id=2, name="B User")
        self._add_compensation(employee_id=1, gross="50000", effective=date(2026, 1, 1))
        self._add_compensation(employee_id=2, gross="30000", effective=date(2026, 1, 1))
        # Yol (SGK istisnali kazanc) + avans (netten kesinti): mahsup yine dengeli kalmali.
        self.db.add(
            PayrollComponent(
                employee_id=1, year=2026, month=1, kind=PayrollComponentKind.EARNING,
                code="YOL", label="Yol", amount=Decimal("1000"), sgk_exempt=True,
            )
        )
        self.db.add(
            PayrollComponent(
                employee_id=1, year=2026, month=1, kind=PayrollComponentKind.DEDUCTION,
                code="AVANS", label="Avans", amount=Decimal("2000"),
            )
        )
        self.db.commit()
        with patch("app.services.payroll.calculate_employee_monthly", return_value=_monthly(worked=9600)):
            run, _ = generate_payroll_run(self.db, year=2026, month=1)

        lines = _mahsup_lines(run.items, None, description="X")
        toplam_borc = sum(line["borc"] for line in lines)
        toplam_alacak = sum(line["alacak"] for line in lines)
        self.assertEqual(toplam_borc, toplam_alacak)  # borc == alacak (denge)
        self.assertGreater(toplam_borc, Decimal("0"))
        # Avans kesintisi (additional_deductions) ayri alacak satiri olmali
        self.assertTrue(any(line["aciklama"].endswith("Avans / Icra Kesintisi") for line in lines))
        # Varsayilan hesap kodlari (settings=None)
        codes = {line["hesap_kodu"] for line in lines}
        self.assertEqual(codes, {"770", "335", "360", "361"})

        mahsup = build_logo_mahsup_xlsx_bytes(run, run.items, None, generated_at=_dt(2026, 1, 31))
        self.assertEqual(mahsup[:2], b"PK")
        puantaj = build_logo_puantaj_xlsx_bytes(run, run.items, {}, generated_at=_dt(2026, 1, 31))
        self.assertEqual(puantaj[:2], b"PK")


if __name__ == "__main__":
    unittest.main()
