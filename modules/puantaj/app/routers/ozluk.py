"""Ozluk (personel idaresi) endpointleri.

Bordro (payroll) hesaplama akisindan bagimsiz: burasi "kim kim, hangi
sozlesmede, hangi SGK statusunde, guncel ucreti ne" sorularina TEK ekrandan
cevap verir. Alttaki veri (EmployeePayrollProfile, EmployeeCompensation)
bordro router'i ile paylasilir; burada sadece okuma + profil/ucret CRUD'unu
tek capta sunan yeni bir yuzey eklenir.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import (
    OzlukEmployeeDetail,
    OzlukMasterRow,
    PersonnelImportCommitResponse,
    PersonnelImportPreviewResponse,
    PersonnelImportRowResponse,
)
from app.security import require_admin_any_permission
from app.services.ozluk import build_ozluk_employee_detail, build_ozluk_master_rows, build_ozluk_master_xlsx
from app.services.personnel_import import build_import_preview, commit_import_rows

router = APIRouter()

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get(
    "/api/admin/ozluk/master",
    response_model=list[OzlukMasterRow],
    dependencies=[Depends(require_admin_any_permission("payroll", "employees"))],
)
def get_ozluk_master(
    department_id: int | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    status_filter: str = Query(default="active", alias="status", pattern="^(active|inactive|all)$"),
    db: Session = Depends(get_db),
) -> list[OzlukMasterRow]:
    return build_ozluk_master_rows(db, department_id=department_id, search=search, status=status_filter)


@router.get(
    "/api/admin/ozluk/export.xlsx",
    dependencies=[Depends(require_admin_any_permission("payroll", "employees"))],
)
def export_ozluk_master_xlsx(
    department_id: int | None = Query(default=None),
    search: str | None = Query(default=None, max_length=255),
    status_filter: str = Query(default="active", alias="status", pattern="^(active|inactive|all)$"),
    db: Session = Depends(get_db),
) -> Response:
    payload = build_ozluk_master_xlsx(db, department_id=department_id, search=search, status=status_filter)
    filename = f"ozluk_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.xlsx"
    return Response(
        content=payload,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/api/admin/ozluk/{employee_id}",
    response_model=OzlukEmployeeDetail,
    dependencies=[Depends(require_admin_any_permission("payroll", "employees"))],
)
def get_ozluk_employee_detail(
    employee_id: int,
    db: Session = Depends(get_db),
) -> OzlukEmployeeDetail:
    detail = build_ozluk_employee_detail(db, employee_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return detail


@router.post(
    "/api/admin/ozluk/import/preview",
    response_model=PersonnelImportPreviewResponse,
    dependencies=[Depends(require_admin_any_permission("payroll", "employees", write=True))],
)
async def preview_personnel_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> PersonnelImportPreviewResponse:
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sadece .xlsx dosyaları desteklenir")
    file_bytes = await file.read()
    try:
        preview = build_import_preview(db, file_bytes)
    except Exception as exc:  # noqa: BLE001 - excel parse hatalarini kullaniciya duz mesajla ilet
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Dosya okunamadı: {exc}") from exc
    return PersonnelImportPreviewResponse(
        rows=[PersonnelImportRowResponse(**row.__dict__) for row in preview.rows],
        new_regions=preview.new_regions,
        new_departments=preview.new_departments,
        parse_errors=preview.parse_errors,
    )


@router.post(
    "/api/admin/ozluk/import/commit",
    response_model=PersonnelImportCommitResponse,
    dependencies=[Depends(require_admin_any_permission("payroll", "employees", write=True))],
)
async def commit_personnel_import(
    file: UploadFile = File(...),
    skip_sira_no: str = "",
    db: Session = Depends(get_db),
) -> PersonnelImportCommitResponse:
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sadece .xlsx dosyaları desteklenir")
    file_bytes = await file.read()
    skip_set = {int(v) for v in skip_sira_no.split(",") if v.strip().isdigit()}
    try:
        result = commit_import_rows(db, file_bytes, skip_sira_nos=skip_set)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"İçe aktarma başarısız: {exc}") from exc
    return PersonnelImportCommitResponse(
        created=result.created,
        updated=result.updated,
        skipped=result.skipped,
        created_regions=result.created_regions,
        created_departments=result.created_departments,
    )
