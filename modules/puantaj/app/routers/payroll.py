from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.audit import log_audit
from app.db import get_db
from app.models import (
    AuditActorType,
    CompanySettings,
    CompensationBasis,
    Employee,
    EmployeeCompensation,
    EmployeePayrollProfile,
    PayrollComponent,
    PayrollParameter,
    PayrollRun,
)
from app.schemas import (
    CompanySettingsRead,
    CompanySettingsUpsertRequest,
    EmployeeCompensationBulkRequest,
    EmployeeCompensationBulkResult,
    EmployeeCompensationCreateRequest,
    EmployeeCompensationRead,
    EmployeePayrollProfileRead,
    EmployeePayrollProfileUpsertRequest,
    PayrollComponentCreateRequest,
    PayrollComponentRead,
    PayrollGenerateRequest,
    PayrollItemRead,
    PayrollDashboardResponse,
    PayrollEmployeeHistoryResponse,
    PayrollParameterRead,
    PayrollParameterUpsertRequest,
    PayrollReportRead,
    PayrollRunRead,
    TerminationSettlementResponse,
    PayrollRunSummaryRead,
    PayrollSkippedEmployee,
)
from app.security import require_admin_any_permission, require_admin_permission
from app.services.exports import (
    build_bank_payment_txt_bytes,
    build_bank_payment_xlsx_bytes,
    build_payroll_report_xlsx_bytes,
    build_payroll_run_xlsx_bytes,
)
from app.services.logo_export import (
    build_logo_mahsup_xlsx_bytes,
    build_logo_puantaj_xlsx_bytes,
)
from app.services.payroll import (
    aggregate_payroll_report,
    approve_payroll_run,
    build_employee_payroll_history,
    build_payroll_dashboard,
    compute_termination_settlement,
    delete_payroll_run,
    generate_payroll_run,
    list_payroll_runs,
    resolve_compensation_for_period,
    resolve_effective_parameters,
)

