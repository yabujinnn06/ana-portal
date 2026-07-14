"""special days and employee weekly rest days

Revision ID: 0043_special_days_and_employee_rest_days
Revises: 0042_employee_conversations
Create Date: 2026-05-05 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0043_special_days_and_employee_rest_days"
down_revision = "0042_employee_conversations"
branch_labels = None
depends_on = None


overtime_code = postgresql.ENUM("NONE", "FM1", "FM2", "FM3", name="overtime_code", create_type=False)
special_day_type = postgresql.ENUM(
    "PUBLIC_HOLIDAY",
    "COMPANY_HOLIDAY",
    "ADMINISTRATIVE_LEAVE",
    "HALF_DAY",
    "OTHER",
    name="special_day_type",
    create_type=False,
)
special_day_work_policy = postgresql.ENUM(
    "OFF",
    "HALF_DAY",
    "WORKDAY",
    name="special_day_work_policy",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    overtime_code.create(bind, checkfirst=True)
    special_day_type.create(bind, checkfirst=True)
    special_day_work_policy.create(bind, checkfirst=True)

    op.create_table(
        "employee_weekly_rest_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "weekday", name="uq_employee_weekly_rest_days_employee_weekday"),
    )
    op.create_index(
        op.f("ix_employee_weekly_rest_days_employee_id"),
        "employee_weekly_rest_days",
        ["employee_id"],
        unique=False,
    )

    op.create_table(
        "special_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("day_type", special_day_type, nullable=False, server_default=sa.text("'PUBLIC_HOLIDAY'")),
        sa.Column("work_policy", special_day_work_policy, nullable=False, server_default=sa.text("'OFF'")),
        sa.Column("planned_minutes_override", sa.Integer(), nullable=True),
        sa.Column("counts_as_paid_leave", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("overtime_code", overtime_code, nullable=False, server_default=sa.text("'FM3'")),
        sa.Column("overtime_multiplier", sa.Float(), nullable=False, server_default=sa.text("2.0")),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("region_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["region_id"], ["regions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_special_days_day_date"), "special_days", ["day_date"], unique=False)
    op.create_index(op.f("ix_special_days_department_id"), "special_days", ["department_id"], unique=False)
    op.create_index(op.f("ix_special_days_region_id"), "special_days", ["region_id"], unique=False)
    op.create_index(op.f("ix_special_days_is_active"), "special_days", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_special_days_is_active"), table_name="special_days")
    op.drop_index(op.f("ix_special_days_region_id"), table_name="special_days")
    op.drop_index(op.f("ix_special_days_department_id"), table_name="special_days")
    op.drop_index(op.f("ix_special_days_day_date"), table_name="special_days")
    op.drop_table("special_days")
    op.drop_index(op.f("ix_employee_weekly_rest_days_employee_id"), table_name="employee_weekly_rest_days")
    op.drop_table("employee_weekly_rest_days")

    bind = op.get_bind()
    special_day_work_policy.drop(bind, checkfirst=True)
    special_day_type.drop(bind, checkfirst=True)
    overtime_code.drop(bind, checkfirst=True)
