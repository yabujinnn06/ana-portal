"""Depo modulu kimlik dogrulama: PIN tabanli DepoUser + kendi JWT ciftleri.

Ported from the standalone depojin app (backend/app/auth.py) as part of the depo
entegrasyonu (see CLAUDE.md). Deliberately kept as a separate identity from both puantaj
admin JWT auth and employee device-fingerprint auth: reuses puantaj's ``settings.jwt_secret``
(so we do not need a second secret to manage) but signs tokens with ``tip`` values
``depo_access``/``depo_refresh`` so they are never accepted by puantaj's own admin/employee
auth paths (and vice versa).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.db import get_db
from app.settings import get_settings
from app.models import DepoUser

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/depo/auth/login", auto_error=False)

_ACCESS_EXPIRE_MINUTES = 60 * 24
_REFRESH_EXPIRE_MINUTES = 60 * 24 * 30


def hash_pin(pin: str) -> str:
    return pwd.hash(pin)


def verify_pin(pin: str, hashed: str) -> bool:
    return pwd.verify(pin, hashed)


def _build(user_id: int, rol: str, tip: str, minutes: int) -> str:
    settings = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": str(user_id), "rol": rol, "tip": tip, "exp": exp}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def create_access(user_id: int, rol: str) -> str:
    return _build(user_id, rol, "depo_access", _ACCESS_EXPIRE_MINUTES)


def create_refresh(user_id: int, rol: str) -> str:
    return _build(user_id, rol, "depo_refresh", _REFRESH_EXPIRE_MINUTES)


def decode_token(token: str, beklenen_tip: str = "depo_access") -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token gecersiz")
    if payload.get("tip") != beklenen_tip:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token turu yanlis")
    return payload


def current_depo_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> DepoUser:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token gerekli")
    payload = decode_token(token, "depo_access")
    try:
        user_id = int(payload.get("sub"))
    except (ValueError, TypeError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token gecersiz")
    user = db.get(DepoUser, user_id)
    if not user or not user.aktif:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Kullanici yok veya pasif")
    return user


def require_depo_admin(user: DepoUser = Depends(current_depo_user)) -> DepoUser:
    if user.rol != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin yetkisi gerekli")
    return user


def client_ip(request: Request) -> str | None:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else None
