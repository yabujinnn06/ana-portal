from uuid import uuid4

from fastapi.testclient import TestClient

from app.config import Settings
from app.database import SessionLocal
from app.models import TenantDomain


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health_and_public_catalog(client: TestClient):
    assert client.get("/health").status_code == 200
    response = client.get("/api/v1/platform/catalog")
    assert response.status_code == 200
    assert len(response.json()["modules"]) == 7
    assert {item["code"] for item in response.json()["modules"]}.isdisjoint({"hr", "payroll"})
    assert {item["code"] for item in response.json()["plans"]} == {"START", "GROWTH", "ENTERPRISE"}


def test_login_overview_and_tenant_modules(client: TestClient, token: str):
    overview = client.get("/api/v1/platform/overview", headers=auth(token))
    assert overview.status_code == 200
    assert overview.json()["tenant"]["slug"] == "rainwater-test"
    assert overview.json()["plan"]["code"] == "GROWTH"

    enabled = client.patch("/api/v1/platform/modules/warehouse", headers=auth(token), json={"enabled": True})
    assert enabled.status_code == 200
    assert enabled.json()["enabled"] is True

    cannot_disable_core = client.patch("/api/v1/platform/modules/platform", headers=auth(token), json={"enabled": False})
    assert cannot_disable_core.status_code == 409

    changed = client.patch("/api/v1/platform/subscription", headers=auth(token), json={"plan_code": "ENTERPRISE"})
    assert changed.status_code == 200
    assert changed.json()["code"] == "ENTERPRISE"
    restored = client.patch("/api/v1/platform/subscription", headers=auth(token), json={"plan_code": "GROWTH"})
    assert restored.status_code == 200


def test_custom_domain_token_is_returned_only_once(client: TestClient, token: str):
    hostname = f"portal-{uuid4().hex[:8]}.example.com"
    created = client.post("/api/v1/platform/domains", headers=auth(token), json={"hostname": hostname})
    assert created.status_code == 201
    assert created.json()["verification_value"]
    listed = client.get("/api/v1/platform/domains", headers=auth(token))
    matching = next(item for item in listed.json() if item["hostname"] == hostname)
    assert matching.get("verification_value") is None


def test_unregistered_host_is_rejected(client: TestClient):
    response = client.get("/health", headers={"Host": "unregistered.example.net"})
    assert response.status_code == 400


def test_caddy_certificate_permission_is_allowlisted(client: TestClient):
    allowed = client.get("/internal/caddy/allow", params={"domain": "testserver"})
    assert allowed.status_code == 204
    denied = client.get("/internal/caddy/allow", params={"domain": "unknown.example.com"})
    assert denied.status_code == 403


def test_puantaj_custom_host_is_verified_for_the_same_tenant(client: TestClient, token: str):
    hostname = f"puantaj-{uuid4().hex[:8]}.example.com"
    created = client.post("/api/v1/platform/domains", headers=auth(token), json={"hostname": hostname})
    assert created.status_code == 201
    with SessionLocal() as db:
        domain = db.get(TenantDomain, created.json()["id"])
        domain.status = "VERIFIED"
        db.commit()

    headers = {"X-Module-Bridge-Secret": "test-module-bridge-secret-with-forty-characters"}
    allowed = client.get(
        "/internal/domains/allow",
        headers=headers,
        params={"domain": hostname, "tenant_slug": "rainwater-test"},
    )
    assert allowed.status_code == 204
    wrong_tenant = client.get(
        "/internal/domains/allow",
        headers=headers,
        params={"domain": hostname, "tenant_slug": "another-company"},
    )
    assert wrong_tenant.status_code == 403


def test_puantaj_launch_ticket_is_single_use(client: TestClient, token: str):
    launched = client.post("/api/v1/platform/modules/attendance/launch", headers=auth(token))
    assert launched.status_code == 200
    assert launched.json()["launch_url"].endswith("/api/portal-sso/consume")
    ticket = launched.json()["ticket"]
    exchanged = client.post(
        "/internal/modules/exchange",
        headers={"X-Module-Bridge-Secret": "test-module-bridge-secret-with-forty-characters"},
        json={"ticket": ticket},
    )
    assert exchanged.status_code == 200
    assert exchanged.json()["tenant_slug"] == "rainwater-test"
    assert exchanged.json()["module_code"] == "attendance"
    replay = client.post(
        "/internal/modules/exchange",
        headers={"X-Module-Bridge-Secret": "test-module-bridge-secret-with-forty-characters"},
        json={"ticket": ticket},
    )
    assert replay.status_code == 401


def test_production_requires_postgres_and_strong_secrets():
    settings = Settings(environment="production", database_url="sqlite:///unsafe.db", auto_create_schema=False)
    try:
        settings.validate_runtime()
        assert False, "Production validation should fail"
    except RuntimeError as exc:
        assert "PostgreSQL" in str(exc)
