"""neutralize overtime multiplier defaults

Revision ID: 0045_neutralize_overtime_multiplier_defaults
Revises: 0044_special_day_employee_overrides
Create Date: 2026-05-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0045_neutralize_overtime_multiplier_defaults"
down_revision = "0044_special_day_employee_overrides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE special_days SET overtime_multiplier = 1.0 WHERE overtime_multiplier IS DISTINCT FROM 1.0")
    op.execute(
        "UPDATE special_day_employee_overrides "
        "SET overtime_multiplier = 1.0 WHERE overtime_multiplier IS DISTINCT FROM 1.0"
    )
    op.alter_column(
        "special_days",
        "overtime_multiplier",
        existing_type=sa.Float(),
        server_default=sa.text("1.0"),
        existing_nullable=False,
    )
    op.alter_column(
        "special_day_employee_overrides",
        "overtime_multiplier",
        existing_type=sa.Float(),
        server_default=sa.text("1.0"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "special_day_employee_overrides",
        "overtime_multiplier",
        existing_type=sa.Float(),
        server_default=sa.text("2.0"),
        existing_nullable=False,
    )
    op.alter_column(
        "special_days",
        "overtime_multiplier",
        existing_type=sa.Float(),
        server_default=sa.text("2.0"),
        existing_nullable=False,
    )
