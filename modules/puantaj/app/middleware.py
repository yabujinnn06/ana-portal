from __future__ import annotations

from fnmatch import fnmatch
import logging
import time

import httpx
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import PlainTextResponse, Response

from app.settings import Settings


logger = logging.getLogger("app.trusted_host")


class PortalTenantHostMiddleware(BaseHTTPMiddleware):
    """Accept configured hosts and verified custom domains for this tenant."""

    def __init__(self, app, *, settings: Settings, cache_seconds: int = 60) -> None:
        super().__init__(app)
        self.settings = settings
        self.cache_seconds = max(5, cache_seconds)
        self.allowed_patterns = tuple(
            value.strip().lower() for value in settings.trusted_hosts.split(",") if value.strip()
        )
        self._verified_until: dict[str, float] = {}

    def _configured(self, hostname: str) -> bool:
        return any(fnmatch(hostname, pattern) for pattern in self.allowed_patterns)

    async def _verified_custom_domain(self, hostname: str) -> bool:
        now = time.monotonic()
        if self._verified_until.get(hostname, 0) > now:
            return True
        if not self.settings.portal_sso_enabled:
            return False
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(
                    f"{self.settings.portal_control_plane_url.rstrip('/')}/internal/domains/allow",
                    headers={"X-Module-Bridge-Secret": self.settings.portal_module_bridge_secret},
                    params={"domain": hostname, "tenant_slug": self.settings.portal_tenant_slug},
                )
        except httpx.HTTPError:
            logger.warning("portal_domain_validation_unavailable", extra={"hostname": hostname})
            return False
        if response.status_code != 204:
            return False
        self._verified_until[hostname] = now + self.cache_seconds
        return True

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        hostname = (request.url.hostname or "").strip().lower().rstrip(".")
        if not hostname or (not self._configured(hostname) and not await self._verified_custom_domain(hostname)):
            return PlainTextResponse("Invalid host header", status_code=400)
        return await call_next(request)
