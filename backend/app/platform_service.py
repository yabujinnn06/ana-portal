from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import Settings
from .models import (
    AuthenticationAttempt,
    PlanModule,
    PlatformUser,
    SaaSModule,
    SaaSPlan,
    SecurityAuditEvent,
    Tenant,
    TenantDomain,
    TenantMembership,
    TenantModuleEntitlement,
    TenantModuleDeployment,
    TenantSubscription,
    utcnow,
)
from .security import hash_password


MODULE_CATALOG = [
    {"code": "platform", "name": "Ana Portal", "description": "Kimlik, şirket, güvenlik ve uygulama merkezi.", "category": "Çekirdek", "monthly_price": 0, "core": True, "sort_order": 0},
    {"code": "attendance", "name": "Puantaj MVP", "description": "İnsan kaynakları, özlük, izin, puantaj, vardiya ve bordro tek uygulamada.", "category": "İK ve Operasyon", "monthly_price": 1290, "sort_order": 10},
    {"code": "offers", "name": "Rain Teklif", "description": "Gerçek Rain Teklif uygulaması, fiyatlandırma, teklif üretimi ve onay süreçleri.", "category": "Satış", "monthly_price": 1190, "sort_order": 20},
    {"code": "warehouse", "name": "Depo ve Stok", "description": "Çoklu depo, seri/lot ve transfer yönetimi.", "category": "Operasyon", "monthly_price": 1790, "sort_order": 30},
    {"code": "fleet", "name": "Filo Yönetimi", "description": "Araç, bakım, görev ve maliyet takibi.", "category": "Operasyon", "monthly_price": 1290, "sort_order": 40},
    {"code": "analytics", "name": "Gelişmiş Analitik", "description": "Birleşik göstergeler, raporlar ve dışa aktarımlar.", "category": "Yönetim", "monthly_price": 990, "sort_order": 50},
    {"code": "api_access", "name": "API ve Entegrasyon", "description": "ERP, muhasebe ve kurumsal sistem entegrasyonları.", "category": "Platform", "monthly_price": 790, "sort_order": 60},
]

PLAN_CATALOG = [
    {"code": "START", "name": "Başlangıç", "description": "Küçük ekipler için güvenli şirket portalı.", "monthly_base_price": 990, "included_users": 10, "modules": ["platform"]},
    {"code": "GROWTH", "name": "Büyüme", "description": "Operasyonlarını tek merkezden yöneten şirketler için.", "monthly_base_price": 2490, "included_users": 50, "modules": ["platform", "attendance", "analytics"]},
    {"code": "ENTERPRISE", "name": "Kurumsal", "description": "Özel alan adı, self-host ve geniş entegrasyon ihtiyaçları için.", "monthly_base_price": 5990, "included_users": 250, "modules": [item["code"] for item in MODULE_CATALOG]},
]


def seed_platform_catalog(db: Session) -> None:
    deprecated_modules = db.scalars(select(SaaSModule).where(SaaSModule.code.in_({"hr", "payroll"}))).all()
    for deprecated_module in deprecated_modules:
        deprecated_module.active = False
    modules: dict[str, SaaSModule] = {}
    for item in MODULE_CATALOG:
        module = db.scalar(select(SaaSModule).where(SaaSModule.code == item["code"]))
        if not module:
            module = SaaSModule(**item)
            db.add(module)
            db.flush()
        else:
            for field in ("name", "description", "category", "monthly_price", "core", "sort_order"):
                setattr(module, field, item.get(field, False if field == "core" else getattr(module, field)))
        modules[module.code] = module

    for item in PLAN_CATALOG:
        plan = db.scalar(select(SaaSPlan).where(SaaSPlan.code == item["code"]))
        if not plan:
            plan = SaaSPlan(**{key: value for key, value in item.items() if key != "modules"})
            db.add(plan)
            db.flush()
        desired = {modules[code].id for code in item["modules"]}
        db.execute(delete(PlanModule).where(PlanModule.plan_id == plan.id, PlanModule.module_id.not_in(desired)))
        existing = set(db.scalars(select(PlanModule.module_id).where(PlanModule.plan_id == plan.id)).all())
        for code in item["modules"]:
            if modules[code].id not in existing:
                db.add(PlanModule(plan_id=plan.id, module_id=modules[code].id))
    db.commit()


