"""Integration test against a local `wrangler dev` (http://localhost:8787) with migrations applied.
Run: python3 test/integration.py   (uses synthetic accounts; local DB only)"""
import json, sys, uuid, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787"
fails = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("content-type", "application/json")
    if token: req.add_header("authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name, extra if not cond else "")
    if not cond: fails.append(name)


RING = [[73.040, 33.600], [73.044, 33.600], [73.044, 33.603], [73.040, 33.603], [73.040, 33.600]]
FIELD = {"name": "Test field", "geometry": {"type": "Polygon", "coordinates": [RING]}, "crop": "wheat", "planting_date": "2025-11-15",
         "soil": "loam", "irrigation_method": "flood", "water_source": "electric_tubewell", "elevation_m": 508}

a = f"a{uuid.uuid4().hex[:8]}@example.test"; b = f"b{uuid.uuid4().hex[:8]}@example.test"
s, ra = call("POST", "/api/auth/register", {"email": a, "password": "correct horse 1", "language": "ur"}); check("register A", s == 201)
s, rb = call("POST", "/api/auth/register", {"email": b, "password": "battery staple 2"}); check("register B", s == 201)
s, _ = call("POST", "/api/auth/register", {"email": a, "password": "correct horse 1"}); check("duplicate email rejected", s == 409)
s, _ = call("POST", "/api/auth/register", {"email": "x@example.test", "password": "short"}); check("short password rejected", s == 400)
s, _ = call("POST", "/api/auth/login", {"email": a, "password": "wrong password"}); check("bad login 401", s == 401)
s, lg = call("POST", "/api/auth/login", {"email": a, "password": "correct horse 1"}); check("login ok", s == 200 and "token" in lg)
ta, tb = ra["token"], rb["token"]

s, _ = call("GET", "/api/fields"); check("fields require auth", s == 401)
s, _ = call("GET", "/api/fields", token="not.a.jwt"); check("garbage token rejected", s == 401)
s, fa = call("POST", "/api/fields", FIELD, ta); check("create field", s == 201, fa)
area = fa.get("field", {}).get("area_ha")
# 0.004 deg lon * 0.003 deg lat at 33.6N  ~ 370 m * 333 m ~ 12.3 ha
check("area computed server-side (~12.3 ha)", area is not None and 11.8 < area < 12.8, area)
fid = fa["field"]["id"]
s, l = call("GET", "/api/fields", token=tb); check("user B sees no fields of A", s == 200 and l["fields"] == [])
s, _ = call("DELETE", f"/api/fields/{fid}", token=tb); check("user B cannot delete A's field", s == 404)
s, _ = call("PUT", f"/api/fields/{fid}/reports", {"date": "2026-01-19", "status": "no"}, tb); check("user B cannot report on A's field", s == 404)
s, _ = call("PUT", f"/api/fields/{fid}/reports", {"date": "2026-01-19", "status": "yes", "gross_depth_mm": 60}, ta); check("A reports irrigation", s == 200)
s, _ = call("PUT", f"/api/fields/{fid}/reports", {"date": "2026-01-19", "status": "partial"}, ta); check("report upsert", s == 200)
s, r = call("GET", f"/api/fields/{fid}/reports", token=ta); check("one report per day", s == 200 and len(r["reports"]) == 1 and r["reports"][0]["status"] == "partial")
s, _ = call("PUT", f"/api/fields/{fid}/reports", {"date": "2026-01-19", "status": "maybe"}, ta); check("bad status rejected", s == 400)

bad = lambda g, **kw: call("POST", "/api/fields", {**FIELD, **({"geometry": g} if g is not None else {}), **kw}, ta)[0]
check("not a polygon", bad({"type": "Point", "coordinates": [73, 33.6]}) == 400)
check("unclosed ring", bad({"type": "Polygon", "coordinates": [RING[:-1]]}) == 400)
check("bow-tie rejected", bad({"type": "Polygon", "coordinates": [[[73.04, 33.6], [73.044, 33.603], [73.044, 33.6], [73.04, 33.603], [73.04, 33.6]]]}) == 400)
check("outside supported region", bad({"type": "Polygon", "coordinates": [[[67.0, 24.8], [67.004, 24.8], [67.004, 24.803], [67.0, 24.803], [67.0, 24.8]]]}) == 400)
check("tiny area rejected", bad({"type": "Polygon", "coordinates": [[[73.04, 33.6], [73.04001, 33.6], [73.04001, 33.60001], [73.04, 33.60001], [73.04, 33.6]]]}) == 400)
check("unknown crop rejected", bad(None, crop="banana") == 400)
check("unknown soil rejected", bad(None, soil="granite") == 400)

s, _ = call("GET", "/api/weather?u=https%3A%2F%2Fevil.example%2Fx", token=None); check("weather proxy blocks other hosts", s == 400)
s, _ = call("GET", "/api/weather?u=" + urllib.request.quote("https://api.open-meteo.com/v1/forecast?latitude=24.8&longitude=67.0")); check("weather proxy blocks outside region", s == 400)

s, _ = call("DELETE", "/api/account", token=tb); check("delete account B", s == 200)
s, _ = call("GET", "/api/fields", token=ta); check("A unaffected", s == 200)
print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
