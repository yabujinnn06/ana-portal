from __future__ import annotations

import logging
import secrets
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.db import get_db
from app.errors import ApiError
from app.models import AdminUser, AuditActorType
from app.routers.admin import (
    _clear_admin_auth_cookies,
    _persist_refresh_token,
    _set_admin_auth_cookies,
)
from app.security import create_access_token, create_refresh_token, full_permissions, hash_password
from app.settings import get_settings


logger = logging.getLogger(__name__)
router = APIRouter(tags=["portal-sso"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.post("/api/portal-sso/consume", response_class=RedirectResponse)
def consume_portal_ticket(
    request: Request,
    ticket: str = Form(min_length=32, max_length=256),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    if not settings.portal_sso_enabled:
        raise ApiError(status_code=404, code="NOT_FOUND", message="Portal SSO is disabled.")
    if len((settings.portal_module_bridge_secret or "").strip()) < 32:
        raise ApiError(status_code=503, code="SSO_NOT_CONFIGURED", message="Portal SSO is not configured.")
    try:
        exchange = httpx.post(
            f"{settings.portal_control_plane_url.rstrip('/')}/internal/modules/exchange",
            headers={"X-Module-Bridge-Secret": settings.portal_module_bridge_secret},
            json={"ticket": ticket},
            timeout=5.0,
        )
    except httpx.HTTPError as exc:
        logger.exception("portal_sso_exchange_unreachable")
        raise ApiError(status_code=503, code="SSO_UNAVAILABLE", message="Portal SSO is temporarily unavailable.") from exc
    if exchange.status_code != 200:
        raise ApiError(status_code=401, code="INVALID_SSO_TICKET", message="Portal transition ticket is invalid.")
    payload: dict[str, Any] = exchange.json()
    if payload.get("module_code") != "attendance":
        raise ApiError(status_code=403, code="FORBIDDEN", message="Ticket is not valid for Puantaj.")
    expected_tenant = (settings.portal_tenant_slug or "").strip().lower()
    if expected_tenant and str(payload.get("tenant_slug") or "").lower() != expected_tenant:
        raise ApiError(status_code=403, code="TENANT_MISMATCH", message="Ticket belongs to another company.")
    role = str(payload.get("role") or "MEMBER").upper()
    if role not in {"OWNER", "ADMIN"}:
        raise ApiError(status_code=403, code="FORBIDDEN", message="Company administrator role is required.")

    portal_user_id = str(payload["user_id"])
    username = f"portal_{portal_user_id}"[:100]
    admin_user = db.scalar(select(AdminUser).where(AdminUser.username == username))
    if not admin_user:
        admin_user = AdminUser(
            username=username,
            full_name=str(payload.get("full_name") or payload.get("email") or "Portal Yöneticisi"),
            password_hash=hash_password(secrets.token_urlsafe(48)),
            is_active=True,
            is_super_admin=role == "OWNER",
            permissions=full_permissions(),
        )
        db.add(admin_user)
        db.flush()
    else:
        admin_user.full_name = str(payload.get("full_name") or payload.get("email") or admin_user.full_name)
        admin_user.is_active = True
        admin_user.is_super_admin = role == "OWNER"
        admin_user.permissions = full_permissions()

    access_token, _, access_claims = create_access_token(
        sub=admin_user.username,
        username=admin_user.username,
        full_name=admin_user.full_name,
        role="admin",
        admin_user_id=admin_user.id,
        is_super_admin=admin_user.is_super_admin,
        permissions=admin_user.permissions,
    )
    refresh_token, refresh_claims = create_refresh_token(
        sub=admin_user.username,
        username=admin_user.username,
        full_name=admin_user.full_name,
        role="admin",
        admin_user_id=admin_user.id,
        is_super_admin=admin_user.is_super_admin,
        permissions=admin_user.permissions,
    )
    _persist_refresh_token(
        db,
        claims=refresh_claims,
        ip=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    log_audit(
        db,
        actor_type=AuditActorType.ADMIN,
        actor_id=admin_user.username,
        action="PORTAL_SSO_LOGIN",
        success=True,
        ip=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
        details={"tenant_slug": payload.get("tenant_slug"), "portal_user_id": portal_user_id},
        request_id=getattr(request.state, "request_id", None),
    )
    db.commit()
    response = RedirectResponse(url="/admin-panel/", status_code=303)
    _clear_admin_auth_cookies(response, request=request)
    _set_admin_auth_cookies(
        response,
        request=request,
        access_token=access_token,
        access_claims=access_claims,
        refresh_token=refresh_token,
        refresh_claims=refresh_claims,
    )
    return response
