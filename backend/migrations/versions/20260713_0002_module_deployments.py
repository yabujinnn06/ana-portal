"""Şirket modül kurulumları ve tek kullanımlık SSO biletleri.

Revision ID: 20260713_0002
Revises: 20260713_0001
"""
from alembic import op

from app.models import Base


revision = "20260713_0002"
down_revision = "20260713_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.tables["tenant_module_deployments"].create(bind, checkfirst=True)
    Base.metadata.tables["module_launch_tickets"].create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.tables["module_launch_tickets"].drop(bind, checkfirst=True)
    Base.metadata.tables["tenant_module_deployments"].drop(bind, checkfirst=True)
