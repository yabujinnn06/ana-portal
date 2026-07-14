"""Her A4 .page'i element olarak SS alir (PDF layout dogrulamasi)."""
import os
import pathlib
from playwright.sync_api import sync_playwright

HTML = pathlib.Path("tanitim/index.html").resolve().as_uri()
OUT = "tanitim/_verify"
os.makedirs(OUT, exist_ok=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context(viewport={"width": 920, "height": 1320}, device_scale_factor=2).new_page()
        page.goto(HTML, wait_until="networkidle")
        page.evaluate("async () => { await document.fonts.ready }")
        page.wait_for_timeout(1000)
        pages = page.query_selector_all(".page")
        print("PAGES", len(pages))
        for i, el in enumerate(pages, 1):
            el.scroll_into_view_if_needed()
            el.screenshot(path=os.path.join(OUT, f"page-{i:02d}.png"))
        browser.close()
        print("VERIFY_DONE")


if __name__ == "__main__":
    main()
