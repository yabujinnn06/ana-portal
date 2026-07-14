"""payroll: part-time flag on employee payroll profile

Revision ID: 0052_payroll_part_time
Revises: 0051_payroll_emekli_eksikgun
Create Date: 2026-06-14 01:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0052_payroll_part_time"
down_revision = "0051_payroll_emekli_eksikgun"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employee_payroll_profiles",
        sa.Column("is_part_time", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("employee_payroll_profiles", "is_part_time")
