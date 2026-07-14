"""work_rule: opsiyonel gunluk net mesai hedefi (FM esigi)

Revision ID: 0060_ot_threshold
Revises: 0059_break_events
Create Date: 2026-06-19 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0060_ot_threshold"
down_revision = "0059_break_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "work_rules",
        sa.Column("overtime_threshold_minutes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "department_schedule_plans",
        sa.Column("overtime_threshold_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("department_schedule_plans", "overtime_threshold_minutes")
    op.drop_column("work_rules", "overtime_threshold_minutes")
