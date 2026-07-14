from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from math import ceil

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

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
from app.schemas import MonthlyEmployeeResponse
from app.services.monthly import calculate_employee_monthly

MONEY_PLACES = Decimal("0.01")
RATE_PLACES = Decimal("0.0001")
MINUTES_PER_HOUR = Decimal("60")

DEFAULT_MONTHLY_HOURS_DIVISOR = Decimal("225")
DEFAULT_FM1_MULTIPLIER = Decimal("1.5")
DEFAULT_FM2_MULTIPLIER = Decimal("2")
DEFAULT_FM3_MULTIPLIER = Decimal("2")

# --- Yasal kesinti varsayilanlari (2026 TR) ---
DEFAULT_SGK_EMPLOYEE_RATE = Decimal("0.14")
DEFAULT_UNEMPLOYMENT_EMPLOYEE_RATE = Decimal("0.01")
DEFAULT_SGK_EMPLOYER_RATE = Decimal("0.2075")
DEFAULT_UNEMPLOYMENT_EMPLOYER_RATE = Decimal("0.02")
DEFAULT_SGK_EMPLOYER_INCENTIVE_RATE = Decimal("0.05")
DEFAULT_SGDP_EMPLOYEE_RATE = Decimal("0.075")
DEFAULT_SGDP_EMPLOYER_RATE = Decimal("0.225")
DEFAULT_SGK_BASE_MONTHLY = Decimal("33030")
DEFAULT_SGK_CEILING_MONTHLY = Decimal("297270")
DEFAULT_STAMP_TAX_RATE = Decimal("0.00759")
DEFAULT_MINIMUM_WAGE_GROSS = Decimal("33030")
DEFAULT_INCOME_TAX_BRACKETS: tuple[dict[str, object], ...] = (
    {"upTo": 190000, "rate": "0.15"},
    {"upTo": 400000, "rate": "0.20"},
    {"upTo": 1500000, "rate": "0.27"},
    {"upTo": 5300000, "rate": "0.35"},
    {"upTo": None, "rate": "0.40"},
)


def parse_income_tax_brackets(raw: object) -> tuple[tuple[Decimal | None, Decimal], ...]:
    """JSON dilimleri ([{"upTo": int|null, "rate": "0.15"}, ...]) -> (esik, oran) tuple'i."""
    source = raw if isinstance(raw, (list, tuple)) and raw else DEFAULT_INCOME_TAX_BRACKETS
    parsed: list[tuple[Decimal | None, Decimal]] = []
    for entry in source:
        up_to_raw = entry.get("upTo")
        up_to = None if up_to_raw is None else Decimal(str(up_to_raw))
        parsed.append((up_to, Decimal(str(entry["rate"]))))
    return tuple(parsed)


@dataclass(frozen=True)
class EffectivePayrollParameters:
    year: int
    monthly_hours_divisor: Decimal
    overtime_multiplier_fm1: Decimal
    overtime_multiplier_fm2: Decimal
    overtime_multiplier_fm3: Decimal
    deduct_missing_minutes: bool
    is_persisted: bool
    sgk_employee_rate: Decimal = DEFAULT_SGK_EMPLOYEE_RATE
    unemployment_employee_rate: Decimal = DEFAULT_UNEMPLOYMENT_EMPLOYEE_RATE
    sgk_employer_rate: Decimal = DEFAULT_SGK_EMPLOYER_RATE
    unemployment_employer_rate: Decimal = DEFAULT_UNEMPLOYMENT_EMPLOYER_RATE
    sgk_employer_incentive_rate: Decimal = DEFAULT_SGK_EMPLOYER_INCENTIVE_RATE
    sgdp_employee_rate: Decimal = DEFAULT_SGDP_EMPLOYEE_RATE
    sgdp_employer_rate: Decimal = DEFAULT_SGDP_EMPLOYER_RATE
    apply_employer_incentive: bool = True
    sgk_base_monthly: Decimal = DEFAULT_SGK_BASE_MONTHLY
    sgk_ceiling_monthly: Decimal = DEFAULT_SGK_CEILING_MONTHLY
    stamp_tax_rate: Decimal = DEFAULT_STAMP_TAX_RATE
    minimum_wage_gross: Decimal = DEFAULT_MINIMUM_WAGE_GROSS
    minimum_wage_gross_h2: Decimal | None = None
    minimum_wage_h2_month: int = 7
    disability_degree1_monthly: Decimal = Decimal("0")
    disability_degree2_monthly: Decimal = Decimal("0")
    disability_degree3_monthly: Decimal = Decimal("0")
    severance_ceiling_gross: Decimal = Decimal("0")
    income_tax_brackets: tuple[tuple[Decimal | None, Decimal], ...] = ()


@dataclass(frozen=True)
class PayrollComputation:
    hourly_rate: Decimal
    base_earning: Decimal
    overtime_fm1_amount: Decimal
    overtime_fm2_amount: Decimal
    overtime_fm3_amount: Decimal
    missing_deduction: Decimal
    unpaid_leave_deduction: Decimal
    gross_total: Decimal


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)


def _minutes_to_hours(minutes: int) -> Decimal:
    return Decimal(max(0, int(minutes))) / MINUTES_PER_HOUR


