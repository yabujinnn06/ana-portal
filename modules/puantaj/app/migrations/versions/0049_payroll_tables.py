"""payroll tables: compensation, parameters, runs, items

Revision ID: 0049_payroll_tables
Revises: 0048_half_day_support
Create Date: 2026-06-12 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0049_payroll_tables"
down_revision = "0048_half_day_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "employee_compensations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("gross_monthly", sa.Numeric(12, 2), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("employee_id", "effective_from", name="uq_employee_comp_effective"),
    )

    op.create_table(
        "payroll_parameters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False, unique=True, index=True),
        sa.Column("monthly_hours_divisor", sa.Numeric(7, 2), nullable=False, server_default=sa.text("225")),
        sa.Column("overtime_multiplier_fm1", sa.Numeric(4, 2), nullable=False, server_default=sa.text("1.5")),
        sa.Column("overtime_multiplier_fm2", sa.Numeric(4, 2), nullable=False, server_default=sa.text("2")),
        sa.Column("overtime_multiplier_fm3", sa.Numeric(4, 2), nullable=False, server_default=sa.text("2")),
        sa.Column("deduct_missing_minutes", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    # create_type=False: tipi yalnizca asagida acikca (checkfirst ile) yaratiriz;
    # create_table'in kolon tipini otomatik ikinci kez yaratmasini engeller
    # (yoksa "type already exists" ile pre-deploy patlar).
    payroll_run_status = postgresql.ENUM(
        "DRAFT",
        "APPROVED",
        name="payroll_run_status",
        create_type=False,
    )
    payroll_run_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "payroll_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False, index=True),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("status", payroll_run_status, nullable=False, server_default=sa.text("'DRAFT'")),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("year", "month", name="uq_payroll_run_period"),
    )

    op.create_table(
        "payroll_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "payroll_run_id",
            sa.Integer(),
            sa.ForeignKey("payroll_runs.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employees.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("employee_name", sa.String(255), nullable=False),
        sa.Column("department_name", sa.String(255), nullable=True),
        sa.Column("gross_monthly", sa.Numeric(12, 2), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(12, 4), nullable=False),
        sa.Column("worked_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("fm1_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("fm2_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("fm3_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("missing_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("unpaid_leave_minutes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("incomplete_days", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("base_earning", sa.Numeric(12, 2), nullable=False),
        sa.Column("overtime_fm1_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("overtime_fm2_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("overtime_fm3_amount", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("missing_deduction", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("unpaid_leave_deduction", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("gross_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade() -> None:
    op.drop_table("payroll_items")
    op.drop_table("payroll_runs")
    sa.Enum(name="payroll_run_status").drop(op.get_bind(), checkfirst=True)
    op.drop_table("payroll_parameters")
    op.drop_table("employee_compensations")
