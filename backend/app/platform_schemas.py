from datetime import datetime
from decimal import Decimal
import re

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginIn(BaseModel):
    tenant_slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9][a-z0-9-]*$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TenantOut(BaseModel):
    id: str
    slug: str
    name: str
    status: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    permissions: list[str]
    platform_admin: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    tenant: TenantOut
    user: UserOut


class ModuleOut(BaseModel):
    code: str
    name: str
    description: str
    category: str
    monthly_price: Decimal
    currency: str
    core: bool
    enabled: bool
    source: str


class PlanOut(BaseModel):
    code: str
    name: str
    description: str
    monthly_base_price: Decimal
    currency: str
    included_users: int
    modules: list[str]


class CatalogOut(BaseModel):
    modules: list[ModuleOut]
    plans: list[PlanOut]


class OverviewOut(BaseModel):
    tenant: TenantOut
    plan: PlanOut | None
    modules: list[ModuleOut]
    monthly_total: Decimal
    users_count: int
    verified_domains: int
    security_score: int


class ModuleToggleIn(BaseModel):
    enabled: bool


class PlanChangeIn(BaseModel):
    plan_code: str = Field(min_length=2, max_length=64, pattern=r"^[A-Z0-9_-]+$")


class DomainCreateIn(BaseModel):
    hostname: str = Field(min_length=4, max_length=253)

    @field_validator("hostname")
    @classmethod
    def normalize_hostname(cls, value: str) -> str:
        hostname = value.strip().lower().rstrip(".")
        if "://" in hostname or "/" in hostname or hostname.count(".") < 1:
            raise ValueError("Yalnızca alan adı girin; örn. portal.sirketiniz.com")
        try:
            hostname = hostname.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise ValueError("Alan adı geçerli değil") from exc
        labels = hostname.split(".")
        if any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels):
            raise ValueError("Alan adı geçerli değil")
        return hostname


class DomainOut(BaseModel):
    id: str
    hostname: str
    status: str
    verified_at: datetime | None
    verification_record: str | None = None
    verification_value: str | None = None


class ModuleLaunchOut(BaseModel):
    launch_url: str
    ticket: str
    expires_in: int
    module_code: str


class ModuleTicketExchangeIn(BaseModel):
    ticket: str = Field(min_length=32, max_length=256)


class ModuleTicketExchangeOut(BaseModel):
    tenant_id: str
    tenant_slug: str
    tenant_name: str
    user_id: str
    email: EmailStr
    full_name: str
    role: str
    permissions: list[str]
    module_code: str
