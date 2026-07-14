"""payroll: calisan is ve cep telefonu

Revision ID: 0063_employee_phones
Revises: 0062_assistant_daily_usage
Create Date: 2026-07-06 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0063_employee_phones"
down_revision = "0062_assistant_daily_usage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("employee_payroll_profiles", sa.Column("sirket_telefonu", sa.String(length=40), nullable=True))
    op.add_column("employee_payroll_profiles", sa.Column("cep_telefonu", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("employee_payroll_profiles", "cep_telefonu")
    op.drop_column("employee_payroll_profiles", "sirket_telefonu")
