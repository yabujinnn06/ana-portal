"""payroll: calisan adres alani

Revision ID: 0064_employee_address
Revises: 0063_employee_phones
Create Date: 2026-07-06 13:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0064_employee_address"
down_revision = "0063_employee_phones"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employee_payroll_profiles", sa.Column("adres", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("employee_payroll_profiles", "adres")
