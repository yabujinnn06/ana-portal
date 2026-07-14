from time import perf_counter
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import TenantDomain


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        request.state.request_id = request_id
        started = perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/v1/auth") else "private, no-cache"
        response.headers["Server-Timing"] = f'app;dur={(perf_counter() - started) * 1000:.2f}'
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class DynamicTrustedHostMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        host = (request.url.hostname or "").lower()
        allowed = host in set(settings.trusted_host_list) or host in settings.platform_host_list
        if not allowed:
            with SessionLocal() as db:
                allowed = db.scalar(select(TenantDomain.id).where(TenantDomain.hostname == host, TenantDomain.status == "VERIFIED")) is not None
        if not allowed:
            return JSONResponse({"detail": "Geçersiz istek alan adı"}, status_code=400)
        return await call_next(request)
