"""admin: last_seen_at + last_login_at (kalici online/aktivite takibi)

Revision ID: 0057_admin_last_seen
Revises: 0056_payroll_personnel
Create Date: 2026-06-17 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0057_admin_last_seen"
down_revision = "0056_payroll_personnel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("admin_users", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("admin_users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("admin_users", "last_login_at")
    op.drop_column("admin_users", "last_seen_at")
