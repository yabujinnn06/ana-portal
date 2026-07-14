"""align fm codes with payroll labels

Revision ID: 0046_align_fm_codes
Revises: 0045_neutralize_overtime_multiplier_defaults
Create Date: 2026-05-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0046_align_fm_codes"
down_revision = "0045_neutralize_overtime_multiplier_defaults"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE special_days SET overtime_code = 'FM2' WHERE overtime_code = 'FM3'")
    op.execute("UPDATE special_day_employee_overrides SET overtime_code = 'FM2' WHERE overtime_code = 'FM3'")
    op.alter_column(
        "special_days",
        "overtime_code",
        existing_type=sa.Enum("NONE", "FM1", "FM2", "FM3", name="overtime_code"),
        server_default=sa.text("'FM2'"),
        existing_nullable=False,
    )
    op.alter_column(
        "special_day_employee_overrides",
        "overtime_code",
        existing_type=sa.Enum("NONE", "FM1", "FM2", "FM3", name="overtime_code"),
        server_default=sa.text("'FM2'"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "special_day_employee_overrides",
        "overtime_code",
        existing_type=sa.Enum("NONE", "FM1", "FM2", "FM3", name="overtime_code"),
        server_default=sa.text("'FM3'"),
        existing_nullable=False,
    )
    op.alter_column(
        "special_days",
        "overtime_code",
        existing_type=sa.Enum("NONE", "FM1", "FM2", "FM3", name="overtime_code"),
        server_default=sa.text("'FM3'"),
        existing_nullable=False,
    )