def resolve_effective_parameters(db: Session, year: int) -> EffectivePayrollParameters:
    row = db.scalar(select(PayrollParameter).where(PayrollParameter.year == year))
    if row is None:
        return EffectivePayrollParameters(
            year=year,
            monthly_hours_divisor=DEFAULT_MONTHLY_HOURS_DIVISOR,
            overtime_multiplier_fm1=DEFAULT_FM1_MULTIPLIER,
            overtime_multiplier_fm2=DEFAULT_FM2_MULTIPLIER,
            overtime_multiplier_fm3=DEFAULT_FM3_MULTIPLIER,
            deduct_missing_minutes=True,
            is_persisted=False,
            income_tax_brackets=parse_income_tax_brackets(None),
        )
    return EffectivePayrollParameters(
        year=row.year,
        monthly_hours_divisor=Decimal(row.monthly_hours_divisor),
        overtime_multiplier_fm1=Decimal(row.overtime_multiplier_fm1),
        overtime_multiplier_fm2=Decimal(row.overtime_multiplier_fm2),
        overtime_multiplier_fm3=Decimal(row.overtime_multiplier_fm3),
        deduct_missing_minutes=bool(row.deduct_missing_minutes),
        is_persisted=True,
        sgk_employee_rate=Decimal(row.sgk_employee_rate),
        unemployment_employee_rate=Decimal(row.unemployment_employee_rate),
        sgk_employer_rate=Decimal(row.sgk_employer_rate),
        unemployment_employer_rate=Decimal(row.unemployment_employer_rate),
        sgk_employer_incentive_rate=Decimal(row.sgk_employer_incentive_rate),
        sgdp_employee_rate=Decimal(row.sgdp_employee_rate),
        sgdp_employer_rate=Decimal(row.sgdp_employer_rate),
        apply_employer_incentive=bool(row.apply_employer_incentive),
        sgk_base_monthly=Decimal(row.sgk_base_monthly),
        sgk_ceiling_monthly=Decimal(row.sgk_ceiling_monthly),
        stamp_tax_rate=Decimal(row.stamp_tax_rate),
        minimum_wage_gross=Decimal(row.minimum_wage_gross),
        minimum_wage_gross_h2=(
            None if row.minimum_wage_gross_h2 is None else Decimal(row.minimum_wage_gross_h2)
        ),
        minimum_wage_h2_month=int(row.minimum_wage_h2_month),
        disability_degree1_monthly=Decimal(row.disability_degree1_monthly),
        disability_degree2_monthly=Decimal(row.disability_degree2_monthly),
        disability_degree3_monthly=Decimal(row.disability_degree3_monthly),
        severance_ceiling_gross=Decimal(row.severance_ceiling_gross),
        income_tax_brackets=parse_income_tax_brackets(row.income_tax_brackets),
    )


def resolve_compensation_for_period(
    db: Session,
    *,
    employee_id: int,
    period_end: date,
) -> EmployeeCompensation | None:
    return db.scalar(
        select(EmployeeCompensation)
        .where(
            EmployeeCompensation.employee_id == employee_id,
            EmployeeCompensation.effective_from <= period_end,
        )
        .order_by(EmployeeCompensation.effective_from.desc())
        .limit(1)
    )


def unpaid_leave_minutes_from_days(monthly: MonthlyEmployeeResponse) -> int:
    # Ucretsiz izin gunlerinde dusulecek dakika = gunun uygulanan plani.
    # Yarim gun izinde plan zaten yariya indigi icin ayni kural her iki
    # durumda da dogru sonucu verir; calisilmayan diger yari ayrica
    # missing_minutes uzerinden dusulur (cifte dusum olmaz).
    return sum(
        max(0, int(day.applied_planned_minutes))
        for day in monthly.days
        if day.leave_type == LeaveType.UNPAID
    )


def missing_minutes_from_days(monthly: MonthlyEmployeeResponse) -> int:
    return sum(max(0, int(day.missing_minutes)) for day in monthly.days)


def compute_sgk_days(monthly: MonthlyEmployeeResponse, *, is_part_time: bool = False) -> int:
    """SGK prim gun sayisi.

    Kismi sureli (part-time): calisilan saat / 7,5 (yukari yuvarlanir), max 30.
    Tam zamanli: 30 - tam ucretsiz izin gunu.
    """
    if is_part_time:
        worked = max(0, int(monthly.totals.worked_minutes))
        return max(0, min(30, ceil(worked / 450)))  # 450 dk = 7,5 saat
    unpaid_days = sum(1 for day in monthly.days if day.leave_type == LeaveType.UNPAID)
    return max(0, 30 - unpaid_days)


