"""payroll: manual components (ek odeme/kesinti) + item snapshot columns

Revision ID: 0053_payroll_components
Revises: 0052_payroll_part_time
Create Date: 2026-06-15 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PGEnum, JSONB


revision = "0053_payroll_components"
down_revision = "0052_payroll_part_time"
branch_labels = None
depends_on = None


def _json_type() -> sa.types.TypeEngine:
    return JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    # create_type=False: tipi manuel (checkfirst ile) olustur, create_table tekrar CREATE TYPE etmesin.
    kind_enum = PGEnum("EARNING", "DEDUCTION", name="payroll_component_kind", create_type=False)
    kind_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "payroll_components",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("kind", kind_enum, nullable=False),
        sa.Column("code", sa.String(length=40), nullable=True),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("sgk_exempt", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("income_tax_exempt", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("stamp_tax_exempt", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("note", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_payroll_components_employee_id", "payroll_components", ["employee_id"])
    op.create_index(
        "ix_payroll_component_period", "payroll_components", ["employee_id", "year", "month"]
    )

    op.add_column(
        "payroll_items",
        sa.Column("additional_earnings", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "payroll_items",
        sa.Column("additional_deductions", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "payroll_items",
        sa.Column("components", _json_type(), nullable=False, server_default=sa.text("'[]'")),
    )


def downgrade() -> None:
    op.drop_column("payroll_items", "components")
    op.drop_column("payroll_items", "additional_deductions")
    op.drop_column("payroll_items", "additional_earnings")
    op.drop_index("ix_payroll_component_period", table_name="payroll_components")
    op.drop_index("ix_payroll_components_employee_id", table_name="payroll_components")
    op.drop_table("payroll_components")
    sa.Enum(name="payroll_component_kind").drop(op.get_bind(), checkfirst=True)
