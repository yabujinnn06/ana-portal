"""schedule: cumartesi rotasyonlari

Revision ID: 0065_saturday_rotations
Revises: 0064_employee_address
Create Date: 2026-07-07 13:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0065_saturday_rotations"
down_revision = "0064_employee_address"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "saturday_rotations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("shift_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("team_size", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("repeat_interval_weeks", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shift_id"], ["department_shifts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saturday_rotations_department_id", "saturday_rotations", ["department_id"])
    op.create_index("ix_saturday_rotations_shift_id", "saturday_rotations", ["shift_id"])
    op.create_index("ix_saturday_rotations_start_date", "saturday_rotations", ["start_date"])
    op.create_index("ix_saturday_rotations_end_date", "saturday_rotations", ["end_date"])

    op.create_table(
        "saturday_rotation_days",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rotation_id", sa.Integer(), nullable=False),
        sa.Column("day_date", sa.Date(), nullable=False),
        sa.Column("schedule_plan_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["rotation_id"], ["saturday_rotations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["schedule_plan_id"], ["department_schedule_plans.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rotation_id", "day_date", name="uq_saturday_rotation_days_rotation_date"),
    )
    op.create_index("ix_saturday_rotation_days_rotation_id", "saturday_rotation_days", ["rotation_id"])
    op.create_index("ix_saturday_rotation_days_day_date", "saturday_rotation_days", ["day_date"])
    op.create_index("ix_saturday_rotation_days_schedule_plan_id", "saturday_rotation_days", ["schedule_plan_id"])

    op.create_table(
        "saturday_rotation_day_employees",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rotation_day_id", sa.Integer(), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["rotation_day_id"], ["saturday_rotation_days.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "rotation_day_id",
            "employee_id",
            name="uq_saturday_rotation_day_employees_day_employee",
        ),
    )
    op.create_index(
        "ix_saturday_rotation_day_employees_rotation_day_id",
        "saturday_rotation_day_employees",
        ["rotation_day_id"],
    )
    op.create_index(
        "ix_saturday_rotation_day_employees_employee_id",
        "saturday_rotation_day_employees",
        ["employee_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_saturday_rotation_day_employees_employee_id", table_name="saturday_rotation_day_employees")
    op.drop_index("ix_saturday_rotation_day_employees_rotation_day_id", table_name="saturday_rotation_day_employees")
    op.drop_table("saturday_rotation_day_employees")
    op.drop_index("ix_saturday_rotation_days_schedule_plan_id", table_name="saturday_rotation_days")
    op.drop_index("ix_saturday_rotation_days_day_date", table_name="saturday_rotation_days")
    op.drop_index("ix_saturday_rotation_days_rotation_id", table_name="saturday_rotation_days")
    op.drop_table("saturday_rotation_days")
    op.drop_index("ix_saturday_rotations_end_date", table_name="saturday_rotations")
    op.drop_index("ix_saturday_rotations_start_date", table_name="saturday_rotations")
    op.drop_index("ix_saturday_rotations_shift_id", table_name="saturday_rotations")
    op.drop_index("ix_saturday_rotations_department_id", table_name="saturday_rotations")
    op.drop_table("saturday_rotations")