def compute_payroll_amounts(
    *,
    gross_monthly: Decimal,
    params: EffectivePayrollParameters,
    fm1_minutes: int,
    fm2_minutes: int,
    fm3_minutes: int,
    missing_minutes: int,
    unpaid_leave_minutes: int,
) -> PayrollComputation:
    if gross_monthly <= 0:
        raise ValueError("gross_monthly must be positive")
    if params.monthly_hours_divisor <= 0:
        raise ValueError("monthly_hours_divisor must be positive")

    hourly_rate = (Decimal(gross_monthly) / params.monthly_hours_divisor).quantize(
        RATE_PLACES,
        rounding=ROUND_HALF_UP,
    )
    base_earning = _money(Decimal(gross_monthly))
    fm1_amount = _money(_minutes_to_hours(fm1_minutes) * hourly_rate * params.overtime_multiplier_fm1)
    fm2_amount = _money(_minutes_to_hours(fm2_minutes) * hourly_rate * params.overtime_multiplier_fm2)
    fm3_amount = _money(_minutes_to_hours(fm3_minutes) * hourly_rate * params.overtime_multiplier_fm3)
    missing_deduction = (
        _money(_minutes_to_hours(missing_minutes) * hourly_rate)
        if params.deduct_missing_minutes
        else Decimal("0.00")
    )
    unpaid_leave_deduction = _money(_minutes_to_hours(unpaid_leave_minutes) * hourly_rate)
    gross_total = _money(
        base_earning
        + fm1_amount
        + fm2_amount
        + fm3_amount
        - missing_deduction
        - unpaid_leave_deduction
    )
    return PayrollComputation(
        hourly_rate=hourly_rate,
        base_earning=base_earning,
        overtime_fm1_amount=fm1_amount,
        overtime_fm2_amount=fm2_amount,
        overtime_fm3_amount=fm3_amount,
        missing_deduction=missing_deduction,
        unpaid_leave_deduction=unpaid_leave_deduction,
        gross_total=gross_total,
    )


@dataclass(frozen=True)
class LegalDeductions:
    sgk_days: int
    sgk_base: Decimal
    sgk_employee: Decimal
    unemployment_employee: Decimal
    income_tax_base: Decimal
    disability_reduction: Decimal
    cumulative_income_tax_base: Decimal
    income_tax_calculated: Decimal
    income_tax_exemption: Decimal
    income_tax_payable: Decimal
    stamp_tax_calculated: Decimal
    stamp_tax_exemption: Decimal
    stamp_tax_payable: Decimal
    net_total: Decimal
    sgk_employer: Decimal
    unemployment_employer: Decimal
    employer_incentive: Decimal
    employer_cost_total: Decimal


def progressive_income_tax(
    cumulative_base: Decimal,
    brackets: tuple[tuple[Decimal | None, Decimal], ...],
) -> Decimal:
    """Kumulatif matrah uzerinden artan oranli gelir vergisi (yuvarlanmamis)."""
    base = cumulative_base if cumulative_base > 0 else Decimal("0")
    effective = brackets or parse_income_tax_brackets(None)
    tax = Decimal("0")
    lower = Decimal("0")
    for up_to, rate in effective:
        upper = base if up_to is None else min(base, up_to)
        span = upper - lower
        if span > 0:
            tax += span * rate
        if up_to is None or base <= up_to:
            break
        lower = up_to
    return tax


def applicable_min_wage(month: int, params: EffectivePayrollParameters) -> Decimal:
    """O aya gecerli asgari ucret brutu. H2 (Temmuz) zammi tanimliysa gecis ayindan itibaren uygulanir."""
    h2 = params.minimum_wage_gross_h2
    if h2 is not None and h2 > 0 and int(month) >= int(params.minimum_wage_h2_month):
        return h2
    return params.minimum_wage_gross


def disability_monthly_reduction(degree: int, params: EffectivePayrollParameters) -> Decimal:
    """Engellilik derecesine (1/2/3) gore aylik GV matrah indirimi."""
    return {
        1: params.disability_degree1_monthly,
        2: params.disability_degree2_monthly,
        3: params.disability_degree3_monthly,
    }.get(int(degree), Decimal("0"))


def minimum_wage_monthly_exemption(
    *, month: int, params: EffectivePayrollParameters, days_ratio: Decimal
) -> Decimal:
    """Asgari ucret gelir vergisi istisnasi = asgari ucretin o ayki (kumulatif) GV'si.

    Kumulatif dilim creep'i + yil ortasi asgari ucret zammi nedeniyle yil icinde artar.
    Her ayin gecerli asgari ucreti (H1/H2) ile kumulatif kurulur; gun/30 orani uygulanir.
    """
    factor = Decimal("1") - params.sgk_employee_rate - params.unemployment_employee_rate
    m = max(1, int(month))
    cum_now = sum((applicable_min_wage(i, params) * factor for i in range(1, m + 1)), Decimal("0"))
    cum_prev = sum((applicable_min_wage(i, params) * factor for i in range(1, m)), Decimal("0"))
    full = progressive_income_tax(cum_now, params.income_tax_brackets) - progressive_income_tax(
        cum_prev, params.income_tax_brackets
    )
    return _money(full * days_ratio)


