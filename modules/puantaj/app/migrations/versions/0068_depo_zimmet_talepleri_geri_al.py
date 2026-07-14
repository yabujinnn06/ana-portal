"""depo: zimmet iade/devir talep ozelligini geri al

Employee portalda ayrica bir mini-UI (seri arama, stok detay, zimmet talebi) yerine
mevcut Rainwater-Sayim uygulamasina (/depo) dogrudan yonlendiren tek dugme kullanilmasina
karar verildi; bu tablo hicbir zaman gercek veri almadan kullanim disi kaldi.

Revision ID: 0068_depo_zimmet_talepleri_geri_al
Revises: 0067_depo_zimmet_talepleri
Create Date: 2026-07-12 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0068_depo_zimmet_talepleri_geri_al"
down_revision = "0067_depo_zimmet_talepleri"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_zimmet_talep_durum", table_name="depo_zimmet_talepleri")
    op.drop_index("ix_zimmet_talep_calisan", table_name="depo_zimmet_talepleri")
    op.drop_index("ix_zimmet_talep_seri", table_name="depo_zimmet_talepleri")
    op.drop_table("depo_zimmet_talepleri")


def downgrade() -> None:
    op.create_table(
        "depo_zimmet_talepleri",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("seri_id", sa.Integer(), nullable=False),
        sa.Column("calisan_id", sa.Integer(), nullable=False),
        sa.Column("tip", sa.String(length=10), nullable=False),
        sa.Column("hedef_calisan_id", sa.Integer(), nullable=True),
        sa.Column("durum", sa.String(length=20), server_default="beklemede", nullable=False),
        sa.Column("not_metni", sa.Text(), nullable=True),
        sa.Column("olusturma", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("karar_zaman", sa.DateTime(timezone=True), nullable=True),
        sa.Column("karar_admin_id", sa.Integer(), nullable=True),
        sa.Column("karar_notu", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["seri_id"], ["seriler.id"]),
        sa.ForeignKeyConstraint(["calisan_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["hedef_calisan_id"], ["employees.id"]),
        sa.ForeignKeyConstraint(["karar_admin_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_zimmet_talep_seri", "depo_zimmet_talepleri", ["seri_id"])
    op.create_index("ix_zimmet_talep_calisan", "depo_zimmet_talepleri", ["calisan_id"])
    op.create_index("ix_zimmet_talep_durum", "depo_zimmet_talepleri", ["durum"])
