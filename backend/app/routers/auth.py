from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings, get_settings
from ..database import get_db
from ..models import AuthenticationAttempt, PlatformUser, Tenant, TenantMembership, utcnow
from ..platform_schemas import LoginIn, TenantOut, TokenOut, UserOut
from ..platform_service import failed_login_count, log_security_event
from ..security import Principal, create_access_token, get_current_principal, verify_password


router = APIRouter(prefix="/auth", tags=["Kimlik ve erişim"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def token_response(principal: Principal, access_token: str, expires_in: int) -> TokenOut:
    return TokenOut(
        access_token=access_token,
        expires_in=expires_in,
        tenant=TenantOut(id=principal.tenant.id, slug=principal.tenant.slug, name=principal.tenant.name, status=principal.tenant.status),
        user=UserOut(
            id=principal.user.id,
            email=principal.user.email,
            full_name=principal.user.full_name,
            role=principal.membership.role,
            permissions=principal.membership.permissions,
            platform_admin=principal.user.platform_admin,
        ),
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    tenant_slug = payload.tenant_slug.lower()
    email = str(payload.email).lower()
    ip_address = client_ip(request)
    request_id = getattr(request.state, "request_id", None)
    if failed_login_count(db, tenant_slug, email, ip_address, settings.login_window_minutes) >= settings.login_max_failures:
        log_security_event(db, "AUTH_RATE_LIMITED", request_id=request_id, ip_address=ip_address, payload={"tenant_slug": tenant_slug, "email": email})
        db.commit()
        raise HTTPException(status_code=429, detail="Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.")

    tenant = db.scalar(select(Tenant).where(Tenant.slug == tenant_slug))
    user = db.scalar(select(PlatformUser).where(PlatformUser.email == email))
    membership = None
    if tenant and user:
        membership = db.scalar(select(TenantMembership).where(
            TenantMembership.tenant_id == tenant.id,
            TenantMembership.user_id == user.id,
            TenantMembership.active.is_(True),
        ))
    valid = bool(tenant and user and membership and user.active and tenant.status not in {"SUSPENDED", "CANCELLED"})
    if valid:
        try:
            valid = verify_password(payload.password, user.password_hash)
        except Exception:
            valid = False

    db.add(AuthenticationAttempt(tenant_slug=tenant_slug, email=email, ip_address=ip_address, success=valid))
    if not valid:
        log_security_event(db, "AUTH_LOGIN_FAILED", tenant_id=tenant.id if tenant else None, user_id=user.id if user else None, request_id=request_id, ip_address=ip_address)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Şirket kodu, e-posta veya parola hatalı")

    user.last_login_at = utcnow()
    principal = Principal(user=user, tenant=tenant, membership=membership)
    token, expires_in = create_access_token(user, tenant, membership, settings)
    log_security_event(db, "AUTH_LOGIN_SUCCEEDED", tenant_id=tenant.id, user_id=user.id, request_id=request_id, ip_address=ip_address, user_agent=request.headers.get("User-Agent"))
    db.commit()
    return token_response(principal, token, expires_in)


@router.get("/me")
def me(principal: Principal = Depends(get_current_principal)):
    return {
        "tenant": TenantOut(id=principal.tenant.id, slug=principal.tenant.slug, name=principal.tenant.name, status=principal.tenant.status),
        "user": UserOut(
            id=principal.user.id,
            email=principal.user.email,
            full_name=principal.user.full_name,
            role=principal.membership.role,
            permissions=principal.membership.permissions,
            platform_admin=principal.user.platform_admin,
        ),
    }
