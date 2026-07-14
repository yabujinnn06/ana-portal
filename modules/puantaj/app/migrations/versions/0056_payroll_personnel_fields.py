"""payroll: ozluk genisletme (sozlesme tipi, pozisyon, dogum, medeni hal, acil kisi)

Revision ID: 0056_payroll_personnel
Revises: 0055_payroll_severance
Create Date: 2026-06-15 17:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0056_payroll_personnel"
down_revision = "0055_payroll_severance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employee_payroll_profiles", sa.Column("sozlesme_tipi", sa.String(length=20), nullable=True))
    op.add_column("employee_payroll_profiles", sa.Column("pozisyon", sa.String(length=120), nullable=True))
    op.add_column("employee_payroll_profiles", sa.Column("dogum_tarihi", sa.Date(), nullable=True))
    op.add_column("employee_payroll_profiles", sa.Column("medeni_hal", sa.String(length=20), nullable=True))
    op.add_column("employee_payroll_profiles", sa.Column("acil_kisi_adi", sa.String(length=120), nullable=True))
    op.add_column("employee_payroll_profiles", sa.Column("acil_kisi_tel", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("employee_payroll_profiles", "acil_kisi_tel")
    op.drop_column("employee_payroll_profiles", "acil_kisi_adi")
    op.drop_column("employee_payroll_profiles", "medeni_hal")
    op.drop_column("employee_payroll_profiles", "dogum_tarihi")
    op.drop_column("employee_payroll_profiles", "pozisyon")
    op.drop_column("employee_payroll_profiles", "sozlesme_tipi")
