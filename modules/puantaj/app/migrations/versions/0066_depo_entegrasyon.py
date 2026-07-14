"""depo: depojin depo/sayim entegrasyonu

Revision ID: 0066_depo_entegrasyon
Revises: 0065_saturday_rotations
Create Date: 2026-07-11 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0066_depo_entegrasyon"
down_revision = "0065_saturday_rotations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column("depo_stok_izni", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.create_table(
        "depo_users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ad", sa.String(length=80), nullable=False),
        sa.Column("pin_hash", sa.String(length=200), nullable=False),
        sa.Column("rol", sa.String(length=20), server_default="sayan", nullable=False),
        sa.Column("aktif", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("olusturma", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_depo_user_aktif", "depo_users", ["aktif"])

    op.create_table(
        "depolar",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ad", sa.String(length=120), nullable=False),
        sa.Column("lokasyon", sa.String(length=80), nullable=True),
        sa.Column("aktif", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("olusturma", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("olusturan_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["olusturan_id"], ["depo_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_depo_depolar_aktif", "depolar", ["aktif"])

    op.create_table(
        "depo_stoklari",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("depo_id", sa.Integer(), nullable=False),
        sa.Column("stok_kodu", sa.String(length=80), nullable=False),
        sa.Column("urun_adi", sa.String(length=200), nullable=False),
        sa.Column("miktar", sa.Integer(), server_default="0", nullable=False),
        sa.Column("guncelleme", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["depo_id"], ["depolar.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("depo_id", "stok_kodu", name="uq_depostok_depo_kod"),
    )
    op.create_index("ix_depostok_depo", "depo_stoklari", ["depo_id"])

    op.create_table(
        "sayim_oturumlari",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ad", sa.String(length=120), nullable=False),
        sa.Column("lokasyon", sa.String(length=80), nullable=True),
        sa.Column("durum", sa.String(length=20), server_default="aktif", nullable=False),
        sa.Column("mod", sa.String(length=20), server_default="seri", nullable=False),
        sa.Column("baslangic", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("bitis", sa.DateTime(timezone=True), nullable=True),
        sa.Column("olusturan_id", sa.Integer(), nullable=True),
        sa.Column("depo_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["olusturan_id"], ["depo_users.id"]),
        sa.ForeignKeyConstraint(["depo_id"], ["depolar.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "stoklar",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("oturum_id", sa.Integer(), nullable=False),
        sa.Column("stok_kodu", sa.String(length=80), nullable=False),
        sa.Column("urun_adi", sa.String(length=200), nullable=False),
        sa.Column("portal_sayim", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sonradan_eklendi", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("olusturma", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["oturum_id"], ["sayim_oturumlari.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("oturum_id", "stok_kodu", name="uq_stok_oturum_kod"),
    )
    op.create_index("ix_stok_oturum", "stoklar", ["oturum_id"])

    op.create_table(
        "seriler",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("oturum_id", sa.Integer(), nullable=False),
        sa.Column("stok_id", sa.Integer(), nullable=False),
        sa.Column("depo_id", sa.Integer(), nullable=True),
        sa.Column("seri_no", sa.String(length=120), nullable=False),
        sa.Column("seri_no_norm", sa.String(length=120), nullable=False),
        sa.Column("sayildi", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("sayim_tarihi", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sayan_id", sa.Integer(), nullable=True),
        sa.Column("notlar", sa.Text(), nullable=True),
        sa.Column("sonradan_eklendi", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("cikis_zaman", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cikis_kullanici_id", sa.Integer(), nullable=True),
        sa.Column("cikis_notu", sa.Text(), nullable=True),
        sa.Column("zimmet_kullanici_id", sa.Integer(), nullable=True),
        sa.Column("zimmet_zaman", sa.DateTime(timezone=True), nullable=True),
        sa.Column("zimmet_notu", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["oturum_id"], ["sayim_oturumlari.id"]),
        sa.ForeignKeyConstraint(["stok_id"], ["stoklar.id"]),
        sa.ForeignKeyConstraint(["depo_id"], ["depolar.id"]),
        sa.ForeignKeyConstraint(["sayan_id"], ["depo_users.id"]),
        sa.ForeignKeyConstraint(["cikis_kullanici_id"], ["depo_users.id"]),
        sa.ForeignKeyConstraint(["zimmet_kullanici_id"], ["depo_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("oturum_id", "stok_id", "seri_no", name="uq_seri_oturum_stok_no"),
        sa.UniqueConstraint("depo_id", "seri_no_norm", name="uq_seri_depo_norm"),
    )
    op.create_index("ix_seri_oturum_norm", "seriler", ["oturum_id", "seri_no_norm"])
    op.create_index("ix_seri_depo_norm", "seriler", ["depo_id", "seri_no_norm"])
    op.create_index("ix_seri_sayan", "seriler", ["sayan_id"])
    op.create_index("ix_seri_zimmet_kullanici", "seriler", ["zimmet_kullanici_id"])
    op.create_index("ix_seri_stok", "seriler", ["stok_id"])

    op.create_table(
        "tarama_loglari",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("oturum_id", sa.Integer(), nullable=False),
        sa.Column("zaman", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("kullanici_id", sa.Integer(), nullable=True),
        sa.Column("seri_giris", sa.String(length=160), nullable=False),
        sa.Column("durum", sa.String(length=20), nullable=False),
        sa.Column("stok_kodu", sa.String(length=80), nullable=True),
        sa.Column("urun_adi", sa.String(length=200), nullable=True),
        sa.Column("aciklama", sa.Text(), nullable=True),
        sa.Column("client_scan_id", sa.String(length=80), nullable=True),
        sa.Column("istek_json", sa.JSON(), nullable=True),
        sa.Column("sonuc_json", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["oturum_id"], ["sayim_oturumlari.id"]),
        sa.ForeignKeyConstraint(["kullanici_id"], ["depo_users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "oturum_id", "kullanici_id", "client_scan_id", name="uq_log_oturum_user_client_scan"
        ),
    )
    op.create_index("ix_log_oturum_zaman", "tarama_loglari", ["oturum_id", "zaman"])

    op.create_table(
        "depo_audit_loglari",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("zaman", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("kullanici_id", sa.Integer(), nullable=True),
        sa.Column("kullanici_ad", sa.String(length=80), nullable=True),
        sa.Column("eylem", sa.String(length=60), nullable=False),
        sa.Column("kaynak_tip", sa.String(length=40), nullable=True),
        sa.Column("kaynak_id", sa.String(length=40), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("detay", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["kullanici_id"], ["depo_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_depo_audit_zaman", "depo_audit_loglari", ["zaman"])
    op.create_index("ix_depo_audit_kullanici", "depo_audit_loglari", ["kullanici_id"])
    op.create_index("ix_depo_audit_kaynak", "depo_audit_loglari", ["kaynak_tip", "kaynak_id"])

    op.create_table(
        "depo_login_denemeleri",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ad", sa.String(length=80), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("basarili", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("zaman", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_depo_login_ad_zaman", "depo_login_denemeleri", ["ad", "zaman"])


def downgrade() -> None:
    op.drop_index("ix_depo_login_ad_zaman", table_name="depo_login_denemeleri")
    op.drop_table("depo_login_denemeleri")

    op.drop_index("ix_depo_audit_kaynak", table_name="depo_audit_loglari")
    op.drop_index("ix_depo_audit_kullanici", table_name="depo_audit_loglari")
    op.drop_index("ix_depo_audit_zaman", table_name="depo_audit_loglari")
    op.drop_table("depo_audit_loglari")

    op.drop_index("ix_log_oturum_zaman", table_name="tarama_loglari")
    op.drop_table("tarama_loglari")

    op.drop_index("ix_seri_stok", table_name="seriler")
    op.drop_index("ix_seri_zimmet_kullanici", table_name="seriler")
    op.drop_index("ix_seri_sayan", table_name="seriler")
    op.drop_index("ix_seri_depo_norm", table_name="seriler")
    op.drop_index("ix_seri_oturum_norm", table_name="seriler")
    op.drop_table("seriler")

    op.drop_index("ix_stok_oturum", table_name="stoklar")
    op.drop_table("stoklar")

    op.drop_table("sayim_oturumlari")

    op.drop_index("ix_depostok_depo", table_name="depo_stoklari")
    op.drop_table("depo_stoklari")

    op.drop_index("ix_depo_depolar_aktif", table_name="depolar")
    op.drop_table("depolar")

    op.drop_index("ix_depo_user_aktif", table_name="depo_users")
    op.drop_table("depo_users")

    op.drop_column("employees", "depo_stok_izni")
