"""payroll: emekli (SGDP) status, eksik gun, employee payroll profile, company settings

Revision ID: 0051_payroll_emekli_eksikgun
Revises: 0050_payroll_legal_params
Create Date: 2026-06-14 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0051_payroll_emekli_eksikgun"
down_revision = "0050_payroll_legal_params"
branch_labels = None
depends_on = None


def upgrade() -> None:
    sgk_status = postgresql.ENUM("NORMAL", "EMEKLI", name="sgk_status", create_type=False)
    sgk_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "employee_payroll_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("employees.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
            index=True,
        ),
        sa.Column("sgk_status", sgk_status, nullable=False, server_default=sa.text("'NORMAL'")),
        sa.Column("tc_kimlik_no", sa.String(11), nullable=True),
        sa.Column("sgk_sicil_no", sa.String(40), nullable=True),
        sa.Column("ise_giris_tarihi", sa.Date(), nullable=True),
        sa.Column("cinsiyet", sa.String(10), nullable=True),
        sa.Column("meslek_grubu", sa.String(100), nullable=True),
        sa.Column("kanun_no", sa.String(10), nullable=True),
        sa.Column("banka_adi", sa.String(100), nullable=True),
        sa.Column("sube", sa.String(100), nullable=True),
        sa.Column("hesap_no", sa.String(40), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.create_table(
        "company_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("firma_unvan", sa.String(255), nullable=True),
        sa.Column("merkez_adres", sa.String(500), nullable=True),
        sa.Column("sube_adres", sa.String(500), nullable=True),
        sa.Column("vergi_dairesi", sa.String(150), nullable=True),
        sa.Column("vergi_no", sa.String(20), nullable=True),
        sa.Column("ticaret_sicil_no", sa.String(40), nullable=True),
        sa.Column("mersis_no", sa.String(40), nullable=True),
        sa.Column("sgk_isyeri_no", sa.String(40), nullable=True),
        sa.Column("internet_adresi", sa.String(150), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.add_column("payroll_parameters", sa.Column("sgdp_employee_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.075")))
    op.add_column("payroll_parameters", sa.Column("sgdp_employer_rate", sa.Numeric(6, 4), nullable=False, server_default=sa.text("0.225")))

    op.add_column("payroll_items", sa.Column("sgk_status", sgk_status, nullable=False, server_default=sa.text("'NORMAL'")))
    op.add_column("payroll_items", sa.Column("kanun_no", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("payroll_items", "kanun_no")
    op.drop_column("payroll_items", "sgk_status")
    op.drop_column("payroll_parameters", "sgdp_employer_rate")
    op.drop_column("payroll_parameters", "sgdp_employee_rate")
    op.drop_table("company_settings")
    op.drop_table("employee_payroll_profiles")
    sa.Enum(name="sgk_status").drop(op.get_bind(), checkfirst=True)
