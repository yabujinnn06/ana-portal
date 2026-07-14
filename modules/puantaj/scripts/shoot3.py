"""Tam sayfa employee home (tum moduller gorunur) + bekleyen durum."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright

from app.db import SessionLocal
from app import models as m

BASE = "http://127.0.0.1:8000"
OUT = os.path.join("tanitim", "img")


def fresh_invite(full_name: str, token: str) -> int:
    db = SessionLocal()
    try:
        e = db.query(m.Employee).filter(m.Employee.full_name == full_name).first()
        db.query(m.DeviceInvite).filter(m.DeviceInvite.employee_id == e.id).delete()
        # eski cihazlari da pasiflestir ki yeni fingerprint temiz baglansin
        for d in db.query(m.Device).filter(m.Device.employee_id == e.id).all():
            d.device_fingerprint = f"old-{d.id}-{d.device_fingerprint}"[:240]
            d.is_active = False
        db.add(m.DeviceInvite(employee_id=e.id, token=token,
                              expires_at=datetime.now(timezone.utc) + timedelta(days=1), max_attempts=9))
        db.commit()
        return e.id
    finally:
        db.close()


def shoot_full(token: str, out_name: str):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 430, "height": 932}, device_scale_factor=2, is_mobile=True, locale="tr-TR",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        )
        page = ctx.new_page()
        page.goto(f"{BASE}/employee/claim?token={token}", wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        page.goto(f"{BASE}/employee/", wait_until="domcontentloaded")
        page.wait_for_timeout(4500)
        page.screenshot(path=os.path.join(OUT, out_name), full_page=True)
        print(f"{out_name} OK -> {page.url}")
        ctx.close()
        browser.close()


if __name__ == "__main__":
    fresh_invite("Ahmet Yilmaz", "demo-ahmet-full-1")
    shoot_full("demo-ahmet-full-1", "employee-home-full.png")
