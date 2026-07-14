"""payroll: Logo muhasebe mahsup fisi hesap kodlari (company_settings)

Revision ID: 0058_logo_account_codes
Revises: 0057_admin_last_seen
Create Date: 2026-06-18 10:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0058_logo_account_codes"
down_revision = "0057_admin_last_seen"
branch_labels = None
depends_on = None

_COLUMNS = (
    "logo_hesap_ucret",
    "logo_hesap_sgk_isveren",
    "logo_hesap_net_odenecek",
    "logo_hesap_odenecek_vergi",
    "logo_hesap_odenecek_sgk",
    "logo_hesap_personel_kesinti",
)


def upgrade() -> None:
    for name in _COLUMNS:
        op.add_column("company_settings", sa.Column(name, sa.String(length=40), nullable=True))


def downgrade() -> None:
    for name in reversed(_COLUMNS):
        op.drop_column("company_settings", name)
