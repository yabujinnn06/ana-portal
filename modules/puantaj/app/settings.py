from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/attendance"
    admin_user: str = "admin"
    admin_pass_hash: str = ""
    jwt_secret: str = ""
    jwt_issuer: str = "puantaj-mvp"
    jwt_audience: str = "puantaj-admin"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    allow_refresh: bool = True
    app_name: str = "PuantajMVP"
    cors_allow_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"
    base_public_url: str | None = None
    employee_portal_base_url: str = "http://127.0.0.1:8000/employee"
    attendance_timezone: str = "Europe/Istanbul"
    attendance_daily_max_cycles: int = 1
    attendance_extra_checkin_approval_ttl_minutes: int = 30
    location_enforcement_mode: str = "soft"
    location_enforcement_block_statuses: str = "OUTSIDE_GEOFENCE,MOCK_GPS_SUSPECTED"
    passkey_mode: str = "optional"
    webauthn_rp_id: str | None = None
    webauthn_rp_name: str = "PuantajMVP"
    webauthn_origin: str | None = None
    passkey_challenge_minutes: int = 10
    push_vapid_public_key: str | None = None
    push_vapid_private_key: str | None = None
    push_vapid_subject: str = "mailto:admin@example.com"
    notification_worker_enabled: bool = True
    notification_worker_interval_seconds: int = 60
    notification_email_enabled: bool = False
    admin_push_healthcheck_enabled: bool = True
    admin_push_healthcheck_interval_seconds: int = 1800
    admin_push_healthcheck_stale_minutes: int = 720
    admin_push_healthcheck_batch_size: int = 25
    notification_alarm_webhook_url: str | None = None
    notification_alarm_webhook_token: str | None = None
    notification_alarm_discord_webhook_url: str | None = None
    notification_alarm_telegram_bot_token: str | None = None
    notification_alarm_telegram_chat_id: str | None = None
    notification_alarm_email_to: str | None = None
    missed_checkout_nightly_reminder_local_time: str = "21:30"
    daily_report_archive_retention_days: int = 180
    schema_guard_strict: bool = True
    auto_create_schema: bool = False
    recovery_code_count: int = 8
    recovery_code_expiry_days: int = 365
    recovery_admin_vault_key: str | None = None
    device_invite_max_attempts: int = 3
    admin_device_invite_max_attempts: int = 3
    device_invite_max_ttl_minutes: int = 60 * 24 * 30
    admin_device_invite_max_ttl_minutes: int = 120
    device_invite_min_retry_seconds: int = 4
    admin_device_invite_min_retry_seconds: int = 6
    admin_mfa_required: bool = False
    admin_mfa_totp_secret: str | None = None
    admin_mfa_step_seconds: int = 30
    admin_mfa_window_steps: int = 1
    security_headers_enabled: bool = True
    security_csp_report_only: bool = False
    security_hsts_max_age_seconds: int = 31536000
    archive_file_encryption_key: str | None = None
    daily_report_archive_max_rows: int = 365
    assistant_enabled: bool = True
    assistant_api_key: str | None = None
    assistant_base_url: str = "https://api.groq.com/openai/v1"
    assistant_model: str = "llama-3.1-8b-instant"
    assistant_max_iterations: int = 4
    assistant_temperature: float = 0.3
    assistant_history_limit: int = 16
    depo_admin_pin: str | None = None
    portal_sso_enabled: bool = False
    portal_control_plane_url: str = "http://backend:8000"
    portal_module_bridge_secret: str = ""
    portal_tenant_slug: str = ""
    portal_embed_origin: str = ""
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    def validate_runtime(self) -> None:
        if self.access_token_minutes < 5 or self.access_token_minutes > 60:
            raise RuntimeError("ACCESS_TOKEN_MINUTES must be between 5 and 60")
        if self.portal_sso_enabled:
            if len((self.portal_module_bridge_secret or "").strip()) < 32:
                raise RuntimeError("PORTAL_MODULE_BRIDGE_SECRET must contain at least 32 characters")
            if not (self.portal_tenant_slug or "").strip():
                raise RuntimeError("PORTAL_TENANT_SLUG is required when portal SSO is enabled")
            if urlparse(self.portal_control_plane_url).scheme not in {"http", "https"}:
                raise RuntimeError("PORTAL_CONTROL_PLANE_URL must be an HTTP(S) URL")
            if self.portal_embed_origin and urlparse(self.portal_embed_origin).scheme not in {"http", "https"}:
                raise RuntimeError("PORTAL_EMBED_ORIGIN must be an HTTP(S) origin")
        if not self.is_production:
            return
        if self.database_url.startswith("sqlite"):
            raise RuntimeError("PostgreSQL DATABASE_URL is required in production")
        if self.auto_create_schema:
            raise RuntimeError("AUTO_CREATE_SCHEMA must be disabled in production")
        if not self.base_public_url or urlparse(self.base_public_url).scheme != "https":
            raise RuntimeError("HTTPS BASE_PUBLIC_URL is required in production")
        if "*" in get_cors_origins_from_raw(self.cors_allow_origins):
            raise RuntimeError("Wildcard CORS is not allowed in production")
        if "*" in get_csv_values(self.trusted_hosts):
            raise RuntimeError("Wildcard trusted hosts are not allowed in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_cors_origins_from_raw(raw: str) -> list[str]:
    return get_csv_values(raw)


def get_csv_values(raw: str) -> list[str]:
    return [value.strip() for value in raw.split(",") if value.strip()]


def get_cors_origins() -> list[str]:
    return get_cors_origins_from_raw(get_settings().cors_allow_origins)


def get_trusted_hosts() -> list[str]:
    return get_csv_values(get_settings().trusted_hosts)


def get_employee_portal_base_url() -> str:
    settings = get_settings()
    if settings.base_public_url:
        base = settings.base_public_url.rstrip("/")
        if base.endswith("/employee"):
            return base
        return f"{base}/employee"
    return settings.employee_portal_base_url.rstrip("/")


def get_public_base_url() -> str:
    settings = get_settings()
    if settings.base_public_url:
        return settings.base_public_url.rstrip("/")
    return "http://127.0.0.1:8000"


def get_webauthn_origin() -> str:
    settings = get_settings()
    if settings.webauthn_origin:
        return settings.webauthn_origin.rstrip("/")
    return get_public_base_url()


def get_webauthn_rp_id() -> str:
    settings = get_settings()
    if settings.webauthn_rp_id:
        return settings.webauthn_rp_id.strip().lower()

    origin = get_webauthn_origin()
    parsed = urlparse(origin)
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return "localhost"
    return host


def is_push_enabled() -> bool:
    settings = get_settings()
    return bool(
        (settings.push_vapid_public_key or "").strip()
        and (settings.push_vapid_private_key or "").strip()
    )


def get_location_enforcement_block_statuses() -> set[str]:
    raw = get_settings().location_enforcement_block_statuses or ""
    return {item.strip().upper() for item in raw.split(",") if item.strip()}

