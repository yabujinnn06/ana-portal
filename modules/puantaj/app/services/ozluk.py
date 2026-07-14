"""Ozluk (personel idaresi) master veri sorgulari.

Amac: calisan kimlik + SGK/sozlesme profili + guncel ucret bilgisini TEK
sorgudan, TEK satirda dondurmek. Once bu bilgiler PayrollPage icinde bircok
ayri tab/form arasinda dagilmisti (ozluk verisi nerede oldugu belirsizdi);
bu modul tum ozluk okuma yollarini tek yerde toplar.
"""

from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Department, Employee, EmployeeCompensation, EmployeePayrollProfile, SgkStatus
from app.schemas import EmployeeCompensationRead, EmployeePayrollProfileRead, OzlukEmployeeDetail, OzlukMasterRow

_MASTER_XLSX_HEADERS = [
    "Ad Soyad",
    "Durum",
    "Departman",
    "Pozisyon",
    "Sözleşme Tipi",
    "İşe Giriş Tarihi",
    "SGK Statüsü",
    "Yarı Zamanlı",
    "TC Kimlik No",
    "SGK Sicil No",
    "İş Telefonu",
    "Cep Telefonu",
    "Ücret Tabanı",
    "Güncel Brüt (TL)",
    "Güncel Net (TL)",
    "Ücret Geçerlilik",
    "Özlük Kaydı",
]


def _latest_compensation(
    compensations_by_employee: dict[int, list[EmployeeCompensation]],
    employee_id: int,
) -> EmployeeCompensation | None:
    rows = compensations_by_employee.get(employee_id)
    if not rows:
        return None
    return max(rows, key=lambda c: c.effective_from)


def build_ozluk_master_rows(
    db: Session,
    *,
    department_id: int | None = None,
    search: str | None = None,
    status: str = "active",
) -> list[OzlukMasterRow]:
    query = select(Employee, Department.name, EmployeePayrollProfile).join(
        Department, Department.id == Employee.department_id, isouter=True
    ).join(
        EmployeePayrollProfile, EmployeePayrollProfile.employee_id == Employee.id, isouter=True
    )
    if department_id is not None:
        query = query.where(Employee.department_id == department_id)
    if status == "active":
        query = query.where(Employee.is_active.is_(True))
    elif status == "inactive":
        query = query.where(Employee.is_active.is_(False))
    if search:
        query = query.where(Employee.full_name.ilike(f"%{search.strip()}%"))
    query = query.order_by(Employee.full_name.asc())

    rows = db.execute(query).all()
    employee_ids = [employee.id for employee, _, _ in rows]

    comp_by_employee: dict[int, list[EmployeeCompensation]] = {}
    if employee_ids:
        comps = db.scalars(
            select(EmployeeCompensation).where(EmployeeCompensation.employee_id.in_(employee_ids))
        ).all()
        for comp in comps:
            comp_by_employee.setdefault(comp.employee_id, []).append(comp)

    result: list[OzlukMasterRow] = []
    for employee, department_name, profile in rows:
        latest_comp = _latest_compensation(comp_by_employee, employee.id)
        result.append(
            OzlukMasterRow(
                employee_id=employee.id,
                full_name=employee.full_name,
                is_active=employee.is_active,
                department_id=employee.department_id,
                department_name=department_name,
                pozisyon=profile.pozisyon if profile else None,
                sozlesme_tipi=profile.sozlesme_tipi if profile else None,
                ise_giris_tarihi=profile.ise_giris_tarihi if profile else None,
                sgk_status=profile.sgk_status if profile else SgkStatus.NORMAL,
                is_part_time=profile.is_part_time if profile else False,
                tc_kimlik_no=profile.tc_kimlik_no if profile else None,
                sgk_sicil_no=profile.sgk_sicil_no if profile else None,
                sirket_telefonu=profile.sirket_telefonu if profile else None,
                cep_telefonu=profile.cep_telefonu if profile else None,
                current_basis=latest_comp.basis if latest_comp else None,
                current_gross_monthly=latest_comp.gross_monthly if latest_comp else None,
                current_net_monthly=latest_comp.net_monthly if latest_comp else None,
                current_effective_from=latest_comp.effective_from if latest_comp else None,
                has_profile=profile is not None,
            )
        )
    return result


