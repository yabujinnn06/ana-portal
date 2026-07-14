"""Ikinci tur: dolu aylik rapor + mesaide olan calisan ana ekrani."""
from __future__ import annotations

import os
import re
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000"
OUT = os.path.join("tanitim", "img")
ADMIN_PASS = "Demo1234"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # --- Admin: dolu aylik rapor ---
        ctx = browser.new_context(viewport={"width": 1440, "height": 1100}, device_scale_factor=2, locale="tr-TR")
        page = ctx.new_page()
        page.goto(f"{BASE}/admin-panel/login", wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        page.locator("form input").first.fill("admin")
        page.fill("input[type=password]", ADMIN_PASS)
        page.click("button[type=submit]")
        page.wait_for_timeout(2500)

        try:
            page.goto(f"{BASE}/admin-panel/reports/employee-monthly", wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            inp = page.get_by_placeholder("Calisan adi veya ID yazin...")
            inp.click()
            inp.fill("Ahmet")
            page.wait_for_timeout(800)
            page.get_by_role("button", name=re.compile("Ahmet")).first.click()
            page.wait_for_timeout(400)
            page.get_by_role("button", name=re.compile("^Uygula")).first.click()
            page.wait_for_timeout(3000)
            page.screenshot(path=os.path.join(OUT, "admin-aylik-rapor.png"), full_page=True)
            print("aylik-rapor OK")
        except Exception as e:
            print(f"aylik-rapor FAIL {e}")
        ctx.close()

        # --- Employee: mesaide olan Ahmet ana ekrani ---
        ectx = browser.new_context(
            viewport={"width": 414, "height": 896}, device_scale_factor=2, is_mobile=True, locale="tr-TR",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        )
        ep = ectx.new_page()
        try:
            ep.goto(f"{BASE}/employee/claim?token=demo-ahmet-9k3", wait_until="domcontentloaded")
            ep.wait_for_timeout(4000)
            ep.goto(f"{BASE}/employee/", wait_until="domcontentloaded")
            ep.wait_for_timeout(4000)
            ep.screenshot(path=os.path.join(OUT, "employee-home-mesaide.png"))
            print(f"employee-home-mesaide OK -> {ep.url}")
        except Exception as e:
            print(f"employee-home-mesaide FAIL {e}")
        ectx.close()
        browser.close()


if __name__ == "__main__":
    main()
