"""payroll legal params: net basis, SGK/tax parameters, item legal snapshot

Revision ID: 0050_payroll_legal_params
Revises: 0049_payroll_tables
Create Date: 2026-06-13 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0050_payroll_legal_params"
down_revision = "0049_payroll_tables"
branch_labels = None
depends_on = None


DEFAULT_BRACKETS = (
    '[{"upTo": 190000, "rate": "0.15"}, '
    '{"upTo": 400000, "rate": "0.20"}, '
    '{"upTo": 1500000, "rate": "0.27"}, '
    '{"upTo": 5300000, "rate": "0.35"}, '
    '{"upTo": null, "rate": "0.40"}]'
)


def upgrade() -> None:
    # Enum tipini bir kez ve checkfirst ile yarat; kolonlarda create_type=False
    # ile referans ver (0049'daki cifte-yaratim patlamasinin onlemi).
    compensation_basis = postgresql.ENUM(
        "GROSS",
        "NET",
        name="compensation_basis",
        create_type=False,
    )
    compensation_basis.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "employee_compensations",
        sa.Column("basis", compensation_basis, nullable=False, server_default=sa.text("'GROSS'")),
    )
    op.add_column(
        "employee_compensations",
        sa.Column("net_monthly", sa.Numeric(12, 2), nullable=True),
    )

    # payroll_parameters: yasal kesinti parametreleri
    op.add_column("payroll_parameters", sa.Column("sgk_employee_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.14")))
    op.add_column("payroll_parameters", sa.Column("unemployment_employee_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.01")))
    op.add_column("payroll_parameters", sa.Column("sgk_employer_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.2075")))
    op.add_column("payroll_parameters", sa.Column("unemployment_employer_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.02")))
    op.add_column("payroll_parameters", sa.Column("sgk_employer_incentive_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.05")))
    op.add_column("payroll_parameters", sa.Column("apply_employer_incentive", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("payroll_parameters", sa.Column("sgk_base_monthly", sa.Numeric(12, 2), nullable=False, server_default=sa.text("33030")))
    op.add_column("payroll_parameters", sa.Column("sgk_ceiling_monthly", sa.Numeric(12, 2), nullable=False, server_default=sa.text("297270")))
    op.add_column("payroll_parameters", sa.Column("stamp_tax_rate", sa.Numeric(7, 5), nullable=False, server_default=sa.text("0.00759")))
    op.add_column("payroll_parameters", sa.Column("minimum_wage_gross", sa.Numeric(12, 2), nullable=False, server_default=sa.text("33030")))
    op.add_column(
        "payroll_parameters",
        sa.Column(
            "income_tax_brackets",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text(f"'{DEFAULT_BRACKETS}'::jsonb"),
        ),
    )

    # payroll_items: yasal kesinti snapshot kolonlari
    op.add_column("payroll_items", sa.Column("compensation_basis", compensation_basis, nullable=False, server_default=sa.text("'GROSS'")))
    op.add_column("payroll_items", sa.Column("sgk_days", sa.Integer(), nullable=False, server_default=sa.text("30")))
    for col in (
        "sgk_base",
        "sgk_employee",
        "unemployment_employee",
        "income_tax_base",
        "income_tax_calculated",
        "income_tax_exemption",
        "income_tax_payable",
        "stamp_tax_calculated",
        "stamp_tax_exemption",
        "stamp_tax_payable",
        "net_total",
        "sgk_employer",
        "unemployment_employer",
        "employer_incentive",
        "employer_cost_total",
    ):
        op.add_column("payroll_items", sa.Column(col, sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")))
    op.add_column("payroll_items", sa.Column("cumulative_income_tax_base", sa.Numeric(14, 2), nullable=False, server_default=sa.text("0")))


def downgrade() -> None:
    for col in (
        "cumulative_income_tax_base",
        "employer_cost_total",
        "employer_incentive",
        "unemployment_employer",
        "sgk_employer",
        "net_total",
        "stamp_tax_payable",
        "stamp_tax_exemption",
        "stamp_tax_calculated",
        "income_tax_payable",
        "income_tax_exemption",
        "income_tax_calculated",
        "income_tax_base",
        "unemployment_employee",
        "sgk_employee",
        "sgk_base",
        "sgk_days",
        "compensation_basis",
    ):
        op.drop_column("payroll_items", col)

    for col in (
        "income_tax_brackets",
        "minimum_wage_gross",
        "stamp_tax_rate",
        "sgk_ceiling_monthly",
        "sgk_base_monthly",
        "apply_employer_incentive",
        "sgk_employer_incentive_rate",
        "unemployment_employer_rate",
        "sgk_employer_rate",
        "unemployment_employee_rate",
        "sgk_employee_rate",
    ):
        op.drop_column("payroll_parameters", col)

    op.drop_column("employee_compensations", "net_monthly")
    op.drop_column("employee_compensations", "basis")

    sa.Enum(name="compensation_basis").drop(op.get_bind(), checkfirst=True)