def compute_legal_deductions(
    *,
    total_gross: Decimal,
    params: EffectivePayrollParameters,
    month: int,
    sgk_days: int,
    cumulative_prev_base: Decimal,
    sgk_status: SgkStatus = SgkStatus.NORMAL,
    income_tax_gross: Decimal | None = None,
    stamp_gross: Decimal | None = None,
    extra_net_earnings: Decimal = Decimal("0"),
    net_deductions: Decimal = Decimal("0"),
    disability_reduction: Decimal = Decimal("0"),
) -> LegalDeductions:
    """Brutten nete tek ay: SGK + gelir vergisi (kumulatif) + damga + istisnalar + isveren maliyeti.

    Emekli (SGDP) calisanda: isci %7,5 + isveren %22,5, issizlik ve tesvik YOK.

    total_gross = SGK'ya tabi brut. Manuel kalemler icin matrahlar ayrisabilir:
    income_tax_gross / stamp_gross None ise total_gross'a esitlenir (geriye uyumlu).
    extra_net_earnings = SGK'ya girmeyen ama calisana odenen istisna kazanc (nete eklenir).
    net_deductions = vergi sonrasi netten dusulen kalemler (avans, icra...).
    """
    safe_gross = max(Decimal("0"), Decimal(total_gross))
    safe_income_gross = max(Decimal("0"), Decimal(total_gross if income_tax_gross is None else income_tax_gross))
    safe_stamp_gross = max(Decimal("0"), Decimal(total_gross if stamp_gross is None else stamp_gross))
    safe_extra_net = max(Decimal("0"), Decimal(extra_net_earnings))
    safe_net_deductions = max(Decimal("0"), Decimal(net_deductions))
    days = max(0, min(30, int(sgk_days)))
    days_ratio = Decimal(days) / Decimal("30")

    is_emekli = sgk_status == SgkStatus.EMEKLI
    sgk_emp_rate = params.sgdp_employee_rate if is_emekli else params.sgk_employee_rate
    unemp_emp_rate = Decimal("0") if is_emekli else params.unemployment_employee_rate
    sgk_er_rate = params.sgdp_employer_rate if is_emekli else params.sgk_employer_rate
    unemp_er_rate = Decimal("0") if is_emekli else params.unemployment_employer_rate

    floor = _money(params.sgk_base_monthly * days_ratio)
    ceiling = _money(params.sgk_ceiling_monthly * days_ratio)
    sgk_base = min(max(safe_gross, floor), ceiling) if safe_gross > 0 else Decimal("0.00")

    sgk_employee = _money(sgk_base * sgk_emp_rate)
    unemployment_employee = _money(sgk_base * unemp_emp_rate)

    gross_income_base = _money(safe_income_gross - sgk_employee - unemployment_employee)
    # Engellilik indirimi GV matrahini azaltir (matrahtan dusulur, vergiden degil).
    applied_disability = min(
        max(Decimal("0"), gross_income_base), max(Decimal("0"), Decimal(disability_reduction))
    )
    income_tax_base = _money(gross_income_base - applied_disability)
    cum_prev = max(Decimal("0"), Decimal(cumulative_prev_base))
    cum_now = cum_prev + income_tax_base
    income_tax_calculated = _money(
        progressive_income_tax(cum_now, params.income_tax_brackets)
        - progressive_income_tax(cum_prev, params.income_tax_brackets)
    )
    exemption_full = minimum_wage_monthly_exemption(month=month, params=params, days_ratio=days_ratio)
    income_tax_exemption = min(income_tax_calculated, exemption_full)
    income_tax_payable = _money(income_tax_calculated - income_tax_exemption)

    stamp_tax_calculated = _money(safe_stamp_gross * params.stamp_tax_rate)
    stamp_exemption_full = _money(applicable_min_wage(month, params) * params.stamp_tax_rate * days_ratio)
    stamp_tax_exemption = min(stamp_tax_calculated, stamp_exemption_full)
    stamp_tax_payable = _money(stamp_tax_calculated - stamp_tax_exemption)

    net_total = _money(
        safe_gross
        + safe_extra_net
        - sgk_employee
        - unemployment_employee
        - income_tax_payable
        - stamp_tax_payable
        - safe_net_deductions
    )

    sgk_employer = _money(sgk_base * sgk_er_rate)
    unemployment_employer = _money(sgk_base * unemp_er_rate)
    employer_incentive = (
        _money(sgk_base * params.sgk_employer_incentive_rate)
        if params.apply_employer_incentive and not is_emekli
        else Decimal("0.00")
    )
    employer_cost_total = _money(
        safe_gross + sgk_employer + unemployment_employer - employer_incentive
    )

    return LegalDeductions(
        sgk_days=days,
        sgk_base=sgk_base,
        sgk_employee=sgk_employee,
        unemployment_employee=unemployment_employee,
        income_tax_base=income_tax_base,
        disability_reduction=applied_disability,
        cumulative_income_tax_base=_money(cum_now),
        income_tax_calculated=income_tax_calculated,
        income_tax_exemption=income_tax_exemption,
        income_tax_payable=income_tax_payable,
        stamp_tax_calculated=stamp_tax_calculated,
        stamp_tax_exemption=stamp_tax_exemption,
        stamp_tax_payable=stamp_tax_payable,
        net_total=net_total,
        sgk_employer=sgk_employer,
        unemployment_employer=unemployment_employer,
        employer_incentive=employer_incentive,
        employer_cost_total=employer_cost_total,
    )


def solve_gross_for_net(
    *,
    target_net: Decimal,
    params: EffectivePayrollParameters,
    month: int,
    cumulative_prev_base: Decimal,
    sgk_status: SgkStatus = SgkStatus.NORMAL,
) -> Decimal:
    """Net garantili maas: standart 30 gunde hedef nete ulasan brut (bisection).

    Net brut'a gore monoton arttigi icin ikili arama yakinsar. Emekli (SGDP)
    calisanda dogru brut icin sgk_status gecirilir.
    """
    target = max(Decimal("0"), Decimal(target_net))
    if target <= 0:
        return Decimal("0.00")
    low = target
    high = target * Decimal("3")
    for _ in range(64):
        mid = (low + high) / Decimal("2")
        net = compute_legal_deductions(
            total_gross=mid,
            params=params,
            month=month,
            sgk_days=30,
            cumulative_prev_base=cumulative_prev_base,
            sgk_status=sgk_status,
        ).net_total
        if net < target:
            low = mid
        else:
            high = mid
    return _money(high)


