"""payroll phase2: H2 asgari ucret, engelli indirimi, yol/yemek istisna limiti

Revision ID: 0054_payroll_phase2
Revises: 0053_payroll_components
Create Date: 2026-06-15 14:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0054_payroll_phase2"
down_revision = "0053_payroll_components"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payroll_parameters",
        sa.Column("minimum_wage_gross_h2", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "payroll_parameters",
        sa.Column("minimum_wage_h2_month", sa.Integer(), nullable=False, server_default=sa.text("7")),
    )
    op.add_column(
        "payroll_parameters",
        sa.Column("disability_degree1_monthly", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "payroll_parameters",
        sa.Column("disability_degree2_monthly", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "payroll_parameters",
        sa.Column("disability_degree3_monthly", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "employee_payroll_profiles",
        sa.Column("disability_degree", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "payroll_components",
        sa.Column("exempt_limit", sa.Numeric(12, 2), nullable=True),
    )
    op.add_column(
        "payroll_items",
        sa.Column("disability_reduction", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("payroll_items", "disability_reduction")
    op.drop_column("payroll_components", "exempt_limit")
    op.drop_column("employee_payroll_profiles", "disability_degree")
    op.drop_column("payroll_parameters", "disability_degree3_monthly")
    op.drop_column("payroll_parameters", "disability_degree2_monthly")
    op.drop_column("payroll_parameters", "disability_degree1_monthly")
    op.drop_column("payroll_parameters", "minimum_wage_h2_month")
    op.drop_column("payroll_parameters", "minimum_wage_gross_h2")
