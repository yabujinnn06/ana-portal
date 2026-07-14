"""payroll: kidem tazminati tavani parametresi

Revision ID: 0055_payroll_severance
Revises: 0054_payroll_phase2
Create Date: 2026-06-15 16:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0055_payroll_severance"
down_revision = "0054_payroll_phase2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payroll_parameters",
        sa.Column("severance_ceiling_gross", sa.Numeric(12, 2), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("payroll_parameters", "severance_ceiling_gross")
