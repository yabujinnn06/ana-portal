from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

ONLINE_WINDOW_SECONDS = 75
_PRUNE_AFTER_SECONDS = 3600

_LOCK = threading.Lock()
_PRESENCE: dict[str, dict[str, Any]] = {}


def touch_presence(*, key: str, username: str, full_name: str | None, role: str | None) -> None:
    """Bir admin'in su an aktif oldugunu (son gorulme) isaretler."""
    now = datetime.now(timezone.utc)
    with _LOCK:
        _PRESENCE[key] = {
            "key": key,
            "username": username,
            "full_name": full_name,
            "role": role,
            "last_seen_utc": now,
        }
        # Cok eski kayitlari temizle (bellek sismesini onle).
        stale = [
            entry_key
            for entry_key, value in _PRESENCE.items()
            if (now - value["last_seen_utc"]).total_seconds() > _PRUNE_AFTER_SECONDS
        ]
        for entry_key in stale:
            _PRESENCE.pop(entry_key, None)


def list_active(window_seconds: int = ONLINE_WINDOW_SECONDS) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    with _LOCK:
        active = [
            dict(value)
            for value in _PRESENCE.values()
            if (now - value["last_seen_utc"]).total_seconds() <= window_seconds
        ]
    active.sort(key=lambda value: value["last_seen_utc"], reverse=True)
    return active
