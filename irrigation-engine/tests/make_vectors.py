"""Generate cross-implementation test vectors from the Python reference.

ALL WEATHER HERE IS SYNTHETIC TEST FIXTURE DATA. It is deterministic, plausible
for a Rawalpindi winter, and must never be shown to farmers or mixed with real data.
These vectors prove the TypeScript and Python engines agree; they do not validate
the model against field measurements.
"""
import json, math, sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python-reference"))
from zameendost_engine import core as c  # noqa: E402


def synth_day(d: date, rain=0.0, prob=None, tmax_shift=0.0):
    doy = d.timetuple().tm_yday
    season = math.cos(2 * math.pi * (doy - 20) / 365.0)  # cool near day 20
    tmax = 22 - 8 * season + tmax_shift
    tmin = tmax - 11
    w = {"date": d.isoformat(), "tmax": round(tmax, 2), "tmin": round(tmin, 2), "rh_mean": 55.0,
         "wind_10m": 2.5, "rs": round(12 - 4 * season, 2), "precip": rain}
    if prob is not None:
        w["precip_prob"] = prob
    return w


def build_weather(start: date, end: date, rain_map=None, drop=()):
    rain_map = rain_map or {}
    out = []
    d = start
    while d <= end:
        if d.isoformat() not in drop:
            r = rain_map.get(d.isoformat(), (0.0, None))
            out.append(synth_day(d, r[0], r[1]))
        d += timedelta(days=1)
    return out


FIELD = {"crop": "wheat", "planting_date": "2025-11-15", "soil": "loam", "irrigation_method": "flood",
         "lat": 33.6, "lon": 73.05, "elevation": 508, "area_ha": 2.0, "soil_confirmed": True}

scenarios = []


def add(name, field, weather, log, today):
    adv = c.advise(field, weather, log, date.fromisoformat(today))
    scenarios.append({"name": name, "field": field, "weather": weather, "irrigation_log": log, "today": today, "expected": adv})


T = "2026-01-20"
dry = build_weather(date(2025, 11, 15), date(2026, 1, 23))
add("dry_no_reports", FIELD, dry, [], T)
add("dry_with_recent_report", FIELD, dry, [{"date": "2026-01-19", "status": "no"}], T)
irr = [{"date": "2025-12-20", "status": "yes", "gross_depth_mm": 80}, {"date": "2026-01-19", "status": "no"}]
add("irrigated_dec20_80mm", FIELD, dry, irr, T)
rainy = build_weather(date(2025, 11, 15), date(2026, 1, 23), {"2026-01-21": (18.0, 80), "2026-01-22": (6.0, 70)})
add("rain_forecast_80pct", FIELD, rainy, [{"date": "2026-01-19", "status": "no"}], T)
rainy_lowp = build_weather(date(2025, 11, 15), date(2026, 1, 23), {"2026-01-21": (18.0, 30)})
add("rain_forecast_30pct", FIELD, rainy_lowp, [{"date": "2026-01-19", "status": "no"}], T)
heavy = build_weather(date(2025, 11, 15), date(2026, 1, 23), {"2026-01-15": (60.0, None)})
add("heavy_rain_jan15", FIELD, heavy, [{"date": "2026-01-19", "status": "no"}], T)
gaps = build_weather(date(2025, 11, 15), date(2026, 1, 23), drop={"2026-01-10", "2026-01-11", "2026-01-12"})
add("weather_gaps", FIELD, gaps, [{"date": "2026-01-19", "status": "no"}], T)
many = build_weather(date(2025, 11, 15), date(2026, 1, 23), drop={f"2026-01-{x:02d}" for x in range(12, 21)})
add("too_many_gaps", FIELD, many, [], T)
add("unknown_soil", {**FIELD, "soil": "granite"}, dry, [], T)
add("future_planting", {**FIELD, "planting_date": "2026-03-01"}, dry, [], T)
add("season_ended", FIELD, build_weather(date(2025, 11, 15), date(2026, 5, 30)), [], "2026-05-25")
add("assumed_depth_yes", FIELD, dry, [{"date": "2026-01-10", "status": "yes"}, {"date": "2026-01-19", "status": "no"}], T)
add("drip_field", {**FIELD, "irrigation_method": "drip"}, dry, [{"date": "2026-01-19", "status": "no"}], T)
add("stage_transition_mid", FIELD, build_weather(date(2025, 11, 15), date(2026, 3, 30)), [{"date": "2026-03-04", "status": "no"}], "2026-03-04")


