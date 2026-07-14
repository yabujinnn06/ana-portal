from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .models import TenantDomain
from .security import Principal, get_current_principal


@dataclass(frozen=True)
class TenantContext:
    principal: Principal
    host: str


def get_tenant_context(
    request: Request,
    principal: Principal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> TenantContext:
    host = (request.url.hostname or "").lower()
    if settings.enforce_custom_domain_binding and host not in settings.platform_host_list:
        domain = db.scalar(select(TenantDomain).where(TenantDomain.hostname == host, TenantDomain.status == "VERIFIED"))
        if not domain or domain.tenant_id != principal.tenant.id:
            raise HTTPException(status_code=403, detail="Bu alan adı şirket hesabınızla eşleşmiyor")
    return TenantContext(principal=principal, host=host)
