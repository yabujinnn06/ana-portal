from contextlib import asynccontextmanager
import hashlib
import hmac

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal, engine, get_db
from .middleware import DynamicTrustedHostMiddleware, SecurityHeadersMiddleware
from .models import Base, ModuleLaunchTicket, PlatformUser, SaaSModule, Tenant, TenantDomain, TenantMembership, utcnow
from .platform_schemas import ModuleTicketExchangeIn, ModuleTicketExchangeOut
from .platform_service import bootstrap_platform, log_security_event, seed_platform_catalog
from .routers import auth, platform


settings = get_settings()
settings.validate_runtime()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_platform_catalog(db)
        bootstrap_platform(db, settings)
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs" if not settings.is_production else None,
    redoc_url=None,
)
app.add_middleware(DynamicTrustedHostMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(platform.router, prefix="/api/v1")

if settings.enable_legacy_warehouse_routes:
    from .routers import catalog, operations, reports, stock

    app.include_router(catalog.router, prefix="/api/v1")
    app.include_router(stock.router, prefix="/api/v1")
    app.include_router(operations.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")


@app.get("/health", tags=["Sistem"])
def health():
    return {
        "status": "ok",
        "service": "ana-portal",
        "version": settings.app_version,
        "environment": settings.environment,
        "legacy_routes": settings.enable_legacy_warehouse_routes,
    }


@app.get("/internal/caddy/allow", include_in_schema=False)
def allow_caddy_certificate(
    domain: str = Query(min_length=4, max_length=253),
    db: Session = Depends(get_db),
):
    hostname = domain.strip().lower().rstrip(".")
    allowed = hostname in settings.platform_host_list or db.scalar(
        select(TenantDomain.id).where(TenantDomain.hostname == hostname, TenantDomain.status == "VERIFIED")
    ) is not None
    if not allowed:
        raise HTTPException(status_code=403, detail="Domain sertifika için onaylı değil")
    return Response(status_code=204)


@app.get("/internal/domains/allow", include_in_schema=False)
def allow_tenant_module_host(
    domain: str = Query(min_length=4, max_length=253),
    tenant_slug: str = Query(min_length=2, max_length=64),
    x_module_bridge_secret: str = Header(default=""),
    db: Session = Depends(get_db),
):
    if not hmac.compare_digest(x_module_bridge_secret, settings.module_bridge_secret):
        raise HTTPException(status_code=403, detail="Modül köprüsü yetkisi geçersiz")
    hostname = domain.strip().lower().rstrip(".")
    tenant_key = tenant_slug.strip().lower()
    allowed = db.scalar(
        select(TenantDomain.id)
        .join(Tenant, Tenant.id == TenantDomain.tenant_id)
        .where(
            TenantDomain.hostname == hostname,
            TenantDomain.status == "VERIFIED",
            Tenant.slug == tenant_key,
            Tenant.status.in_(["TRIAL", "ACTIVE"]),
        )
    ) is not None
    if not allowed:
        raise HTTPException(status_code=403, detail="Alan adı bu şirket modülü için onaylı değil")
    return Response(status_code=204)


@app.post("/internal/modules/exchange", response_model=ModuleTicketExchangeOut, include_in_schema=False)
def exchange_module_ticket(
    payload: ModuleTicketExchangeIn,
    request: Request,
    x_module_bridge_secret: str = Header(default=""),
    db: Session = Depends(get_db),
):
    if not hmac.compare_digest(x_module_bridge_secret, settings.module_bridge_secret):
        raise HTTPException(status_code=403, detail="Modül köprüsü yetkisi geçersiz")
    now = utcnow()
    ticket_hash = hashlib.sha256(payload.ticket.encode()).hexdigest()
    consumed = db.execute(
        update(ModuleLaunchTicket)
        .where(
            ModuleLaunchTicket.ticket_hash == ticket_hash,
            ModuleLaunchTicket.consumed_at.is_(None),
            ModuleLaunchTicket.expires_at > now,
        )
        .values(consumed_at=now)
        .returning(
            ModuleLaunchTicket.tenant_id,
            ModuleLaunchTicket.user_id,
            ModuleLaunchTicket.module_id,
        )
    ).one_or_none()
    if not consumed:
        db.rollback()
        raise HTTPException(status_code=401, detail="Modül geçiş bileti geçersiz veya süresi dolmuş")
    tenant_id, user_id, module_id = consumed
    tenant = db.get(Tenant, tenant_id)
    user = db.get(PlatformUser, user_id)
    module = db.get(SaaSModule, module_id)
    membership = db.scalar(select(TenantMembership).where(
        TenantMembership.tenant_id == tenant_id,
        TenantMembership.user_id == user_id,
        TenantMembership.active.is_(True),
    ))
    if not tenant or not user or not module or not membership or not user.active:
        db.rollback()
        raise HTTPException(status_code=401, detail="Modül kullanıcısı artık etkin değil")
    log_security_event(
        db,
        "MODULE_LAUNCH_TICKET_CONSUMED",
        tenant_id=tenant.id,
        user_id=user.id,
        request_id=getattr(request.state, "request_id", None),
        resource=module.code,
    )
    db.commit()
    return ModuleTicketExchangeOut(
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
        tenant_name=tenant.name,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role,
        permissions=membership.permissions,
        module_code=module.code,
    )