def cumulative_tax_base_prior(
    db: Session, *, employee_id: int, year: int, month: int
) -> Decimal:
    """Yil basindan ay<month olan aylarin income_tax_base toplami (kumulatif matrah).

    (year, month) tek kosum oldugu icin calisan basina ay basina tek item vardir.
    """
    if month <= 1:
        return Decimal("0")
    total = db.scalar(
        select(func.coalesce(func.sum(PayrollItem.income_tax_base), 0))
        .join(PayrollRun, PayrollItem.payroll_run_id == PayrollRun.id)
        .where(
            PayrollRun.year == year,
            PayrollRun.month < month,
            PayrollItem.employee_id == employee_id,
        )
    )
    return Decimal(total or 0)


def build_payroll_item(
    *,
    employee: Employee,
    monthly: MonthlyEmployeeResponse,
    gross_monthly: Decimal,
    params: EffectivePayrollParameters,
    month: int,
    cumulative_prev_base: Decimal = Decimal("0"),
    basis: CompensationBasis = CompensationBasis.GROSS,
    sgk_days: int | None = None,
    sgk_status: SgkStatus = SgkStatus.NORMAL,
    kanun_no: str | None = None,
    is_part_time: bool = False,
    components: list[PayrollComponent] | None = None,
    disability_degree: int = 0,
) -> PayrollItem:
    fm1 = int(monthly.totals.fm1_minutes)
    fm2 = int(monthly.totals.fm2_minutes)
    fm3 = int(monthly.totals.fm3_minutes)
    missing = missing_minutes_from_days(monthly)
    unpaid = unpaid_leave_minutes_from_days(monthly)
    computed = compute_payroll_amounts(
        gross_monthly=gross_monthly,
        params=params,
        fm1_minutes=fm1,
        fm2_minutes=fm2,
        fm3_minutes=fm3,
        missing_minutes=missing,
        unpaid_leave_minutes=unpaid,
    )
    effective_sgk_days = (
        compute_sgk_days(monthly, is_part_time=is_part_time) if sgk_days is None else sgk_days
    )

    # Manuel kalemleri matrahlara ayir: SGK / gelir vergisi / damga bagimsiz.
    # Istisna tavani (exempt_limit) varsa: tavan icindeki kisim bayraklara gore,
    # tavan ustu kisim her matraha tabi (tam vergili).
    items = components or []
    earnings = [c for c in items if c.kind == PayrollComponentKind.EARNING]
    deductions = [c for c in items if c.kind == PayrollComponentKind.DEDUCTION]
    main_gross = max(Decimal("0"), computed.gross_total)
    sgk_extra = Decimal("0")
    gv_extra = Decimal("0")
    stamp_extra = Decimal("0")
    exempt_net_earnings = Decimal("0")
    for c in earnings:
        amount = Decimal(c.amount)
        within = amount if c.exempt_limit is None else min(amount, Decimal(c.exempt_limit))
        excess = amount - within
        sgk_c = excess + (Decimal("0") if c.sgk_exempt else within)
        gv_c = excess + (Decimal("0") if c.income_tax_exempt else within)
        stamp_c = excess + (Decimal("0") if c.stamp_tax_exempt else within)
        sgk_extra += sgk_c
        gv_extra += gv_c
        stamp_extra += stamp_c
        exempt_net_earnings += amount - sgk_c  # SGK matrahina girmeyen, nete odenen kisim
    total_earnings_extra = sum((Decimal(c.amount) for c in earnings), Decimal("0"))
    total_deductions_extra = sum((Decimal(c.amount) for c in deductions), Decimal("0"))

    legal = compute_legal_deductions(
        total_gross=main_gross + sgk_extra,
        income_tax_gross=main_gross + gv_extra,
        stamp_gross=main_gross + stamp_extra,
        extra_net_earnings=exempt_net_earnings,
        net_deductions=total_deductions_extra,
        disability_reduction=disability_monthly_reduction(disability_degree, params),
        params=params,
        month=month,
        sgk_days=effective_sgk_days,
        cumulative_prev_base=cumulative_prev_base,
        sgk_status=sgk_status,
    )
    components_snapshot = [
        {
            "kind": c.kind.value,
            "code": c.code,
            "label": c.label,
            "amount": str(_money(Decimal(c.amount))),
            "exempt_limit": (None if c.exempt_limit is None else str(_money(Decimal(c.exempt_limit)))),
            "sgk_exempt": bool(c.sgk_exempt),
            "income_tax_exempt": bool(c.income_tax_exempt),
            "stamp_tax_exempt": bool(c.stamp_tax_exempt),
        }
        for c in items
    ]
    return PayrollItem(
        employee_id=employee.id,
        employee_name=employee.full_name,
        department_name=employee.department.name if employee.department is not None else None,
        gross_monthly=_money(Decimal(gross_monthly)),
        hourly_rate=computed.hourly_rate,
        worked_minutes=int(monthly.totals.worked_minutes),
        fm1_minutes=fm1,
        fm2_minutes=fm2,
        fm3_minutes=fm3,
        missing_minutes=missing,
        unpaid_leave_minutes=unpaid,
        incomplete_days=int(monthly.totals.incomplete_days),
        base_earning=computed.base_earning,
        overtime_fm1_amount=computed.overtime_fm1_amount,
        overtime_fm2_amount=computed.overtime_fm2_amount,
        overtime_fm3_amount=computed.overtime_fm3_amount,
        missing_deduction=computed.missing_deduction,
        unpaid_leave_deduction=computed.unpaid_leave_deduction,
        gross_total=computed.gross_total,
        additional_earnings=_money(total_earnings_extra),
        additional_deductions=_money(total_deductions_extra),
        components=components_snapshot,
        compensation_basis=basis,
        sgk_status=sgk_status,
        kanun_no=kanun_no,
        sgk_days=legal.sgk_days,
        sgk_base=legal.sgk_base,
        sgk_employee=legal.sgk_employee,
        unemployment_employee=legal.unemployment_employee,
        income_tax_base=legal.income_tax_base,
        disability_reduction=legal.disability_reduction,
        cumulative_income_tax_base=legal.cumulative_income_tax_base,
        income_tax_calculated=legal.income_tax_calculated,
        income_tax_exemption=legal.income_tax_exemption,
        income_tax_payable=legal.income_tax_payable,
        stamp_tax_calculated=legal.stamp_tax_calculated,
        stamp_tax_exemption=legal.stamp_tax_exemption,
        stamp_tax_payable=legal.stamp_tax_payable,
        net_total=legal.net_total,
        sgk_employer=legal.sgk_employer,
        unemployment_employer=legal.unemployment_employer,
        employer_incentive=legal.employer_incentive,
        employer_cost_total=legal.employer_cost_total,
    )


