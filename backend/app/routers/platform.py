import hashlib
import secrets
from datetime import timedelta

import dns.resolver
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import Settings, get_settings
from ..models import ModuleLaunchTicket, SaaSModule, SaaSPlan, TenantDomain, TenantModuleDeployment, TenantModuleEntitlement, TenantSubscription, utcnow
from ..platform_schemas import CatalogOut, DomainCreateIn, DomainOut, ModuleLaunchOut, ModuleOut, ModuleToggleIn, OverviewOut, PlanChangeIn, PlanOut, TenantOut
from ..platform_service import (
    domain_count,
    effective_modules,
    log_security_event,
    membership_count,
    module_payload,
    plan_payload,
    tenant_monthly_total,
)
from ..tenant_context import TenantContext, get_tenant_context


router = APIRouter(prefix="/platform", tags=["SaaS platformu"])


def ensure_admin(ctx: TenantContext) -> None:
    if not ctx.principal.user.platform_admin and ctx.principal.membership.role not in {"OWNER", "ADMIN"}:
        raise HTTPException(status_code=403, detail="Bu işlem için şirket yöneticisi olmalısınız")


@router.get("/catalog", response_model=CatalogOut)
def catalog(db: Session = Depends(get_db)):
    modules = db.scalars(select(SaaSModule).where(SaaSModule.active.is_(True)).order_by(SaaSModule.sort_order)).all()
    plans = db.scalars(select(SaaSPlan).where(SaaSPlan.active.is_(True)).order_by(SaaSPlan.monthly_base_price)).all()
    return CatalogOut(
        modules=[ModuleOut(**module_payload(module, module.core, "CORE" if module.core else "CATALOG")) for module in modules],
        plans=[PlanOut(**plan_payload(db, plan)) for plan in plans],
    )


@router.get("/overview", response_model=OverviewOut)
def overview(ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    tenant = ctx.principal.tenant
    subscription = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == tenant.id))
    plan = db.get(SaaSPlan, subscription.plan_id) if subscription else None
    domains = domain_count(db, tenant.id)
    score = 72 + (10 if domains else 0) + (8 if ctx.principal.membership.role == "OWNER" else 0)
    return OverviewOut(
        tenant=TenantOut(id=tenant.id, slug=tenant.slug, name=tenant.name, status=tenant.status),
        plan=PlanOut(**plan_payload(db, plan)) if plan else None,
        modules=[ModuleOut(**item) for item in effective_modules(db, tenant.id)],
        monthly_total=tenant_monthly_total(db, tenant.id),
        users_count=membership_count(db, tenant.id),
        verified_domains=domains,
        security_score=min(score, 100),
    )


