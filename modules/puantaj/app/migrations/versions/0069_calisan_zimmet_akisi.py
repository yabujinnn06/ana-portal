"""depo zimmetlerini puantaj calisanlarina bagla ve hareket gecmisi ekle

Revision ID: 0069_calisan_zimmet_akisi
Revises: 0068_depo_zimmet_talepleri_geri_al
Create Date: 2026-07-12 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0069_calisan_zimmet_akisi"
down_revision = "0068_depo_zimmet_talepleri_geri_al"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("seriler", sa.Column("zimmet_employee_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_seriler_zimmet_employee_id_employees",
        "seriler",
        "employees",
        ["zimmet_employee_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_seri_zimmet_employee", "seriler", ["zimmet_employee_id"])

    op.create_table(
        "depo_zimmet_hareketleri",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("seri_id", sa.Integer(), nullable=False),
        sa.Column("islem", sa.String(length=20), nullable=False),
        sa.Column("onceki_employee_id", sa.Integer(), nullable=True),
        sa.Column("employee_id", sa.Integer(), nullable=True),
        sa.Column("employee_ad", sa.String(length=255), nullable=True),
        sa.Column("yapan_depo_user_id", sa.Integer(), nullable=True),
        sa.Column("zaman", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("notu", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["seri_id"], ["seriler.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["onceki_employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["yapan_depo_user_id"], ["depo_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_depo_zimmet_hareket_seri_zaman", "depo_zimmet_hareketleri", ["seri_id", "zaman"]
    )
    op.create_index(
        "ix_depo_zimmet_hareket_employee_zaman", "depo_zimmet_hareketleri", ["employee_id", "zaman"]
    )

    # Eski depo kullanicisi hedefli zimmetleri, yonetim ekraninda baglanmis calisana tasi.
    op.execute(
        """
        UPDATE seriler
        SET zimmet_employee_id = depo_users.employee_id
        FROM depo_users
        WHERE seriler.zimmet_kullanici_id = depo_users.id
          AND depo_users.employee_id IS NOT NULL
          AND seriler.zimmet_employee_id IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO depo_zimmet_hareketleri
            (seri_id, islem, employee_id, employee_ad, yapan_depo_user_id, zaman, notu)
        SELECT s.id, 'zimmet', e.id, e.full_name, s.zimmet_kullanici_id,
               COALESCE(s.zimmet_zaman, CURRENT_TIMESTAMP), s.zimmet_notu
        FROM seriler s
        JOIN employees e ON e.id = s.zimmet_employee_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_depo_zimmet_hareket_employee_zaman", table_name="depo_zimmet_hareketleri")
    op.drop_index("ix_depo_zimmet_hareket_seri_zaman", table_name="depo_zimmet_hareketleri")
    op.drop_table("depo_zimmet_hareketleri")
    op.drop_index("ix_seri_zimmet_employee", table_name="seriler")
    op.drop_constraint("fk_seriler_zimmet_employee_id_employees", "seriler", type_="foreignkey")
    op.drop_column("seriler", "zimmet_employee_id")
