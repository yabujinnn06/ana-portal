from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Rainwater Ana Portal"
    app_version: str = "0.2.0"
    database_url: str = "sqlite:///./rainwater.db"
    cors_origins: str = "http://localhost:5173"
    environment: str = "development"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"
    platform_hosts: str = "localhost,127.0.0.1,testserver"
    jwt_secret: str = "development-only-secret-change-before-production"
    jwt_issuer: str = "rainwater-portal"
    jwt_audience: str = "rainwater-portal-users"
    access_token_minutes: int = 15
    login_window_minutes: int = 15
    login_max_failures: int = 5
    auto_create_schema: bool = True
    enable_legacy_warehouse_routes: bool = False
    enforce_custom_domain_binding: bool = True
    bootstrap_tenant_slug: str = ""
    bootstrap_tenant_name: str = ""
    bootstrap_admin_email: str = ""
    bootstrap_admin_password: str = ""
    portal_public_url: str = "http://localhost:5173"
    module_bridge_secret: str = "development-module-bridge-secret-change-me"
    module_launch_ticket_seconds: int = 60
    puantaj_public_url: str = "http://127.0.0.1:8001"
    puantaj_internal_url: str = ""
    rainteklif_public_url: str = "http://127.0.0.1:8012"
    rainteklif_internal_url: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

    @property
    def trusted_host_list(self) -> list[str]:
        return [value.strip() for value in self.trusted_hosts.split(",") if value.strip()]

    @property
    def platform_host_list(self) -> set[str]:
        return {value.strip().lower() for value in self.platform_hosts.split(",") if value.strip()}

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    def validate_runtime(self) -> None:
        bootstrap_values = (
            self.bootstrap_tenant_slug,
            self.bootstrap_tenant_name,
            self.bootstrap_admin_email,
            self.bootstrap_admin_password,
        )
        if any(bootstrap_values) and not all(bootstrap_values):
            raise RuntimeError("Bootstrap şirket ve yönetici alanlarının tamamı birlikte verilmelidir")
        if self.access_token_minutes < 5 or self.access_token_minutes > 60:
            raise RuntimeError("ACCESS_TOKEN_MINUTES 5 ile 60 arasında olmalıdır")
        if self.module_launch_ticket_seconds < 30 or self.module_launch_ticket_seconds > 300:
            raise RuntimeError("MODULE_LAUNCH_TICKET_SECONDS 30 ile 300 arasında olmalıdır")
        if not self.is_production:
            return
        if self.database_url.startswith("sqlite"):
            raise RuntimeError("Production ortaminda PostgreSQL DATABASE_URL zorunludur")
        if len(self.jwt_secret) < 32 or "development-only" in self.jwt_secret:
            raise RuntimeError("Production ortaminda guclu JWT_SECRET zorunludur")
        if "*" in self.cors_origin_list or "*" in self.trusted_host_list:
            raise RuntimeError("Production ortaminda wildcard CORS/TRUSTED_HOSTS kullanilamaz")
        if self.auto_create_schema:
            raise RuntimeError("Production ortaminda AUTO_CREATE_SCHEMA kapali olmali; Alembic kullanin")
        if self.bootstrap_admin_password and len(self.bootstrap_admin_password) < 14:
            raise RuntimeError("Production bootstrap yönetici parolası en az 14 karakter olmalıdır")
        if len(self.module_bridge_secret) < 32 or "development-" in self.module_bridge_secret:
            raise RuntimeError("Production ortamında güçlü MODULE_BRIDGE_SECRET zorunludur")


@lru_cache
def get_settings() -> Settings:
    return Settings()