router = APIRouter(tags=["payroll"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _actor_username(claims: dict[str, Any]) -> str:
    return str(claims.get("username") or claims.get("sub") or "admin").strip()


def _run_summary(run: PayrollRun) -> PayrollRunSummaryRead:
    return PayrollRunSummaryRead(
        id=run.id,
        year=run.year,
        month=run.month,
        status=run.status,
        note=run.note,
        approved_at=run.approved_at,
        approved_by=run.approved_by,
        created_at=run.created_at,
        item_count=len(run.items),
        gross_total_sum=sum((item.gross_total for item in run.items), start=0),
    )


def _run_detail(
    run: PayrollRun,
    *,
    skipped: list[Employee] | None = None,
) -> PayrollRunRead:
    summary = _run_summary(run)
    return PayrollRunRead(
        **summary.model_dump(),
        items=[PayrollItemRead.model_validate(item) for item in run.items],
        skipped_employees=[
            PayrollSkippedEmployee(employee_id=employee.id, employee_name=employee.full_name)
            for employee in (skipped or [])
        ],
    )


def _get_run_with_items(db: Session, run_id: int) -> PayrollRun:
    run = db.scalar(
        select(PayrollRun).options(selectinload(PayrollRun.items)).where(PayrollRun.id == run_id)
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll run not found")
    return run


def _parameter_read(params: Any) -> PayrollParameterRead:
    return PayrollParameterRead(
        year=params.year,
        monthly_hours_divisor=params.monthly_hours_divisor,
        overtime_multiplier_fm1=params.overtime_multiplier_fm1,
        overtime_multiplier_fm2=params.overtime_multiplier_fm2,
        overtime_multiplier_fm3=params.overtime_multiplier_fm3,
        deduct_missing_minutes=params.deduct_missing_minutes,
        sgk_employee_rate=params.sgk_employee_rate,
        unemployment_employee_rate=params.unemployment_employee_rate,
        sgk_employer_rate=params.sgk_employer_rate,
        unemployment_employer_rate=params.unemployment_employer_rate,
        sgk_employer_incentive_rate=params.sgk_employer_incentive_rate,
        sgdp_employee_rate=params.sgdp_employee_rate,
        sgdp_employer_rate=params.sgdp_employer_rate,
        apply_employer_incentive=params.apply_employer_incentive,
        sgk_base_monthly=params.sgk_base_monthly,
        sgk_ceiling_monthly=params.sgk_ceiling_monthly,
        stamp_tax_rate=params.stamp_tax_rate,
        minimum_wage_gross=params.minimum_wage_gross,
        minimum_wage_gross_h2=params.minimum_wage_gross_h2,
        minimum_wage_h2_month=params.minimum_wage_h2_month,
        disability_degree1_monthly=params.disability_degree1_monthly,
        disability_degree2_monthly=params.disability_degree2_monthly,
        disability_degree3_monthly=params.disability_degree3_monthly,
        severance_ceiling_gross=params.severance_ceiling_gross,
        income_tax_brackets=[
            {"upTo": (None if up_to is None else int(up_to)), "rate": rate}
            for up_to, rate in params.income_tax_brackets
        ],
        is_persisted=params.is_persisted,
    )


@router.get(
    "/api/admin/payroll/parameters",
    response_model=PayrollParameterRead,
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def get_payroll_parameters_endpoint(
    year: int = Query(ge=2000, le=2100),
    db: Session = Depends(get_db),
) -> PayrollParameterRead:
    return _parameter_read(resolve_effective_parameters(db, year))


@router.put(
    "/api/admin/payroll/parameters",
    response_model=PayrollParameterRead,
)
def upsert_payroll_parameters_endpoint(
    payload: PayrollParameterUpsertRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> PayrollParameterRead:
    row = db.scalar(select(PayrollParameter).where(PayrollParameter.year == payload.year))
    if row is None:
        row = PayrollParameter(year=payload.year)
        db.add(row)
    row.monthly_hours_divisor = payload.monthly_hours_divisor
    row.overtime_multiplier_fm1 = payload.overtime_multiplier_fm1
    row.overtime_multiplier_fm2 = payload.overtime_multiplier_fm2
    row.overtime_multiplier_fm3 = payload.overtime_multiplier_fm3
    row.deduct_missing_minutes = payload.deduct_missing_minutes
    row.sgk_employee_rate = payload.sgk_employee_rate
    row.unemployment_employee_rate = payload.unemployment_employee_rate
    row.sgk_employer_rate = payload.sgk_employer_rate
    row.unemployment_employer_rate = payload.unemployment_employer_rate
    row.sgk_employer_incentive_rate = payload.sgk_employer_incentive_rate
    row.sgdp_employee_rate = payload.sgdp_employee_rate
    row.sgdp_employer_rate = payload.sgdp_employer_rate
    row.apply_employer_incentive = payload.apply_employer_incentive
    row.sgk_base_monthly = payload.sgk_base_monthly
    row.sgk_ceiling_monthly = payload.sgk_ceiling_monthly
    row.stamp_tax_rate = payload.stamp_tax_rate
    row.minimum_wage_gross = payload.minimum_wage_gross
    row.minimum_wage_gross_h2 = payload.minimum_wage_gross_h2
    row.minimum_wage_h2_month = payload.minimum_wage_h2_month
    row.disability_degree1_monthly = payload.disability_degree1_monthly
    row.disability_degree2_monthly = payload.disability_degree2_monthly
    row.disability_degree3_monthly = payload.disability_degree3_monthly
    row.severance_ceiling_gross = payload.severance_ceiling_gross
    if payload.income_tax_brackets:
        row.income_tax_brackets = [
            {"upTo": b.upTo, "rate": str(b.rate)} for b in payload.income_tax_brackets
        ]
    db.commit()

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_PARAMETERS_UPSERT",
        success=True,
        entity_type="payroll_parameters",
        entity_id=str(payload.year),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details=payload.model_dump(mode="json"),
        request_id=getattr(request.state, "request_id", None),
    )

    return _parameter_read(resolve_effective_parameters(db, payload.year))


@router.get(
    "/api/admin/payroll/compensations",
    response_model=list[EmployeeCompensationRead],
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def list_compensations_endpoint(
    employee_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[EmployeeCompensation]:
    stmt = select(EmployeeCompensation).order_by(
        EmployeeCompensation.employee_id.asc(),
        EmployeeCompensation.effective_from.desc(),
    )
    if employee_id is not None:
        stmt = stmt.where(EmployeeCompensation.employee_id == employee_id)
    return list(db.scalars(stmt).all())


@router.post(
    "/api/admin/payroll/compensations",
    response_model=EmployeeCompensationRead,
    status_code=status.HTTP_201_CREATED,
)
def create_compensation_endpoint(
    payload: EmployeeCompensationCreateRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> EmployeeCompensation:
    employee = db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    # NET tabaninda gross_monthly kosumda her ay geri hesaplanir; kayitta 0 tutulur.
    row = EmployeeCompensation(
        employee_id=payload.employee_id,
        basis=payload.basis,
        gross_monthly=(
            payload.gross_monthly
            if payload.basis == CompensationBasis.GROSS and payload.gross_monthly is not None
            else Decimal("0")
        ),
        net_monthly=payload.net_monthly if payload.basis == CompensationBasis.NET else None,
        effective_from=payload.effective_from,
        note=(payload.note or "").strip() or None,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Compensation for this employee and effective date already exists",
        )
    db.refresh(row)

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_COMPENSATION_CREATE",
        success=True,
        entity_type="employee_compensation",
        entity_id=str(row.id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={
            "employee_id": payload.employee_id,
            "effective_from": payload.effective_from.isoformat(),
        },
        request_id=getattr(request.state, "request_id", None),
    )
    return row


@router.post(
    "/api/admin/payroll/compensations/bulk-by-department",
    response_model=EmployeeCompensationBulkResult,
)
def bulk_compensation_by_department_endpoint(
    payload: EmployeeCompensationBulkRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> EmployeeCompensationBulkResult:
    stmt = select(Employee).where(Employee.department_id == payload.department_id)
    if not payload.include_inactive:
        stmt = stmt.where(Employee.is_active.is_(True))
    employees = list(db.scalars(stmt.order_by(Employee.full_name.asc())).all())
    if not employees:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bu departmanda (filtreye uyan) calisan yok.",
        )

    gross_val = (
        payload.gross_monthly
        if payload.basis == CompensationBasis.GROSS and payload.gross_monthly is not None
        else Decimal("0")
    )
    net_val = payload.net_monthly if payload.basis == CompensationBasis.NET else None
    note = (payload.note or "").strip() or None

    created = 0
    updated = 0
    for employee in employees:
        # Ayni gecerlilik tarihinde kayit varsa guncelle (unique kisitini asar), yoksa olustur.
        existing = db.scalar(
            select(EmployeeCompensation).where(
                EmployeeCompensation.employee_id == employee.id,
                EmployeeCompensation.effective_from == payload.effective_from,
            )
        )
        if existing is not None:
            existing.basis = payload.basis
            existing.gross_monthly = gross_val
            existing.net_monthly = net_val
            existing.note = note
            updated += 1
        else:
            db.add(
                EmployeeCompensation(
                    employee_id=employee.id,
                    basis=payload.basis,
                    gross_monthly=gross_val,
                    net_monthly=net_val,
                    effective_from=payload.effective_from,
                    note=note,
                )
            )
            created += 1
    db.commit()

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_COMPENSATION_BULK_DEPARTMENT",
        success=True,
        entity_type="department",
        entity_id=str(payload.department_id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={
            "department_id": payload.department_id,
            "effective_from": payload.effective_from.isoformat(),
            "basis": payload.basis.value,
            "created": created,
            "updated": updated,
        },
        request_id=getattr(request.state, "request_id", None),
    )
    return EmployeeCompensationBulkResult(
        department_id=payload.department_id,
        created=created,
        updated=updated,
        total=len(employees),
        employee_names=[e.full_name for e in employees],
    )


@router.delete(
    "/api/admin/payroll/compensations/{compensation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_compensation_endpoint(
    compensation_id: int,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> Response:
    row = db.get(EmployeeCompensation, compensation_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Compensation not found")
    db.delete(row)
    db.commit()

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_COMPENSATION_DELETE",
        success=True,
        entity_type="employee_compensation",
        entity_id=str(compensation_id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={"employee_id": row.employee_id},
        request_id=getattr(request.state, "request_id", None),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/admin/payroll/components",
    response_model=list[PayrollComponentRead],
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def list_payroll_components_endpoint(
    employee_id: int | None = Query(default=None, ge=1),
    year: int | None = Query(default=None, ge=2000, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
) -> list[PayrollComponent]:
    stmt = select(PayrollComponent).order_by(
        PayrollComponent.employee_id.asc(), PayrollComponent.id.asc()
    )
    if employee_id is not None:
        stmt = stmt.where(PayrollComponent.employee_id == employee_id)
    if year is not None:
        stmt = stmt.where(PayrollComponent.year == year)
    if month is not None:
        stmt = stmt.where(PayrollComponent.month == month)
    return list(db.scalars(stmt).all())


@router.post(
    "/api/admin/payroll/components",
    response_model=PayrollComponentRead,
    status_code=status.HTTP_201_CREATED,
)
def create_payroll_component_endpoint(
    payload: PayrollComponentCreateRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> PayrollComponent:
    employee = db.get(Employee, payload.employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    row = PayrollComponent(
        employee_id=payload.employee_id,
        year=payload.year,
        month=payload.month,
        kind=payload.kind,
        code=(payload.code or "").strip() or None,
        label=payload.label.strip(),
        amount=payload.amount,
        exempt_limit=payload.exempt_limit,
        sgk_exempt=payload.sgk_exempt,
        income_tax_exempt=payload.income_tax_exempt,
        stamp_tax_exempt=payload.stamp_tax_exempt,
        note=(payload.note or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_COMPONENT_CREATE",
        success=True,
        entity_type="payroll_component",
        entity_id=str(row.id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={
            "employee_id": payload.employee_id,
            "year": payload.year,
            "month": payload.month,
            "kind": payload.kind.value,
        },
        request_id=getattr(request.state, "request_id", None),
    )
    return row


@router.delete(
    "/api/admin/payroll/components/{component_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_payroll_component_endpoint(
    component_id: int,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> Response:
    row = db.get(PayrollComponent, component_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    employee_id = row.employee_id
    db.delete(row)
    db.commit()

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_COMPONENT_DELETE",
        success=True,
        entity_type="payroll_component",
        entity_id=str(component_id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={"employee_id": employee_id},
        request_id=getattr(request.state, "request_id", None),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/admin/payroll/company-settings",
    response_model=CompanySettingsRead,
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def get_company_settings_endpoint(db: Session = Depends(get_db)) -> CompanySettings:
    row = db.scalar(select(CompanySettings).order_by(CompanySettings.id.asc()))
    if row is None:
        row = CompanySettings()
    return row


@router.put(
    "/api/admin/payroll/company-settings",
    response_model=CompanySettingsRead,
)
def upsert_company_settings_endpoint(
    payload: CompanySettingsUpsertRequest,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> CompanySettings:
    row = db.scalar(select(CompanySettings).order_by(CompanySettings.id.asc()))
    if row is None:
        row = CompanySettings()
        db.add(row)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.get(
    "/api/admin/payroll/profiles/{employee_id}",
    response_model=EmployeePayrollProfileRead,
    dependencies=[Depends(require_admin_any_permission("payroll", "employees"))],
)
def get_employee_payroll_profile_endpoint(
    employee_id: int,
    db: Session = Depends(get_db),
) -> EmployeePayrollProfileRead:
    row = db.scalar(
        select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id == employee_id)
    )
    if row is None:
        return EmployeePayrollProfileRead(employee_id=employee_id)
    return EmployeePayrollProfileRead.model_validate(row)


@router.put(
    "/api/admin/payroll/profiles/{employee_id}",
    response_model=EmployeePayrollProfileRead,
)
def upsert_employee_payroll_profile_endpoint(
    employee_id: int,
    payload: EmployeePayrollProfileUpsertRequest,
    claims: dict[str, Any] = Depends(require_admin_any_permission("payroll", "employees", write=True)),
    db: Session = Depends(get_db),
) -> EmployeePayrollProfileRead:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    row = db.scalar(
        select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id == employee_id)
    )
    if row is None:
        row = EmployeePayrollProfile(employee_id=employee_id)
        db.add(row)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return EmployeePayrollProfileRead.model_validate(row)


@router.get(
    "/api/admin/payroll/dashboard",
    response_model=PayrollDashboardResponse,
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def payroll_dashboard_endpoint(
    limit: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
) -> PayrollDashboardResponse:
    return PayrollDashboardResponse.model_validate(build_payroll_dashboard(db, limit=limit))


@router.get(
    "/api/admin/payroll/employees/{employee_id}/history",
    response_model=PayrollEmployeeHistoryResponse,
    dependencies=[Depends(require_admin_any_permission("payroll", "employees"))],
)
def payroll_employee_history_endpoint(
    employee_id: int,
    db: Session = Depends(get_db),
) -> PayrollEmployeeHistoryResponse:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    data = build_employee_payroll_history(db, employee_id=employee_id)
    return PayrollEmployeeHistoryResponse(
        employee_id=employee_id,
        employee_name=employee.full_name,
        items=data["items"],
        compensations=data["compensations"],
    )


@router.get(
    "/api/admin/payroll/termination-settlement",
    response_model=TerminationSettlementResponse,
    dependencies=[Depends(require_admin_any_permission("payroll", "employees"))],
)
def termination_settlement_endpoint(
    employee_id: int = Query(ge=1),
    termination_date: date = Query(),
    base_gross_monthly: Decimal | None = Query(default=None, gt=0),
    include_notice: bool = Query(default=True),
    unused_leave_days: Decimal = Query(default=Decimal("0"), ge=0),
    db: Session = Depends(get_db),
) -> TerminationSettlementResponse:
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    profile = db.scalar(
        select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id == employee_id)
    )
    hire_date = profile.ise_giris_tarihi if profile is not None else None
    if hire_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Calisanin ise giris tarihi tanimli degil (Calisan Ozluk).",
        )
    if termination_date < hire_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cikis tarihi ise giris tarihinden once olamaz.",
        )

    base_gross = base_gross_monthly
    if base_gross is None:
        comp = resolve_compensation_for_period(db, employee_id=employee_id, period_end=termination_date)
        if comp is not None and comp.basis == CompensationBasis.GROSS:
            base_gross = Decimal(comp.gross_monthly)
    if base_gross is None or base_gross <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Giydirilmis brut taban bulunamadi; base_gross_monthly girin.",
        )

    params = resolve_effective_parameters(db, termination_date.year)
    result = compute_termination_settlement(
        hire_date=hire_date,
        termination_date=termination_date,
        base_gross=base_gross,
        params=params,
        include_notice=include_notice,
        unused_leave_days=unused_leave_days,
    )
    return TerminationSettlementResponse(
        employee_id=employee_id,
        employee_name=employee.full_name,
        **result,
    )


@router.get(
    "/api/admin/payroll/runs",
    response_model=list[PayrollRunSummaryRead],
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def list_payroll_runs_endpoint(db: Session = Depends(get_db)) -> list[PayrollRunSummaryRead]:
    return [_run_summary(run) for run in list_payroll_runs(db)]


@router.get(
    "/api/admin/payroll/runs/{run_id}",
    response_model=PayrollRunRead,
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def get_payroll_run_endpoint(run_id: int, db: Session = Depends(get_db)) -> PayrollRunRead:
    run = _get_run_with_items(db, run_id)
    return _run_detail(run)


@router.post(
    "/api/admin/payroll/runs/generate",
    response_model=PayrollRunRead,
)
def generate_payroll_run_endpoint(
    payload: PayrollGenerateRequest,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> PayrollRunRead:
    run, skipped = generate_payroll_run(
        db,
        year=payload.year,
        month=payload.month,
        note=(payload.note or "").strip() or None,
    )

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_RUN_GENERATE",
        success=True,
        entity_type="payroll_run",
        entity_id=str(run.id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={
            "year": payload.year,
            "month": payload.month,
            "item_count": len(run.items),
            "skipped_count": len(skipped),
        },
        request_id=getattr(request.state, "request_id", None),
    )
    return _run_detail(run, skipped=skipped)


@router.post(
    "/api/admin/payroll/runs/{run_id}/approve",
    response_model=PayrollRunRead,
)
def approve_payroll_run_endpoint(
    run_id: int,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> PayrollRunRead:
    actor = _actor_username(claims)
    run = approve_payroll_run(db, run_id=run_id, approved_by=actor)

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=actor,
        action="PAYROLL_RUN_APPROVE",
        success=True,
        entity_type="payroll_run",
        entity_id=str(run.id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={"year": run.year, "month": run.month},
        request_id=getattr(request.state, "request_id", None),
    )
    return _run_detail(run)


@router.delete(
    "/api/admin/payroll/runs/{run_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_payroll_run_endpoint(
    run_id: int,
    request: Request,
    claims: dict[str, Any] = Depends(require_admin_permission("payroll", write=True)),
    db: Session = Depends(get_db),
) -> Response:
    run = _get_run_with_items(db, run_id)
    year, month = run.year, run.month
    delete_payroll_run(db, run_id=run_id)

    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=_actor_username(claims),
        action="PAYROLL_RUN_DELETE",
        success=True,
        entity_type="payroll_run",
        entity_id=str(run_id),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={"year": year, "month": month},
        request_id=getattr(request.state, "request_id", None),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/admin/payroll/runs/{run_id}/export.xlsx",
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def export_payroll_run_xlsx_endpoint(run_id: int, db: Session = Depends(get_db)) -> Response:
    run = _get_run_with_items(db, run_id)
    payload = build_payroll_run_xlsx_bytes(
        run,
        sorted(run.items, key=lambda item: item.employee_name.lower()),
        generated_at=datetime.now(timezone.utc),
    )
    status_suffix = "onayli" if run.status.value == "APPROVED" else "taslak"
    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": (
                f'attachment; filename="hakedis-{run.year}-{run.month:02d}-{status_suffix}.xlsx"'
            ),
        },
    )


def _profiles_by_employee(db: Session, items: list[Any]) -> dict[int, EmployeePayrollProfile]:
    employee_ids = [item.employee_id for item in items if item.employee_id is not None]
    if not employee_ids:
        return {}
    rows = db.scalars(
        select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id.in_(employee_ids))
    ).all()
    return {row.employee_id: row for row in rows}


@router.get(
    "/api/admin/payroll/runs/{run_id}/report",
    response_model=PayrollReportRead,
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def get_payroll_report_endpoint(run_id: int, db: Session = Depends(get_db)) -> PayrollReportRead:
    run = _get_run_with_items(db, run_id)
    return PayrollReportRead.model_validate(aggregate_payroll_report(run, list(run.items)))


@router.get(
    "/api/admin/payroll/runs/{run_id}/report.xlsx",
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def export_payroll_report_xlsx_endpoint(run_id: int, db: Session = Depends(get_db)) -> Response:
    run = _get_run_with_items(db, run_id)
    report = aggregate_payroll_report(run, list(run.items))
    payload = build_payroll_report_xlsx_bytes(run, report, generated_at=datetime.now(timezone.utc))
    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": (
                f'attachment; filename="bordro-rapor-{run.year}-{run.month:02d}.xlsx"'
            ),
        },
    )


@router.get(
    "/api/admin/payroll/runs/{run_id}/bank-payment.xlsx",
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def export_bank_payment_xlsx_endpoint(run_id: int, db: Session = Depends(get_db)) -> Response:
    run = _get_run_with_items(db, run_id)
    items = sorted(run.items, key=lambda item: item.employee_name.lower())
    payload = build_bank_payment_xlsx_bytes(
        run,
        items,
        _profiles_by_employee(db, items),
        generated_at=datetime.now(timezone.utc),
    )
    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": (
                f'attachment; filename="banka-odeme-{run.year}-{run.month:02d}.xlsx"'
            ),
        },
    )


@router.get(
    "/api/admin/payroll/runs/{run_id}/bank-payment.txt",
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def export_bank_payment_txt_endpoint(run_id: int, db: Session = Depends(get_db)) -> Response:
    run = _get_run_with_items(db, run_id)
    items = sorted(run.items, key=lambda item: item.employee_name.lower())
    payload = build_bank_payment_txt_bytes(run, items, _profiles_by_employee(db, items))
    return Response(
        content=payload,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": (
                f'attachment; filename="banka-odeme-{run.year}-{run.month:02d}.txt"'
            ),
        },
    )


@router.get(
    "/api/admin/payroll/runs/{run_id}/logo-puantaj.xlsx",
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def export_logo_puantaj_xlsx_endpoint(run_id: int, db: Session = Depends(get_db)) -> Response:
    run = _get_run_with_items(db, run_id)
    items = sorted(run.items, key=lambda item: item.employee_name.lower())
    payload = build_logo_puantaj_xlsx_bytes(
        run,
        items,
        _profiles_by_employee(db, items),
        generated_at=datetime.now(timezone.utc),
    )
    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": (
                f'attachment; filename="logo-puantaj-{run.year}-{run.month:02d}.xlsx"'
            ),
        },
    )


@router.get(
    "/api/admin/payroll/runs/{run_id}/logo-mahsup.xlsx",
    dependencies=[Depends(require_admin_permission("payroll"))],
)
def export_logo_mahsup_xlsx_endpoint(run_id: int, db: Session = Depends(get_db)) -> Response:
    run = _get_run_with_items(db, run_id)
    items = sorted(run.items, key=lambda item: item.employee_name.lower())
    settings = db.scalar(select(CompanySettings).order_by(CompanySettings.id.asc()))
    payload = build_logo_mahsup_xlsx_bytes(
        run,
        items,
        settings,
        generated_at=datetime.now(timezone.utc),
    )
    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={
            "Content-Disposition": (
                f'attachment; filename="logo-mahsup-{run.year}-{run.month:02d}.xlsx"'
            ),
        },
    )
