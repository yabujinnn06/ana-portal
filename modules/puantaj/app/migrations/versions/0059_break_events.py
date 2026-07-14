"""attendance: break_events (calisan mola takibi, mesaiden bagimsiz)

Revision ID: 0059_break_events
Revises: 0058_logo_account_codes
Create Date: 2026-06-18 13:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0059_break_events"
down_revision = "0058_logo_account_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "break_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("over_limit_alerted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_id"], ["devices.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_break_events_employee_id", "break_events", ["employee_id"])
    op.create_index("ix_break_events_started_at", "break_events", ["started_at"])
    op.create_index("ix_break_event_employee_started", "break_events", ["employee_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_break_event_employee_started", table_name="break_events")
    op.drop_index("ix_break_events_started_at", table_name="break_events")
    op.drop_index("ix_break_events_employee_id", table_name="break_events")
    op.drop_table("break_events")
