"""special day employee overrides

Revision ID: 0044_special_day_employee_overrides
Revises: 0043_special_days_and_employee_rest_days
Create Date: 2026-05-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0044_special_day_employee_overrides"
down_revision = "0043_special_days_and_employee_rest_days"
branch_labels = None
depends_on = None


overtime_code = postgresql.ENUM("NONE", "FM1", "FM2", "FM3", name="overtime_code", create_type=False)
special_day_work_policy = postgresql.ENUM(
    "OFF",
    "HALF_DAY",
    "WORKDAY",
    name="special_day_work_policy",
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        "special_day_employee_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("special_day_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("work_policy", special_day_work_policy, nullable=False, server_default=sa.text("'OFF'")),
        sa.Column("planned_minutes_override", sa.Integer(), nullable=True),
        sa.Column("counts_as_paid_leave", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("overtime_code", overtime_code, nullable=False, server_default=sa.text("'FM3'")),
        sa.Column("overtime_multiplier", sa.Float(), nullable=False, server_default=sa.text("2.0")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["special_day_id"], ["special_days.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "special_day_id",
            "employee_id",
            name="uq_special_day_employee_overrides_day_employee",
        ),
    )
    op.create_index(
        op.f("ix_special_day_employee_overrides_employee_id"),
        "special_day_employee_overrides",
        ["employee_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_special_day_employee_overrides_is_active"),
        "special_day_employee_overrides",
        ["is_active"],
        unique=False,
    )
    op.create_index(
        op.f("ix_special_day_employee_overrides_special_day_id"),
        "special_day_employee_overrides",
        ["special_day_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_special_day_employee_overrides_special_day_id"), table_name="special_day_employee_overrides")
    op.drop_index(op.f("ix_special_day_employee_overrides_is_active"), table_name="special_day_employee_overrides")
    op.drop_index(op.f("ix_special_day_employee_overrides_employee_id"), table_name="special_day_employee_overrides")
    op.drop_table("special_day_employee_overrides")
