"""Tanitim icin gercek ekran goruntusu yakalayici (lokal demo verisi).

Calistirma: PYTHONPATH=. .venv/Scripts/python.exe scripts/shoot.py
"""
from __future__ import annotations

import os
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000"
OUT = os.path.join("tanitim", "img")
ADMIN_PASS = "Demo1234"

os.makedirs(OUT, exist_ok=True)

ADMIN_PAGES = [
    ("welcome", "/admin-panel/welcome"),
    ("canli-board", "/admin-panel/log"),
    ("calisanlar", "/admin-panel/employees"),
    ("aylik-rapor", "/admin-panel/reports/employee-monthly"),
    ("excel-export", "/admin-panel/reports/excel-export"),
    ("departman-ozet", "/admin-panel/reports/department-summary"),
    ("izinler", "/admin-panel/leaves"),
    ("calisma-kurallari", "/admin-panel/work-rules"),
    ("departmanlar", "/admin-panel/departments"),
    ("cihazlar", "/admin-panel/devices"),
    ("qr-kodlar", "/admin-panel/qr-kodlar"),
    ("denetim-kaydi", "/admin-panel/audit-logs"),
    ("bildirimler", "/admin-panel/notifications"),
    ("hizli-kurulum", "/admin-panel/quick-setup"),
]


def shoot_admin(ctx):
    page = ctx.new_page()
    results = []
    # Login ekrani
    try:
        page.goto(f"{BASE}/admin-panel/login", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        page.screenshot(path=os.path.join(OUT, "admin-login.png"))
        results.append("admin-login OK")
    except Exception as e:
        results.append(f"admin-login FAIL {e}")

    # Giris yap
    try:
        page.locator("form input").first.fill("admin")
        page.fill("input[type=password]", ADMIN_PASS)
        page.click("button[type=submit]")
        page.wait_for_timeout(3000)
        results.append(f"login -> {page.url}")
    except Exception as e:
        results.append(f"login FAIL {e}")

    for name, path in ADMIN_PAGES:
        try:
            page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
            page.wait_for_timeout(2600)
            page.screenshot(path=os.path.join(OUT, f"admin-{name}.png"), full_page=True)
            results.append(f"admin-{name} OK")
        except Exception as e:
            results.append(f"admin-{name} FAIL {e}")
    page.close()
    return results


def shoot_employee(browser):
    results = []
    ctx = browser.new_context(
        viewport={"width": 414, "height": 896},
        device_scale_factor=2,
        is_mobile=True,
        locale="tr-TR",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    )
    page = ctx.new_page()
    # Claim (davet token) ekrani
    try:
        page.goto(f"{BASE}/employee/claim?token=demo-davet-7h2k9p", wait_until="domcontentloaded")
        page.wait_for_timeout(3500)
        page.screenshot(path=os.path.join(OUT, "employee-claim.png"))
        results.append(f"employee-claim OK -> {page.url}")
    except Exception as e:
        results.append(f"employee-claim FAIL {e}")
    # Ana ekran
    try:
        page.goto(f"{BASE}/employee/", wait_until="domcontentloaded")
        page.wait_for_timeout(3500)
        page.screenshot(path=os.path.join(OUT, "employee-home.png"))
        results.append(f"employee-home OK -> {page.url}")
    except Exception as e:
        results.append(f"employee-home FAIL {e}")
    page.close()
    ctx.close()
    return results


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        admin_ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
            locale="tr-TR",
        )
        r1 = shoot_admin(admin_ctx)
        admin_ctx.close()
        r2 = shoot_employee(browser)
        browser.close()
        print("\n".join(r1 + r2))


if __name__ == "__main__":
    main()
