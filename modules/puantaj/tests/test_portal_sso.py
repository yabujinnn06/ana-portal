from __future__ import annotations

import os
import unittest
from unittest.mock import AsyncMock, Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app
from app.middleware import PortalTenantHostMiddleware
from app.models import AdminUser
from app.settings import Settings, get_settings


class _FakeDb:
    def __init__(self, admin_user: AdminUser | None = None) -> None:
        self.admin_user = admin_user
        self.commits = 0

    def scalar(self, _statement):
        return self.admin_user

    def add(self, _item) -> None:
        return None

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1


def _override_db(fake_db: _FakeDb):
    def dependency():
        yield fake_db

    return dependency


class PortalSsoTests(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        get_settings.cache_clear()

    def test_disabled_sso_is_not_exposed(self) -> None:
        with patch.dict(os.environ, {"PORTAL_SSO_ENABLED": "false"}, clear=False):
            get_settings.cache_clear()
            app.dependency_overrides[get_db] = _override_db(_FakeDb())
            response = TestClient(app).post(
                "/api/portal-sso/consume",
                data={"ticket": "x" * 40},
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 404)

    def test_valid_ticket_creates_local_admin_session(self) -> None:
        admin_user = AdminUser(
            id=7,
            username="portal_user-id",
            full_name="Portal Yöneticisi",
            password_hash="unused",
            is_active=True,
            is_super_admin=True,
            permissions=["*"],
        )
        fake_db = _FakeDb(admin_user)
        exchange = Mock(
            status_code=200,
            json=lambda: {
                "tenant_id": "tenant-id",
                "tenant_slug": "rainwater",
                "tenant_name": "Rainwater",
                "user_id": "user-id",
                "email": "admin@example.com",
                "full_name": "Portal Yöneticisi",
                "role": "OWNER",
                "permissions": ["*"],
                "module_code": "attendance",
            },
        )
        env = {
            "PORTAL_SSO_ENABLED": "true",
            "PORTAL_MODULE_BRIDGE_SECRET": "b" * 48,
            "PORTAL_TENANT_SLUG": "rainwater",
        }
        with patch.dict(os.environ, env, clear=False), patch(
            "app.routers.portal_sso.httpx.post", return_value=exchange
        ), patch("app.routers.portal_sso._persist_refresh_token"), patch(
            "app.routers.portal_sso.log_audit"
        ):
            get_settings.cache_clear()
            app.dependency_overrides[get_db] = _override_db(fake_db)
            response = TestClient(app).post(
                "/api/portal-sso/consume",
                data={"ticket": "t" * 48},
                follow_redirects=False,
            )

        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/admin-panel/")
        self.assertIn("puantaj_admin_access_token", response.cookies)
        self.assertIn("puantaj_admin_refresh_token", response.cookies)
        self.assertEqual(fake_db.commits, 1)

    def test_custom_host_requires_control_plane_verification(self) -> None:
        mini_app = FastAPI()
        mini_app.add_middleware(
            PortalTenantHostMiddleware,
            settings=Settings(
                portal_sso_enabled=True,
                portal_module_bridge_secret="b" * 48,
                portal_tenant_slug="rainwater",
                trusted_hosts="localhost",
            ),
        )

        @mini_app.get("/health")
        def health():
            return {"ok": True}

        with patch.object(
            PortalTenantHostMiddleware,
            "_verified_custom_domain",
            new=AsyncMock(return_value=True),
        ):
            allowed = TestClient(mini_app).get("/health", headers={"Host": "portal.customer.example"})
        self.assertEqual(allowed.status_code, 200)

        with patch.object(
            PortalTenantHostMiddleware,
            "_verified_custom_domain",
            new=AsyncMock(return_value=False),
        ):
            denied = TestClient(mini_app).get("/health", headers={"Host": "attacker.example"})
        self.assertEqual(denied.status_code, 400)


if __name__ == "__main__":
    unittest.main()
