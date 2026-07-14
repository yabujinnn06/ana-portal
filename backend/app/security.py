from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .models import PlatformUser, Tenant, TenantMembership, utcnow


password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


@dataclass(frozen=True)
class Principal:
    user: PlatformUser
    tenant: Tenant
    membership: TenantMembership


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def create_access_token(user: PlatformUser, tenant: Tenant, membership: TenantMembership, settings: Settings) -> tuple[str, int]:
    now = utcnow()
    expires_in = settings.access_token_minutes * 60
    payload = {
        "sub": user.id,
        "tenant_id": tenant.id,
        "membership_id": membership.id,
        "role": membership.role,
        "permissions": membership.permissions,
        "token_version": user.token_version,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
        "jti": str(uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256"), expires_in


def get_current_principal(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Principal:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Oturum geçersiz veya süresi dolmuş",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp", "iat", "sub", "jti", "tenant_id", "membership_id"]},
        )
    except jwt.PyJWTError as exc:
        raise credentials_error from exc

    user = db.get(PlatformUser, payload["sub"])
    tenant = db.get(Tenant, payload["tenant_id"])
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.id == payload["membership_id"],
            TenantMembership.user_id == payload["sub"],
            TenantMembership.tenant_id == payload["tenant_id"],
        )
    )
    if (
        not user
        or not tenant
        or not membership
        or not user.active
        or not membership.active
        or tenant.status in {"SUSPENDED", "CANCELLED"}
        or user.token_version != payload.get("token_version")
    ):
        raise credentials_error
    return Principal(user=user, tenant=tenant, membership=membership)


def require_roles(*roles: str):
    allowed = set(roles)

    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        if not principal.user.platform_admin and principal.membership.role not in allowed:
            raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
        return principal

    return dependency
