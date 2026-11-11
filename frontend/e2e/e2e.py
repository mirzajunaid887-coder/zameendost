"""End-to-end browser test (Playwright/Chromium) against `vite preview`.
Open-Meteo is MOCKED with SYNTHETIC hourly data: this verifies the app workflow, NOT the real API or real weather.
Run from frontend/: npm run build && python3 e2e/e2e.py"""
import json, math, re, subprocess, sys, time
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4173/zameendost/"
fails = []
def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if (not cond and extra) else "")); 
    if not cond: fails.append(name)

def synth_payload(start: date, end: date):
    time_, t, rh, ws, sw, pr = [], [], [], [], [], []
    d = start
    while d <= end:
        for h in range(24):
            time_.append(f"{d.isoformat()}T{h:02d}:00")
            t.append(14 + 8 * math.sin((h - 9) / 24 * 2 * math.pi)); rh.append(55); ws.append(2.0)
            sw.append(max(0, 450 * math.sin((h - 6) / 12 * math.pi)) if 6 <= h <= 18 else 0); pr.append(0.0)
        d += timedelta(days=1)
    days = (end - start).days + 1
    return {"elevation": 540.0, "hourly": {"time": time_, "temperature_2m": t, "relative_humidity_2m": rh, "wind_speed_10m": ws, "shortwave_radiation": sw, "precipitation": pr},
            "daily": {"time": [(start + timedelta(days=i)).isoformat() for i in range(days)], "et0_fao_evapotranspiration": [2.0] * days, "precipitation_probability_max": [0] * days}}

srv = subprocess.Popen(["npx", "vite", "preview", "--port", "4173", "--strictPort"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
try:
    for _ in range(40):
        try:
            import urllib.request; urllib.request.urlopen(BASE); break
        except Exception: time.sleep(0.5)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 800}, locale="ur-PK")
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        online = {"v": True}
        today = date.today()
        def handle(route):
            if not online["v"]: return route.abort()
            url = route.request.url
            m = re.search(r"past_days=(\d+)", url); pdays = int(m.group(1)) if m else 10
            route.fulfill(status=200, content_type="application/json", body=json.dumps(synth_payload(today - timedelta(days=pdays), today + timedelta(days=6))))
        ctx.route(re.compile(r"https://(api|archive-api)\.open-meteo\.com/.*"), handle)
        tiles = []
        def tile(r):
            tiles.append(r.request.url); r.abort()
        ctx.route(re.compile(r"https://(.*tile\.openstreetmap\.org|server\.arcgisonline\.com)/.*"), tile)

        page.goto(BASE); page.wait_for_selector("text=زمین دوست")
        check("Urdu default and RTL", page.evaluate("document.documentElement.dir") == "rtl" and page.evaluate("document.documentElement.lang") == "ur")
        check("welcome message in Urdu shown when no field", page.locator("text=پہلے اپنے کھیت کی حد").count() > 0)
        page.click("text=کھیت شامل کریں"); page.wait_for_selector(".leaflet-container")
        box = page.locator(".leaflet-container").bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        for dx, dy in [(-40, -30), (40, -30), (40, 30), (-40, 30)]: page.mouse.click(cx + dx, cy + dy)
        page.wait_for_selector("text=/[0-9.]+ ایکڑ/")
        area_txt = page.locator("text=/[0-9.]+ ایکڑ \\(/").first.inner_text()
        check("area computed from drawn polygon (acres shown first)", float(re.search(r"([0-9.]+) ایکڑ", area_txt).group(1)) > 1, area_txt)
        check("satellite imagery is the default basemap", any("arcgisonline" in u for u in tiles) and not any("openstreetmap" in u for u in tiles), tiles[:2])
        page.click("text=🗺️ سڑکیں"); page.wait_for_timeout(800)
        check("street map toggle works", any("openstreetmap" in u for u in tiles))
        for _ in range(5):
            page.click("text=آگے")
        page.fill("input", "Test Field")
        page.click("text=✅ شروع کریں"); page.wait_for_selector("text=/اعتماد/", state="attached", timeout=30000)
        check("advisory screen shows confidence and estimate disclaimer", page.locator("text=یہ اندازہ ہے، پیمائش نہیں۔").count() > 0)
        check("weather source attribution shown", page.locator("text=Open-Meteo").count() > 0)
        check("satellite honestly shown as not connected", page.locator("text=سیٹلائٹ مشاہدات ابھی منسلک نہیں ہیں").count() > 0)
        check("no uncaught page errors", not errors, errors[:1])
        page.screenshot(path="/tmp/zd_home_ur.png", full_page=True)
        # report irrigation
        page.click("button:has-text(\"نہیں\") >> nth=0")
        page.wait_for_timeout(800)
        page.click("text=English"); page.wait_for_selector("text=Did you irrigate your field today?")
        check("English switch flips to LTR", page.evaluate("document.documentElement.dir") == "ltr")
        page.screenshot(path="/tmp/zd_home_en.png", full_page=True)
        page.click("nav >> text=History"); page.wait_for_selector("text=Irrigation history")
        check("history shows the reported 'No' and 14-day balance", page.locator("text=Last 14 days water balance").count() > 0)
        page.click("nav >> text=More"); page.click("text=💰 Savings"); page.wait_for_selector("text=Water and money savings (estimate)")
        check("savings refuses to claim without baseline", page.locator("text=A savings estimate is not possible yet.").count() > 0)
        page.click("nav >> text=More"); page.click("text=ℹ️ About"); page.wait_for_selector("text=Model and data quality")
        check("about page lists crop params with verification status", page.locator("text=needs_verification").count() > 0)
        # deep link refresh
        page.goto(BASE + "#/history"); page.reload(); page.wait_for_selector("text=Irrigation history")
        check("refresh on deep route keeps working (hash routing)", True)
        # offline: provider unreachable -> cached copy, clearly labelled
        online["v"] = False
        page.goto(BASE); page.reload(); page.wait_for_selector("text=Saved copy (no internet)", timeout=30000)
        check("offline shows saved weather copy label and still gives advice", page.locator("text=This is an estimate, not a measurement.").count() > 0)
        # PWA manifest
        mf = page.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r=>r.json())")
        check("PWA manifest start_url under GitHub Pages base", mf["start_url"] == "/zameendost/" and mf["display"] == "standalone", mf.get("start_url"))
        b.close()
finally:
    srv.terminate()
print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