@router.get("/modules", response_model=list[ModuleOut])
def modules(ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    return [ModuleOut(**item) for item in effective_modules(db, ctx.principal.tenant.id)]


@router.post("/modules/{module_code}/launch", response_model=ModuleLaunchOut)
def launch_module(
    module_code: str,
    request: Request,
    ctx: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    ensure_admin(ctx)
    module = db.scalar(select(SaaSModule).where(SaaSModule.code == module_code, SaaSModule.active.is_(True)))
    if not module:
        raise HTTPException(status_code=404, detail="Modül bulunamadı")
    effective = next((item for item in effective_modules(db, ctx.principal.tenant.id) if item["code"] == module_code), None)
    if not effective or not effective["enabled"]:
        raise HTTPException(status_code=403, detail="Bu modül şirket paketinizde açık değil")
    deployment = db.scalar(select(TenantModuleDeployment).where(
        TenantModuleDeployment.tenant_id == ctx.principal.tenant.id,
        TenantModuleDeployment.module_id == module.id,
        TenantModuleDeployment.status == "ACTIVE",
    ))
    if not deployment:
        raise HTTPException(status_code=409, detail="Modül kurulumu henüz hazır değil")
    ticket = secrets.token_urlsafe(48)
    db.add(ModuleLaunchTicket(
        tenant_id=ctx.principal.tenant.id,
        user_id=ctx.principal.user.id,
        module_id=module.id,
        ticket_hash=hashlib.sha256(ticket.encode()).hexdigest(),
        expires_at=utcnow() + timedelta(seconds=settings.module_launch_ticket_seconds),
    ))
    log_security_event(
        db,
        "MODULE_LAUNCH_TICKET_CREATED",
        tenant_id=ctx.principal.tenant.id,
        user_id=ctx.principal.user.id,
        request_id=getattr(request.state, "request_id", None),
        resource=module.code,
    )
    db.commit()
    launch_url = f"{deployment.public_url.rstrip('/')}/api/portal-sso/consume"
    return ModuleLaunchOut(launch_url=launch_url, ticket=ticket, expires_in=settings.module_launch_ticket_seconds, module_code=module.code)


@router.patch("/subscription", response_model=PlanOut)
def change_subscription(payload: PlanChangeIn, request: Request, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    ensure_admin(ctx)
    plan = db.scalar(select(SaaSPlan).where(SaaSPlan.code == payload.plan_code, SaaSPlan.active.is_(True)))
    if not plan:
        raise HTTPException(status_code=404, detail="Paket bulunamadı")
    subscription = db.scalar(select(TenantSubscription).where(TenantSubscription.tenant_id == ctx.principal.tenant.id))
    if subscription:
        subscription.plan_id = plan.id
        subscription.status = "ACTIVE"
    else:
        subscription = TenantSubscription(tenant_id=ctx.principal.tenant.id, plan_id=plan.id, status="ACTIVE")
        db.add(subscription)
    log_security_event(
        db,
        "SUBSCRIPTION_PLAN_CHANGED",
        tenant_id=ctx.principal.tenant.id,
        user_id=ctx.principal.user.id,
        request_id=getattr(request.state, "request_id", None),
        resource=plan.code,
    )
    db.commit()
    return PlanOut(**plan_payload(db, plan))


@router.patch("/modules/{module_code}", response_model=ModuleOut)
def toggle_module(module_code: str, payload: ModuleToggleIn, request: Request, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    ensure_admin(ctx)
    module = db.scalar(select(SaaSModule).where(SaaSModule.code == module_code, SaaSModule.active.is_(True)))
    if not module:
        raise HTTPException(status_code=404, detail="Modül bulunamadı")
    if module.core and not payload.enabled:
        raise HTTPException(status_code=409, detail="Ana Portal çekirdek modülü kapatılamaz")
    entitlement = db.scalar(select(TenantModuleEntitlement).where(
        TenantModuleEntitlement.tenant_id == ctx.principal.tenant.id,
        TenantModuleEntitlement.module_id == module.id,
    ))
    if entitlement:
        entitlement.enabled = payload.enabled
    else:
        entitlement = TenantModuleEntitlement(tenant_id=ctx.principal.tenant.id, module_id=module.id, enabled=payload.enabled, source="ADMIN")
        db.add(entitlement)
    log_security_event(
        db,
        "MODULE_ENTITLEMENT_CHANGED",
        tenant_id=ctx.principal.tenant.id,
        user_id=ctx.principal.user.id,
        request_id=getattr(request.state, "request_id", None),
        resource=module.code,
        payload={"enabled": payload.enabled},
    )
    db.commit()
    return ModuleOut(**module_payload(module, payload.enabled, "ADMIN"))


@router.get("/domains", response_model=list[DomainOut])
def list_domains(ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    items = db.scalars(select(TenantDomain).where(TenantDomain.tenant_id == ctx.principal.tenant.id).order_by(TenantDomain.created_at.desc())).all()
    return [DomainOut(id=item.id, hostname=item.hostname, status=item.status, verified_at=item.verified_at) for item in items]


@router.post("/domains", response_model=DomainOut, status_code=201)
def add_domain(payload: DomainCreateIn, request: Request, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    ensure_admin(ctx)
    if db.scalar(select(TenantDomain).where(TenantDomain.hostname == payload.hostname)):
        raise HTTPException(status_code=409, detail="Bu alan adı zaten kayıtlı")
    token = secrets.token_urlsafe(32)
    item = TenantDomain(
        tenant_id=ctx.principal.tenant.id,
        hostname=payload.hostname,
        verification_token_hash=hashlib.sha256(token.encode()).hexdigest(),
    )
    db.add(item)
    log_security_event(
        db,
        "CUSTOM_DOMAIN_CREATED",
        tenant_id=ctx.principal.tenant.id,
        user_id=ctx.principal.user.id,
        request_id=getattr(request.state, "request_id", None),
        resource=payload.hostname,
    )
    db.commit()
    db.refresh(item)
    return DomainOut(
        id=item.id,
        hostname=item.hostname,
        status=item.status,
        verified_at=item.verified_at,
        verification_record=f"_rainwater-verification.{item.hostname}",
        verification_value=token,
    )


@router.post("/domains/{domain_id}/verify", response_model=DomainOut)
def verify_domain(domain_id: str, request: Request, ctx: TenantContext = Depends(get_tenant_context), db: Session = Depends(get_db)):
    ensure_admin(ctx)
    item = db.scalar(select(TenantDomain).where(TenantDomain.id == domain_id, TenantDomain.tenant_id == ctx.principal.tenant.id))
    if not item:
        raise HTTPException(status_code=404, detail="Alan adı bulunamadı")
    try:
        answers = dns.resolver.resolve(f"_rainwater-verification.{item.hostname}", "TXT", lifetime=5)
        values = [b"".join(answer.strings).decode() for answer in answers]
    except Exception as exc:
        raise HTTPException(status_code=409, detail="TXT kaydı henüz bulunamadı") from exc
    if not any(hashlib.sha256(value.encode()).hexdigest() == item.verification_token_hash for value in values):
        raise HTTPException(status_code=409, detail="TXT doğrulama değeri eşleşmiyor")
    from ..models import utcnow
    item.status = "VERIFIED"
    item.verified_at = utcnow()
    log_security_event(
        db,
        "CUSTOM_DOMAIN_VERIFIED",
        tenant_id=ctx.principal.tenant.id,
        user_id=ctx.principal.user.id,
        request_id=getattr(request.state, "request_id", None),
        resource=item.hostname,
    )
    db.commit()
    return DomainOut(id=item.id, hostname=item.hostname, status=item.status, verified_at=item.verified_at)