def _validate_period(year: int, month: int) -> None:
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="month must be 1..12")
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="year out of range")


def get_payroll_run(db: Session, *, year: int, month: int) -> PayrollRun | None:
    return db.scalar(
        select(PayrollRun).where(PayrollRun.year == year, PayrollRun.month == month)
    )


def list_payroll_runs(db: Session) -> list[PayrollRun]:
    return list(
        db.scalars(
            select(PayrollRun).order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
        ).all()
    )


def generate_payroll_run(
    db: Session,
    *,
    year: int,
    month: int,
    note: str | None = None,
) -> tuple[PayrollRun, list[Employee]]:
    """Ay icin DRAFT kosum uretir; varsa DRAFT kalemleri yeniden hesaplar.

    Donus: (kosum, maas tanimi olmayan ve atlanan calisanlar).
    """
    _validate_period(year, month)

    run = get_payroll_run(db, year=year, month=month)
    if run is not None and run.status == PayrollRunStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payroll run already approved; cannot regenerate",
        )

    params = resolve_effective_parameters(db, year)
    period_end = date(year, month, monthrange(year, month)[1])

    employees = list(
        db.scalars(
            select(Employee).where(Employee.is_active.is_(True)).order_by(Employee.id.asc())
        ).all()
    )

    if run is None:
        run = PayrollRun(year=year, month=month, status=PayrollRunStatus.DRAFT, note=note)
        db.add(run)
        db.flush()
    else:
        if note is not None:
            run.note = note
        run.items.clear()
        db.flush()

    skipped: list[Employee] = []
    for employee in employees:
        compensation = resolve_compensation_for_period(
            db,
            employee_id=employee.id,
            period_end=period_end,
        )
        if compensation is None:
            skipped.append(employee)
            continue
        cumulative_prev = cumulative_tax_base_prior(
            db, employee_id=employee.id, year=year, month=month
        )
        profile = db.scalar(
            select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id == employee.id)
        )
        sgk_status = profile.sgk_status if profile is not None else SgkStatus.NORMAL
        kanun_no = profile.kanun_no if profile is not None else None
        is_part_time = bool(profile.is_part_time) if profile is not None else False
        disability_degree = int(profile.disability_degree) if profile is not None else 0
        # NET garantili maas: brut'u o ayin kumulatif baglamiyla geri hesapla.
        if compensation.basis == CompensationBasis.NET and compensation.net_monthly is not None:
            gross_monthly = solve_gross_for_net(
                target_net=Decimal(compensation.net_monthly),
                params=params,
                month=month,
                cumulative_prev_base=cumulative_prev,
                sgk_status=sgk_status,
            )
        else:
            gross_monthly = Decimal(compensation.gross_monthly)
        monthly = calculate_employee_monthly(db, employee_id=employee.id, year=year, month=month)
        components = list(
            db.scalars(
                select(PayrollComponent).where(
                    PayrollComponent.employee_id == employee.id,
                    PayrollComponent.year == year,
                    PayrollComponent.month == month,
                ).order_by(PayrollComponent.id.asc())
            ).all()
        )
        item = build_payroll_item(
            employee=employee,
            monthly=monthly,
            gross_monthly=gross_monthly,
            params=params,
            month=month,
            cumulative_prev_base=cumulative_prev,
            basis=compensation.basis,
            sgk_status=sgk_status,
            kanun_no=kanun_no,
            is_part_time=is_part_time,
            components=components,
            disability_degree=disability_degree,
        )
        item.payroll_run_id = run.id
        run.items.append(item)

    db.commit()
    db.refresh(run)
    return run, skipped


