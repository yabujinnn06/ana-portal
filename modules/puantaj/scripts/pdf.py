"""Brosuru temiz A4 PDF'e basar (Playwright headless Chromium)."""
import pathlib
from playwright.sync_api import sync_playwright

HTML = pathlib.Path("tanitim/index.html").resolve().as_uri()
OUT = str(pathlib.Path("tanitim/Yabujin-Puantaj-Tanitim.pdf").resolve())


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_context().new_page()
        page.goto(HTML, wait_until="networkidle")
        page.evaluate("async () => { await document.fonts.ready }")
        page.wait_for_timeout(1200)
        page.pdf(
            path=OUT,
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )
        browser.close()
        print("PDF_OK", OUT)


if __name__ == "__main__":
    main()
