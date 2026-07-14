"""half day leave + configurable half-day overtime start

Revision ID: 0048_half_day_support
Revises: 0047_manual_override_status
Create Date: 2026-06-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0048_half_day_support"
down_revision = "0047_manual_override_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "special_days",
        sa.Column("half_day_overtime_start", sa.Time(), nullable=True),
    )
    op.add_column(
        "leaves",
        sa.Column(
            "half_day",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("leaves", "half_day")
    op.drop_column("special_days", "half_day_overtime_start")