def approve_payroll_run(db: Session, *, run_id: int, approved_by: str | None) -> PayrollRun:
    run = db.get(PayrollRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll run not found")
    if run.status == PayrollRunStatus.APPROVED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payroll run already approved")
    if not run.items:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payroll run has no items; generate before approving",
        )
    run.status = PayrollRunStatus.APPROVED
    run.approved_at = datetime.now(timezone.utc)
    run.approved_by = approved_by
    db.commit()
    db.refresh(run)
    return run


def delete_payroll_run(db: Session, *, run_id: int) -> None:
    run = db.get(PayrollRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll run not found")
    if run.status == PayrollRunStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approved payroll run cannot be deleted",
        )
    db.delete(run)
    db.commit()


def notice_weeks_for_service(total_years: Decimal) -> int:
    """Ihbar suresi (4857/17): <6ay 2, 6ay-1.5yil 4, 1.5-3yil 6, >3yil 8 hafta."""
    if total_years < Decimal("0.5"):
        return 2
    if total_years < Decimal("1.5"):
        return 4
    if total_years < Decimal("3"):
        return 6
    return 8


def compute_termination_settlement(
    *,
    hire_date: date,
    termination_date: date,
    base_gross: Decimal,
    params: EffectivePayrollParameters,
    include_notice: bool = True,
    unused_leave_days: Decimal = Decimal("0"),
) -> dict:
    """Cikis hesabi: kidem (tavanli, sadece damga) + ihbar (damga + GV tahmini) + kullanilmamis izin (brut).

    Kidem tazminati gelir vergisinden istisnadir; sadece damga vergisine tabidir. Tavan
    (severance_ceiling_gross) giydirilmis brut bazi sinirlar. Ihbar tazminati gelir vergisine
    tabidir; burada tek seferlik tutar uzerinden tahmini hesaplanir (aylik kumulatif bordroda kesinlesir).
    """
    base = max(Decimal("0"), Decimal(base_gross))
    service_days = max(0, (termination_date - hire_date).days)
    total_years = Decimal(service_days) / Decimal("365")
    daily = base / Decimal("30")
    stamp_rate = params.stamp_tax_rate

    ceiling = params.severance_ceiling_gross
    ceiling_applied = bool(ceiling and ceiling > 0 and base > ceiling)
    capped_monthly = min(base, ceiling) if (ceiling and ceiling > 0) else base
    severance_gross = _money(capped_monthly * total_years)
    severance_stamp = _money(severance_gross * stamp_rate)
    severance_net = _money(severance_gross - severance_stamp)

    weeks = notice_weeks_for_service(total_years) if include_notice else 0
    notice_gross = _money(daily * Decimal("7") * Decimal(weeks))
    notice_stamp = _money(notice_gross * stamp_rate)
    notice_income_tax = (
        _money(progressive_income_tax(notice_gross, params.income_tax_brackets))
        if notice_gross > 0
        else Decimal("0.00")
    )
    notice_net = _money(notice_gross - notice_stamp - notice_income_tax)

    leave_days = max(Decimal("0"), Decimal(unused_leave_days))
    unused_leave_gross = _money(daily * leave_days)

    total_gross = _money(severance_gross + notice_gross)
    total_net = _money(severance_net + notice_net)

    years = service_days // 365
    months = (service_days % 365) // 30
    return {
        "hire_date": hire_date,
        "termination_date": termination_date,
        "service_days": service_days,
        "service_label": f"{years} yil {months} ay",
        "base_gross": _money(base),
        "daily_gross": _money(daily),
        "severance_ceiling": _money(Decimal(ceiling)) if ceiling else Decimal("0.00"),
        "ceiling_applied": ceiling_applied,
        "severance_base_monthly": _money(capped_monthly),
        "severance_gross": severance_gross,
        "severance_stamp": severance_stamp,
        "severance_net": severance_net,
        "notice_weeks": weeks,
        "notice_gross": notice_gross,
        "notice_stamp": notice_stamp,
        "notice_income_tax": notice_income_tax,
        "notice_net": notice_net,
        "unused_leave_days": leave_days,
        "unused_leave_gross": unused_leave_gross,
        "total_gross": total_gross,
        "total_net": total_net,
    }


def build_payroll_dashboard(db: Session, *, limit: int = 12) -> dict:
    """Son N kosumun ozeti (kronolojik): brut/net/isveren maliyet trendi + son donem KPI."""
    runs = list(
        db.scalars(
            select(PayrollRun)
            .options(selectinload(PayrollRun.items))
            .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
            .limit(max(1, limit))
        ).all()
    )
    rows: list[dict] = []
    for run in runs:
        items = run.items
        rows.append(
            {
                "year": run.year,
                "month": run.month,
                "status": run.status,
                "employee_count": len(items),
                "gross_total": sum((Decimal(i.gross_total) for i in items), Decimal("0")),
                "net_total": sum((Decimal(i.net_total) for i in items), Decimal("0")),
                "employer_cost_total": sum((Decimal(i.employer_cost_total) for i in items), Decimal("0")),
            }
        )
    rows.reverse()
    latest = rows[-1] if rows else None
    return {"rows": rows, "latest": latest}