feb = build_weather(date(2025, 11, 15), date(2026, 2, 13))
rep = lambda d: [{"date": d, "status": "no"}]
add("stress_dry_recommended", FIELD, feb, rep("2026-02-10"), "2026-02-10")
add("approaching_raw", FIELD, feb, rep("2026-02-08"), "2026-02-08")
feb_rain80 = build_weather(date(2025, 11, 15), date(2026, 2, 13), {"2026-02-11": (30.0, 85)})
add("stress_wait_for_rain_85pct", FIELD, feb_rain80, rep("2026-02-10"), "2026-02-10")
feb_rain30 = build_weather(date(2025, 11, 15), date(2026, 2, 13), {"2026-02-11": (30.0, 30)})
add("stress_rain_unlikely_30pct", FIELD, feb_rain30, rep("2026-02-10"), "2026-02-10")
feb_small = build_weather(date(2025, 11, 15), date(2026, 2, 13), {"2026-02-11": (4.0, 90)})
add("stress_small_rain_not_enough", FIELD, feb_small, rep("2026-02-10"), "2026-02-10")
add("stress_stale_reports_low_conf", {**FIELD, "soil_confirmed": False}, feb, [{"date": "2026-01-25", "status": "no"}], "2026-02-10")

units = {
    "et0": [
        {"in": {"tmax": 21.5, "tmin": 12.3, "lat": 50.8, "elevation": 100, "doy": 187, "rs": 22.07, "rh_mean": None, "u2": 2.078, "_ea_from": [84, 63]}},
        {"in": {"tmax": 24.0, "tmin": 12.0, "lat": 33.6, "elevation": 508, "doy": 20, "rs": 11.0, "rh_mean": 55.0, "u10": 2.5}},
        {"in": {"tmax": 41.0, "tmin": 27.0, "lat": 33.6, "elevation": 508, "doy": 170, "rs": 27.0, "rh_mean": 35.0, "u10": 3.0}},
        {"in": {"tmax": 30.0, "tmin": 18.0, "lat": 33.6, "elevation": 508, "doy": 100}},
    ],
    "kc": [{"crop": "wheat", "dap": d} for d in (0, 29, 30, 52, 75, 100, 124, 125, 140, 154, 155, 200)],
    "root": [{"crop": "maize", "dap": d} for d in (0, 10, 27, 55, 90)],
    "steps": [
        {"dr_prev": 20, "etc": 4, "rain": 0, "irrigation_net": 0, "taw": 130, "raw": 71.5, "runoff_fraction": 0.12, "et0": 4},
        {"dr_prev": 90, "etc": 4, "rain": 0, "irrigation_net": 0, "taw": 130, "raw": 71.5, "runoff_fraction": 0.12, "et0": 4},
        {"dr_prev": 40, "etc": 3, "rain": 60, "irrigation_net": 0, "taw": 130, "raw": 71.5, "runoff_fraction": 0.12, "et0": 3},
        {"dr_prev": 40, "etc": 3, "rain": 0.4, "irrigation_net": 0, "taw": 130, "raw": 71.5, "runoff_fraction": 0.12, "et0": 3},
        {"dr_prev": 40, "etc": 3, "rain": 0, "irrigation_net": 60, "taw": 130, "raw": 71.5, "runoff_fraction": 0.12, "et0": 3},
        {"dr_prev": 129, "etc": 6, "rain": 0, "irrigation_net": 0, "taw": 130, "raw": 71.5, "runoff_fraction": 0.12, "et0": 6},
    ],
}
for u in units["et0"]:
    i = u["in"]
    ea_from = i.pop("_ea_from", None)
    if ea_from:
        ea = (c.sat_vp(i["tmin"]) * ea_from[0] / 100 + c.sat_vp(i["tmax"]) * ea_from[1] / 100) / 2
        i["rh_mean"] = 100 * ea / ((c.sat_vp(i["tmax"]) + c.sat_vp(i["tmin"])) / 2)
    u["out"] = c.et0_penman_monteith(**i)
for u in units["kc"]:
    u["out"] = list(c.kc_and_stage(c.CROPS[u["crop"]], u["dap"]))
for u in units["root"]:
    u["out"] = c.root_depth(c.CROPS[u["crop"]], u["dap"])
for u in units["steps"]:
    u["out"] = c.water_balance_step(u["dr_prev"], etc=u["etc"], rain=u["rain"], irrigation_net=u["irrigation_net"],
                                    taw=u["taw"], raw=u["raw"], runoff_fraction=u["runoff_fraction"], et0=u["et0"])

out = Path(__file__).parent / "vectors.json"
out.write_text(json.dumps({"_note": "SYNTHETIC FIXTURES generated by python-reference; see make_vectors.py", "units": units, "scenarios": scenarios}, indent=1))
print("wrote", out, len(scenarios), "scenarios")
for s in scenarios:
    e = s["expected"]
    print(f'{s["name"]:26s} {e["status"]:24s} dr={e.get("depletion_mm")} conf={e["confidence"]["level"]}')
