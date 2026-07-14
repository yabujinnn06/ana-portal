"""assistant_daily_usage: gunluk token kullanimini kalici tut

Revision ID: 0062_assistant_daily_usage
Revises: 0061_assistant_config
Create Date: 2026-06-22 16:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0062_assistant_daily_usage"
down_revision = "0061_assistant_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_daily_usage",
        sa.Column("usage_date", sa.String(length=10), primary_key=True),
        sa.Column("model", sa.String(length=120), primary_key=True),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("assistant_daily_usage")