def bootstrap_platform(db: Session, settings: Settings) -> None:
    for existing_tenant_id in db.scalars(select(Tenant.id)).all():
        ensure_module_deployments(db, existing_tenant_id, settings)
    if not all((settings.bootstrap_tenant_slug, settings.bootstrap_tenant_name, settings.bootstrap_admin_email, settings.bootstrap_admin_password)):
        db.commit()
        return
    tenant = db.scalar(select(Tenant).where(Tenant.slug == settings.bootstrap_tenant_slug.lower()))
    if tenant:
        ensure_module_deployments(db, tenant.id, settings)
        db.commit()
        return
    tenant = Tenant(
        slug=settings.bootstrap_tenant_slug.lower(),
        name=settings.bootstrap_tenant_name,
        billing_email=settings.bootstrap_admin_email.lower(),
    )
    user = db.scalar(select(PlatformUser).where(PlatformUser.email == settings.bootstrap_admin_email.lower()))
    if not user:
        user = PlatformUser(
            email=settings.bootstrap_admin_email.lower(),
            full_name="Şirket Yöneticisi",
            password_hash=hash_password(settings.bootstrap_admin_password),
        )
        db.add(user)
    db.add(tenant)
    db.flush()
    db.add(TenantMembership(tenant_id=tenant.id, user_id=user.id, role="OWNER", permissions=["*"]))
    plan = db.scalar(select(SaaSPlan).where(SaaSPlan.code == "GROWTH"))
    if plan:
        db.add(TenantSubscription(tenant_id=tenant.id, plan_id=plan.id, trial_ends_at=utcnow() + timedelta(days=14)))
    ensure_module_deployments(db, tenant.id, settings)
    db.commit()


def ensure_module_deployment(
    db: Session,
    tenant_id: str,
    *,
    module_code: str,
    public_url: str,
    internal_url: str = "",
) -> None:
    if not public_url:
        return
    module = db.scalar(select(SaaSModule).where(SaaSModule.code == module_code))
    if not module:
        return
    deployment = db.scalar(select(TenantModuleDeployment).where(
        TenantModuleDeployment.tenant_id == tenant_id,
        TenantModuleDeployment.module_id == module.id,
    ))
    if deployment:
        deployment.public_url = public_url.rstrip("/")
        deployment.internal_url = internal_url.rstrip("/") if internal_url else None
        deployment.status = "ACTIVE"
        return
    db.add(TenantModuleDeployment(
        tenant_id=tenant_id,
        module_id=module.id,
        deployment_mode="DEDICATED",
        public_url=public_url.rstrip("/"),
        internal_url=internal_url.rstrip("/") if internal_url else None,
        status="ACTIVE",
    ))


def ensure_module_deployments(db: Session, tenant_id: str, settings: Settings) -> None:
    ensure_module_deployment(
        db,
        tenant_id,
        module_code="attendance",
        public_url=settings.puantaj_public_url,
        internal_url=settings.puantaj_internal_url,
    )
    ensure_module_deployment(
        db,
        tenant_id,
        module_code="offers",
        public_url=settings.rainteklif_public_url,
        internal_url=settings.rainteklif_internal_url,
    )


def ensure_puantaj_deployment(db: Session, tenant_id: str, settings: Settings) -> None:
    """Backward-compatible helper retained for existing callers."""
    ensure_module_deployment(
        db,
        tenant_id,
        module_code="attendance",
        public_url=settings.puantaj_public_url,
        internal_url=settings.puantaj_internal_url,
    )