def build_employee_payroll_history(db: Session, *, employee_id: int) -> dict:
    """Calisanin gecmis pusulalari (tum kosumlar) + maas/zam gecmisi."""
    pairs = db.execute(
        select(PayrollItem, PayrollRun)
        .join(PayrollRun, PayrollItem.payroll_run_id == PayrollRun.id)
        .where(PayrollItem.employee_id == employee_id)
        .order_by(PayrollRun.year.desc(), PayrollRun.month.desc())
    ).all()
    items = [
        {
            "payroll_item_id": item.id,
            "year": run.year,
            "month": run.month,
            "status": run.status,
            "gross_monthly": Decimal(item.gross_monthly),
            "gross_total": Decimal(item.gross_total),
            "additional_earnings": Decimal(item.additional_earnings),
            "additional_deductions": Decimal(item.additional_deductions),
            "sgk_employee": Decimal(item.sgk_employee),
            "income_tax_payable": Decimal(item.income_tax_payable),
            "net_total": Decimal(item.net_total),
            "employer_cost_total": Decimal(item.employer_cost_total),
        }
        for item, run in pairs
    ]
    compensations = list(
        db.scalars(
            select(EmployeeCompensation)
            .where(EmployeeCompensation.employee_id == employee_id)
            .order_by(EmployeeCompensation.effective_from.desc())
        ).all()
    )
    return {"items": items, "compensations": compensations}


def aggregate_payroll_report(run: PayrollRun, items: list[PayrollItem]) -> dict:
    """Kosum kalemlerinden bordro raporlari: icmal + departman + SGK tahakkuk + gelir vergisi."""

    def total(attr: str) -> Decimal:
        return sum((Decimal(getattr(i, attr)) for i in items), Decimal("0"))

    summary = {
        "employee_count": len(items),
        "gross_total": total("gross_total"),
        "additional_earnings": total("additional_earnings"),
        "additional_deductions": total("additional_deductions"),
        "sgk_employee": total("sgk_employee"),
        "unemployment_employee": total("unemployment_employee"),
        "income_tax_payable": total("income_tax_payable"),
        "income_tax_exemption": total("income_tax_exemption"),
        "stamp_tax_payable": total("stamp_tax_payable"),
        "disability_reduction": total("disability_reduction"),
        "net_total": total("net_total"),
        "sgk_employer": total("sgk_employer"),
        "unemployment_employer": total("unemployment_employer"),
        "employer_incentive": total("employer_incentive"),
        "employer_cost_total": total("employer_cost_total"),
    }

    dept_acc: dict[str, dict] = defaultdict(
        lambda: {
            "employee_count": 0,
            "gross_total": Decimal("0"),
            "additional_earnings": Decimal("0"),
            "net_total": Decimal("0"),
            "employer_cost_total": Decimal("0"),
        }
    )
    sgk_acc: dict[tuple[str, str], dict] = defaultdict(
        lambda: {
            "employee_count": 0,
            "sgk_days": 0,
            "sgk_base": Decimal("0"),
            "sgk_employee": Decimal("0"),
            "unemployment_employee": Decimal("0"),
            "sgk_employer": Decimal("0"),
            "unemployment_employer": Decimal("0"),
            "employer_incentive": Decimal("0"),
        }
    )
    tax_lines: list[dict] = []

    for item in items:
        dept_name = item.department_name or "Departmansiz"
        d = dept_acc[dept_name]
        d["employee_count"] += 1
        d["gross_total"] += Decimal(item.gross_total)
        d["additional_earnings"] += Decimal(item.additional_earnings)
        d["net_total"] += Decimal(item.net_total)
        d["employer_cost_total"] += Decimal(item.employer_cost_total)

        status_label = "Emekli (SGDP)" if item.sgk_status == SgkStatus.EMEKLI else "Normal (4a)"
        key = (status_label, item.kanun_no or "-")
        g = sgk_acc[key]
        g["employee_count"] += 1
        g["sgk_days"] += int(item.sgk_days)
        g["sgk_base"] += Decimal(item.sgk_base)
        g["sgk_employee"] += Decimal(item.sgk_employee)
        g["unemployment_employee"] += Decimal(item.unemployment_employee)
        g["sgk_employer"] += Decimal(item.sgk_employer)
        g["unemployment_employer"] += Decimal(item.unemployment_employer)
        g["employer_incentive"] += Decimal(item.employer_incentive)

        tax_lines.append(
            {
                "employee_name": item.employee_name,
                "department_name": item.department_name,
                "income_tax_base": Decimal(item.income_tax_base),
                "cumulative_income_tax_base": Decimal(item.cumulative_income_tax_base),
                "income_tax_calculated": Decimal(item.income_tax_calculated),
                "income_tax_exemption": Decimal(item.income_tax_exemption),
                "income_tax_payable": Decimal(item.income_tax_payable),
                "stamp_tax_payable": Decimal(item.stamp_tax_payable),
                "disability_reduction": Decimal(item.disability_reduction),
            }
        )

    by_department = [
        {"department_name": name, **vals}
        for name, vals in sorted(dept_acc.items(), key=lambda kv: kv[0].lower())
    ]
    sgk_accrual = [
        {"sgk_status": status_label, "kanun_no": kanun, **vals}
        for (status_label, kanun), vals in sorted(sgk_acc.items())
    ]
    tax_lines.sort(key=lambda row: row["employee_name"].lower())

    return {
        "year": run.year,
        "month": run.month,
        "status": run.status,
        "summary": summary,
        "by_department": by_department,
        "sgk_accrual": sgk_accrual,
        "tax_lines": tax_lines,
    }
