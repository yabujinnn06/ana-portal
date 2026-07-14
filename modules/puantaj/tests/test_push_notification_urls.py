from __future__ import annotations

import unittest
from unittest.mock import patch

from app.models import AdminPushSubscription
from app.services.push_notifications import (
    _with_push_delivery_defaults,
    send_push_to_admin_subscriptions,
    send_test_push_to_admin_subscription,
)


class _CommitOnlySession:
    def __init__(self) -> None:
        self.commit_count = 0

    def commit(self) -> None:
        self.commit_count += 1


class PushNotificationUrlTests(unittest.TestCase):
    def test_relative_url_uses_public_base_url(self) -> None:
        with patch(
            "app.services.push_notifications.get_public_base_url",
            return_value="https://example.com",
        ):
            payload = _with_push_delivery_defaults(
                {"url": "/admin-panel/attendance-extra-checkin-approval?token=demo"}
            )

        self.assertEqual(
            payload["url"],
            "https://example.com/admin-panel/attendance-extra-checkin-approval?token=demo",
        )

    def test_absolute_url_is_preserved(self) -> None:
        with patch(
            "app.services.push_notifications.get_public_base_url",
            return_value="https://example.com",
        ):
            payload = _with_push_delivery_defaults(
                {"url": "https://example.com/admin-panel/notifications?job_id=42"}
            )

        self.assertEqual(
            payload["url"],
            "https://example.com/admin-panel/notifications?job_id=42",
        )

    def test_admin_bulk_send_deactivates_expired_subscription(self) -> None:
        subscription = AdminPushSubscription(
            id=11,
            admin_user_id=None,
            admin_username="esra",
            endpoint="https://push.example/expired",
            p256dh="p256dh",
            auth="auth",
            is_active=True,
        )
        db = _CommitOnlySession()

        with patch(
            "app.services.push_notifications._send_to_subscription_row",
            return_value=(False, "gone", 410),
        ):
            result = send_push_to_admin_subscriptions(
                db,  # type: ignore[arg-type]
                subscriptions=[subscription],
                title="Test",
                body="Body",
            )

        self.assertFalse(subscription.is_active)
        self.assertEqual(subscription.last_error, "gone")
        self.assertEqual(db.commit_count, 1)
        self.assertEqual(result["failed"], 1)
        self.assertEqual(result["deactivated"], 1)
        self.assertEqual(result["deliveries"][0]["admin_username"], "esra")
        self.assertEqual(result["deliveries"][0]["status_code"], 410)

    def test_admin_test_push_deactivates_expired_subscription(self) -> None:
        subscription = AdminPushSubscription(
            id=12,
            admin_user_id=None,
            admin_username="yabujin",
            endpoint="https://push.example/expired-test",
            p256dh="p256dh",
            auth="auth",
            is_active=True,
        )
        db = _CommitOnlySession()

        with patch(
            "app.services.push_notifications._send_to_subscription_row",
            return_value=(False, "gone", 410),
        ):
            result = send_test_push_to_admin_subscription(
                db,  # type: ignore[arg-type]
                subscription=subscription,
            )

        self.assertFalse(subscription.is_active)
        self.assertEqual(subscription.last_error, "gone")
        self.assertEqual(db.commit_count, 1)
        self.assertFalse(result["ok"])
        self.assertEqual(result["status_code"], 410)


if __name__ == "__main__":
    unittest.main()
