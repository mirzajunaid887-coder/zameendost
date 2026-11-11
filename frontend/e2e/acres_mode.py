"""Checks the 'type acres' alternative to drawing: area of the generated square must match the typed acres."""
import re, subprocess, time, sys, urllib.request
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(["npx", "vite", "preview", "--port", "4174", "--strictPort"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
BASE = "http://localhost:4174/zameendost/"; ok = False
try:
    for _ in range(40):
        try: urllib.request.urlopen(BASE); break
        except Exception: time.sleep(0.5)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_context(viewport={"width": 390, "height": 800}, locale="ur-PK").new_page()
        pg.route(re.compile(r"https://(.*tile\.openstreetmap\.org|server\.arcgisonline\.com)/.*"), lambda r: r.abort())
        pg.goto(BASE + "#/field"); pg.wait_for_selector(".leaflet-container")
        pg.click("text=🔢 ایکڑ لکھوں")
        box = pg.locator(".leaflet-container").bounding_box(); pg.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        pg.locator("input").fill("5"); pg.wait_for_selector("text=/[0-9.]+ ایکڑ \\(/")
        txt = pg.locator("text=/[0-9.]+ ایکڑ \\(/").first.inner_text(); val = float(re.search(r"([0-9.]+) ایکڑ", txt).group(1))
        print("shown:", txt); ok = abs(val - 5.0) < 0.1
        pg.screenshot(path="/tmp/zd_wizard.png"); b.close()
finally: srv.terminate()
print("PASS acres mode area matches typed acres" if ok else "FAIL acres mode"); sys.exit(0 if ok else 1)
