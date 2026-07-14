"""assistant_config: UI'dan degistirilebilir AI asistan ayari

Revision ID: 0061_assistant_config
Revises: 0060_ot_threshold
Create Date: 2026-06-19 18:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0061_assistant_config"
down_revision = "0060_ot_threshold"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("base_url", sa.String(length=255), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=True),
        sa.Column("updated_by", sa.String(length=150), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("assistant_config")
