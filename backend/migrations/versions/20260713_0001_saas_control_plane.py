"""SaaS control plane başlangıç şeması.

Revision ID: 20260713_0001
Revises: None
"""
from alembic import op

from app.models import Base


revision = "20260713_0001"
down_revision = None
branch_labels = None
depends_on = None

PLATFORM_TABLES = [
    "tenants", "platform_users", "saas_modules", "saas_plans", "tenant_memberships",
    "plan_modules", "tenant_subscriptions", "tenant_module_entitlements", "tenant_domains",
    "authentication_attempts", "security_audit_events",
]


def upgrade() -> None:
    bind = op.get_bind()
    for name in PLATFORM_TABLES:
        Base.metadata.tables[name].create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for name in reversed(PLATFORM_TABLES):
        Base.metadata.tables[name].drop(bind, checkfirst=True)