def build_ozluk_master_xlsx(
    db: Session,
    *,
    department_id: int | None = None,
    search: str | None = None,
    status: str = "active",
) -> bytes:
    rows = build_ozluk_master_rows(db, department_id=department_id, search=search, status=status)

    wb = Workbook()
    ws = wb.active
    ws.title = "Özlük"

    ws.append(_MASTER_XLSX_HEADERS)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="0F172A")
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.freeze_panes = "A2"

    sozlesme_labels = {"BELIRLI": "Belirli Süreli", "BELIRSIZ": "Belirsiz Süreli"}
    for row in rows:
        ws.append(
            [
                row.full_name,
                "Aktif" if row.is_active else "Pasif",
                row.department_name or "-",
                row.pozisyon or "-",
                sozlesme_labels.get(row.sozlesme_tipi or "", "-"),
                row.ise_giris_tarihi or "-",
                "Emekli" if row.sgk_status == SgkStatus.EMEKLI else "Normal",
                "Evet" if row.is_part_time else "Hayır",
                row.tc_kimlik_no or "-",
                row.sgk_sicil_no or "-",
                row.sirket_telefonu or "-",
                row.cep_telefonu or "-",
                row.current_basis.value if row.current_basis else "-",
                float(row.current_gross_monthly) if row.current_gross_monthly else None,
                float(row.current_net_monthly) if row.current_net_monthly else None,
                row.current_effective_from or "-",
                "Tam" if row.has_profile else "Eksik",
            ]
        )

    last_row = ws.max_row
    if rows:
        table = Table(
            displayName="OzlukMasterTable",
            ref=f"A1:{get_column_letter(len(_MASTER_XLSX_HEADERS))}{last_row}",
        )
        table.tableStyleInfo = TableStyleInfo(
            name="TableStyleMedium9",
            showFirstColumn=False,
            showLastColumn=False,
            showRowStripes=True,
            showColumnStripes=False,
        )
        ws.add_table(table)

        for column_letter in ("N", "O"):
            for r in range(2, last_row + 1):
                ws[f"{column_letter}{r}"].number_format = "#,##0.00"

    for idx, header in enumerate(_MASTER_XLSX_HEADERS, start=1):
        column_letter = get_column_letter(idx)
        max_length = max(
            [len(header)] + [len(str(ws.cell(row=r, column=idx).value or "")) for r in range(2, last_row + 1)]
        )
        ws.column_dimensions[column_letter].width = min(max(max_length + 2, 10), 40)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def build_ozluk_employee_detail(db: Session, employee_id: int) -> OzlukEmployeeDetail | None:
    employee = db.get(Employee, employee_id)
    if employee is None:
        return None
    department_name = None
    if employee.department_id is not None:
        department_name = db.scalar(select(Department.name).where(Department.id == employee.department_id))
    profile = db.scalar(
        select(EmployeePayrollProfile).where(EmployeePayrollProfile.employee_id == employee_id)
    )
    compensations = db.scalars(
        select(EmployeeCompensation)
        .where(EmployeeCompensation.employee_id == employee_id)
        .order_by(EmployeeCompensation.effective_from.desc())
    ).all()

    profile_read = (
        EmployeePayrollProfileRead.model_validate(profile)
        if profile is not None
        else EmployeePayrollProfileRead(employee_id=employee_id)
    )

    return OzlukEmployeeDetail(
        employee_id=employee.id,
        full_name=employee.full_name,
        is_active=employee.is_active,
        department_id=employee.department_id,
        department_name=department_name,
        profile=profile_read,
        compensations=[EmployeeCompensationRead.model_validate(comp) for comp in compensations],
    )


__all__ = ["build_ozluk_master_rows", "build_ozluk_employee_detail", "_latest_compensation"]