def plan_payload(db: Session, plan: SaaSPlan) -> dict[str, Any]:
    codes = db.scalars(
        select(SaaSModule.code)
        .join(PlanModule, PlanModule.module_id == SaaSModule.id)
        .where(PlanModule.plan_id == plan.id)
        .order_by(SaaSModule.sort_order)
    ).all()
    return {
        "code": plan.code,
        "name": plan.name,
        "description": plan.description,
        "monthly_base_price": plan.monthly_base_price,
        "currency": plan.currency,
        "included_users": plan.included_users,
        "modules": list(codes),
    }


def module_payload(module: SaaSModule, enabled: bool, source: str) -> dict[str, Any]:
    return {
        "code": module.code,
        "name": module.name,
        "description": module.description,
        "category": module.category,
        "monthly_price": module.monthly_price,
        "currency": module.currency,
        "core": module.core,
        "enabled": enabled,
        "source": source,
    }


def effective_modules(db: Session, tenant_id: str) -> list[dict[str, Any]]:
    modules = db.scalars(select(SaaSModule).where(SaaSModule.active.is_(True)).order_by(SaaSModule.sort_order)).all()
    subscription = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    included_ids: set[str] = set()
    if subscription:
        included_ids = set(db.scalars(select(PlanModule.module_id).where(PlanModule.plan_id == subscription.plan_id)).all())
    entitlements = {
        item.module_id: item
        for item in db.scalars(select(TenantModuleEntitlement).where(TenantModuleEntitlement.tenant_id == tenant_id)).all()
    }
    result = []
    for module in modules:
        entitlement = entitlements.get(module.id)
        if entitlement:
            enabled, source = entitlement.enabled, entitlement.source
        elif module.core or module.id in included_ids:
            enabled, source = True, "PLAN"
        else:
            enabled, source = False, "CATALOG"
        result.append(module_payload(module, enabled, source))
    return result


def tenant_monthly_total(db: Session, tenant_id: str) -> Decimal:
    subscription = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id))
    total = Decimal(subscription and db.get(SaaSPlan, subscription.plan_id).monthly_base_price or 0)
    included_ids = set(db.scalars(select(PlanModule.module_id).where(PlanModule.plan_id == subscription.plan_id)).all()) if subscription else set()
    overrides = db.scalars(
        select(TenantModuleEntitlement).where(TenantModuleEntitlement.tenant_id == tenant_id, TenantModuleEntitlement.enabled.is_(True))
    ).all()
    for item in overrides:
        if item.module_id not in included_ids:
            module = db.get(SaaSModule, item.module_id)
            if module and module.active:
                total += item.monthly_price_override if item.monthly_price_override is not None else module.monthly_price
    return total


def failed_login_count(db: Session, tenant_slug: str, email: str, ip_address: str, window_minutes: int) -> int:
    since = utcnow() - timedelta(minutes=window_minutes)
    return int(db.scalar(select(func.count(AuthenticationAttempt.id)).where(
        AuthenticationAttempt.tenant_slug == tenant_slug,
        AuthenticationAttempt.email == email,
        AuthenticationAttempt.ip_address == ip_address,
        AuthenticationAttempt.success.is_(False),
        AuthenticationAttempt.created_at >= since,
    )) or 0)


def log_security_event(
    db: Session,
    action: str,
    *,
    tenant_id: str | None = None,
    user_id: str | None = None,
    request_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    resource: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    db.add(SecurityAuditEvent(
        action=action,
        tenant_id=tenant_id,
        user_id=user_id,
        request_id=request_id,
        ip_address=ip_address,
        user_agent=user_agent,
        resource=resource,
        payload=payload or {},
    ))


def domain_count(db: Session, tenant_id: str) -> int:
    return int(db.scalar(select(func.count(TenantDomain.id)).where(TenantDomain.tenant_id == tenant_id, TenantDomain.status == "VERIFIED")) or 0)


def membership_count(db: Session, tenant_id: str) -> int:
    return int(db.scalar(select(func.count(TenantMembership.id)).where(TenantMembership.tenant_id == tenant_id, TenantMembership.active.is_(True))) or 0)
