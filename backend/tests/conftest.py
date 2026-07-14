import os

os.environ.update({
    "DATABASE_URL": "sqlite:///./test_portal.db",
    "ENVIRONMENT": "test",
    "TRUSTED_HOSTS": "testserver,localhost",
    "PLATFORM_HOSTS": "testserver,localhost",
    "JWT_SECRET": "test-secret-with-more-than-thirty-two-characters",
    "BOOTSTRAP_TENANT_SLUG": "rainwater-test",
    "BOOTSTRAP_TENANT_NAME": "Rainwater Test",
    "BOOTSTRAP_ADMIN_EMAIL": "admin@rainwater.example",
    "BOOTSTRAP_ADMIN_PASSWORD": "Strong-Test-Password-2026!",
    "LOGIN_MAX_FAILURES": "2",
    "MODULE_BRIDGE_SECRET": "test-module-bridge-secret-with-forty-characters",
    "PUANTAJ_PUBLIC_URL": "http://puantaj.test",
})

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def token(client: TestClient) -> str:
    response = client.post("/api/v1/auth/login", json={
        "tenant_slug": "rainwater-test",
        "email": "admin@rainwater.example",
        "password": "Strong-Test-Password-2026!",
    })
    assert response.status_code == 200
    return response.json()["access_token"]
