"""ZameenDost irrigation engine - Python reference implementation.

FAO-56 (Allen et al., 1998) Penman-Monteith ET0, single-Kc ETc and a daily
root-zone soil-water balance. Units: mm, MJ m-2 day-1, degC, kPa, m s-1, m, ha.
The TypeScript engine mirrors this file; tests/vectors.json keeps both aligned.
"""
from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path

PARAM_ROOT = Path(__file__).resolve().parents[2]
GSC = 0.0820  # MJ m-2 min-1
SIGMA = 4.903e-9  # MJ K-4 m-2 day-1
ALBEDO = 0.23


def load_params():
    crops = json.loads((PARAM_ROOT / "crop-parameters" / "crops.json").read_text())["crops"]
    soils = json.loads((PARAM_ROOT / "soil-parameters" / "soils.json").read_text())["soils"]
    eff = json.loads((PARAM_ROOT / "crop-parameters" / "efficiency.json").read_text())["application_efficiency"]
    return crops, soils, eff


CROPS, SOILS, EFFICIENCY = load_params()


# ---------------------------------------------------------------- ET0 (FAO-56)
def sat_vp(t):
    return 0.6108 * math.exp(17.27 * t / (t + 237.3))


def slope_svp(t):
    return 4098.0 * sat_vp(t) / (t + 237.3) ** 2


def pressure(z):
    return 101.3 * ((293.0 - 0.0065 * z) / 293.0) ** 5.26


def wind_10m_to_2m(u10):
    return u10 * 4.87 / math.log(67.8 * 10.0 - 5.42)


def day_of_year(d: date) -> int:
    return d.timetuple().tm_yday


def extraterrestrial_radiation(lat_deg, doy):
    phi = math.radians(lat_deg)
    dr = 1.0 + 0.033 * math.cos(2 * math.pi * doy / 365.0)
    delta = 0.409 * math.sin(2 * math.pi * doy / 365.0 - 1.39)
    x = max(-1.0, min(1.0, -math.tan(phi) * math.tan(delta)))
    ws = math.acos(x)
    return (24 * 60 / math.pi) * GSC * dr * (
        ws * math.sin(phi) * math.sin(delta) + math.cos(phi) * math.cos(delta) * math.sin(ws)
    )


def et0_penman_monteith(*, tmax, tmin, lat, elevation, doy, rs=None, rh_mean=None, u2=None, u10=None):
    """Daily FAO-56 PM ET0 (mm/day). Missing inputs are estimated and reported."""
    estimated = []
    tmean = (tmax + tmin) / 2.0
    ra = extraterrestrial_radiation(lat, doy)
    if rs is None:
        rs = 0.16 * math.sqrt(max(tmax - tmin, 0.0)) * ra  # Hargreaves, interior krs
        estimated.append("rs_hargreaves")
    if u2 is None:
        if u10 is not None:
            u2 = wind_10m_to_2m(u10)
        else:
            u2 = 2.0
            estimated.append("wind_default_2ms")
    es = (sat_vp(tmax) + sat_vp(tmin)) / 2.0
    if rh_mean is None:
        ea = sat_vp(tmin)  # dew point ~ Tmin
        estimated.append("humidity_from_tmin")
    else:
        ea = max(0.0, min(100.0, rh_mean)) / 100.0 * ((sat_vp(tmax) + sat_vp(tmin)) / 2.0)
    p = pressure(elevation)
    gamma = 0.000665 * p
    delta = slope_svp(tmean)
    rns = (1 - ALBEDO) * rs
    rso = (0.75 + 2e-5 * elevation) * ra
    ratio = 0.8 if rso <= 0 else max(0.3, min(1.0, rs / rso))
    rnl = SIGMA * (((tmax + 273.16) ** 4 + (tmin + 273.16) ** 4) / 2.0) * (0.34 - 0.14 * math.sqrt(max(ea, 0.0))) * (1.35 * ratio - 0.35)
    rn = rns - rnl
    num = 0.408 * delta * rn + gamma * (900.0 / (tmean + 273.0)) * u2 * (es - ea)
    den = delta + gamma * (1 + 0.34 * u2)
    return {"et0": max(0.0, num / den), "estimated": estimated, "rn": rn, "ra": ra, "rs": rs}


# ---------------------------------------------------------------- crop + soil
def kc_and_stage(crop: dict, dap: int):
    s = crop["stages_days"]
    ini, dev, mid, late = s["ini"], s["dev"], s["mid"], s["late"]
    if dap < 0:
        return None, "not_planted"
    if dap < ini:
        return crop["kc_ini"], "initial"
    if dap < ini + dev:
        f = (dap - ini) / dev
        return crop["kc_ini"] + f * (crop["kc_mid"] - crop["kc_ini"]), "development"
    if dap < ini + dev + mid:
        return crop["kc_mid"], "mid_season"
    if dap < ini + dev + mid + late:
        f = (dap - ini - dev - mid) / late
        return crop["kc_mid"] + f * (crop["kc_end"] - crop["kc_mid"]), "late_season"
    return None, "season_ended"


def root_depth(crop: dict, dap: int):
    s = crop["stages_days"]
    span = s["ini"] + s["dev"]
    f = max(0.0, min(1.0, dap / span))
    return crop["root_depth_ini_m"] + f * (crop["root_depth_max_m"] - crop["root_depth_ini_m"])


def taw_mm(theta_fc, theta_wp, zr_m):
    return 1000.0 * (theta_fc - theta_wp) * zr_m


def raw_mm(p, taw):
    return p * taw


def ks_factor(dr, taw, raw):
    if dr <= raw:
        return 1.0
    return max(0.0, (taw - dr) / (taw - raw))


def water_balance_step(dr_prev, *, etc, rain, irrigation_net, taw, raw, runoff_fraction, et0):
    """One day of FAO-56 eq. 85 with Ks, rain threshold and runoff heuristics."""
    ks = ks_factor(dr_prev, taw, raw)
    etc_adj = ks * etc
    threshold = 0.2 * et0
    if rain < threshold:
        infiltration, runoff = 0.0, 0.0
    else:
        runoff = runoff_fraction * rain
        infiltration = rain - runoff
    dr_raw = dr_prev - infiltration - irrigation_net + etc_adj
    dp = max(0.0, -dr_raw)
    dr = min(max(dr_raw, 0.0), taw)
    return {"dr": dr, "ks": ks, "etc_adj": etc_adj, "runoff": runoff, "deep_percolation": dp, "infiltration": infiltration}


# ---------------------------------------------------------------- water maths
def mm_to_m3(depth_mm, area_ha):
    return depth_mm * area_ha * 10.0


def gross_depth(net_mm, efficiency):
    return net_mm / efficiency


def pump_power_kw(discharge_m3h, head_m, total_efficiency):
    return (discharge_m3h / 3600.0) * 9.81 * head_m / total_efficiency


def electricity_cost(power_kw, hours, tariff_per_kwh):
    return power_kw * hours * tariff_per_kwh


# ---------------------------------------------------------------- season sim
def _weather_et0(w, lat, elev):
    r = et0_penman_monteith(
        tmax=w["tmax"], tmin=w["tmin"], lat=lat, elevation=elev,
        doy=day_of_year(date.fromisoformat(w["date"])),
        rs=w.get("rs"), rh_mean=w.get("rh_mean"), u10=w.get("wind_10m"),
    )
    return r


def _usable(w):
    return w is not None and w.get("tmax") is not None and w.get("tmin") is not None and w.get("precip") is not None


def simulate(field: dict, weather: list[dict], irrigation_log: list[dict], through: date):
    """Run the daily balance from planting to `through` (inclusive)."""
    crop = CROPS[field["crop"]]
    soil = SOILS[field["soil"]]
    eff = field.get("application_efficiency") or EFFICIENCY[field["irrigation_method"]]
    planting = date.fromisoformat(field["planting_date"])
    by_date = {w["date"]: w for w in weather}
    log = {e["date"]: e for e in irrigation_log}
    dr = field.get("initial_depletion_mm")
    initial_assumed = dr is None
    days, gaps, assumed_irrigation, recent_et0 = [], 0, 0, []
    d = planting
    first = True
    while d <= through:
        key = d.isoformat()
        dap = (d - planting).days
        kc, stage = kc_and_stage(crop, dap)
        if kc is None:
            break
        zr = root_depth(crop, dap)
        taw = taw_mm(soil["theta_fc"], soil["theta_wp"], zr)
        raw = raw_mm(crop["p"], taw)
        if first:
            dr = 0.0 if initial_assumed else dr
            first = False
        w = by_date.get(key)
        est = []
        if _usable(w):
            r = _weather_et0(w, field["lat"], field["elevation"])
            et0, est = r["et0"], list(r["estimated"])
            recent_et0.append(et0)
            rain = w["precip"]
        else:
            gaps += 1
            et0 = sum(recent_et0[-7:]) / len(recent_et0[-7:]) if recent_et0 else None
            rain = 0.0
            est.append("weather_gap_filled_with_recent_mean_et0")
            if et0 is None:
                d += timedelta(days=1)
                continue
        entry = log.get(key)
        irr_net, irr_note = 0.0, "no_report" if entry is None else entry["status"]
        if entry is not None and entry["status"] in ("yes", "partial"):
            depth = entry.get("gross_depth_mm")
            if depth is not None:
                irr_net = depth * eff
            else:
                irr_net = dr if entry["status"] == "yes" else 0.5 * dr
                assumed_irrigation += 1
                irr_note = irr_note + "_depth_assumed"
        etc = et0 * kc
        step = water_balance_step(dr, etc=etc, rain=rain, irrigation_net=irr_net, taw=taw, raw=raw,
                                  runoff_fraction=soil["runoff_fraction"], et0=et0)
        dr = step["dr"]
        days.append({"date": key, "dap": dap, "stage": stage, "kc": kc, "et0": et0, "etc": etc, "rain": rain,
                     "irrigation_net": irr_net, "irrigation_note": irr_note, "dr": dr, "taw": taw, "raw": raw,
                     "zr": zr, "ks": step["ks"], "deep_percolation": step["deep_percolation"],
                     "estimated": est})
        d += timedelta(days=1)
    return {"days": days, "weather_gaps": gaps, "initial_assumed": initial_assumed,
            "assumed_irrigation_events": assumed_irrigation, "efficiency": eff}


def project(state_dr, field, forecast, start: date, n=3):
    crop = CROPS[field["crop"]]
    soil = SOILS[field["soil"]]
    planting = date.fromisoformat(field["planting_date"])
    out, dr = [], state_dr
    fmap = {w["date"]: w for w in forecast}
    for i in range(1, n + 1):
        d = start + timedelta(days=i)
        w = fmap.get(d.isoformat())
        if not _usable(w):
            break
        dap = (d - planting).days
        kc, _ = kc_and_stage(crop, dap)
        if kc is None:
            break
        zr = root_depth(crop, dap)
        taw = taw_mm(soil["theta_fc"], soil["theta_wp"], zr)
        raw = raw_mm(crop["p"], taw)
        et0 = _weather_et0(w, field["lat"], field["elevation"])["et0"]
        step = water_balance_step(dr, etc=et0 * kc, rain=w["precip"], irrigation_net=0.0, taw=taw, raw=raw,
                                  runoff_fraction=soil["runoff_fraction"], et0=et0)
        dr = step["dr"]
        out.append({"date": d.isoformat(), "dr": dr, "rain": w["precip"], "infiltration": step["infiltration"],
                    "raw": raw, "taw": taw, "prob": w.get("precip_prob")})
    return out


# ---------------------------------------------------------------- advisory
def confidence(field, sim, today_has_weather, days_since_report):
    score, pen = 1.0, []
    if not field.get("soil_confirmed", False):
        score -= 0.15; pen.append("soil_type_not_confirmed")
    if sim["initial_assumed"]:
        score -= 0.15; pen.append("initial_depletion_assumed")
    if sim["assumed_irrigation_events"]:
        score -= 0.10; pen.append("irrigation_depth_assumed")
    if sim["weather_gaps"]:
        score -= min(0.3, 0.05 * sim["weather_gaps"]); pen.append("weather_gaps")
    if days_since_report is None or days_since_report > 3:
        score -= min(0.3, 0.05 * (days_since_report if days_since_report is not None else 6)); pen.append("farmer_report_stale")
    if not today_has_weather:
        score -= 0.2; pen.append("no_current_weather")
    score = max(0.0, round(score, 3))
    level = "high" if score >= 0.75 else "medium" if score >= 0.5 else "low"
    return {"score": score, "level": level, "penalties": pen}


def advise(field: dict, weather: list[dict], irrigation_log: list[dict], today: date):
    missing = []
    for k in ("crop", "planting_date", "soil", "irrigation_method", "lat", "lon", "elevation", "area_ha"):
        if field.get(k) is None:
            missing.append(k)
    if field.get("crop") not in CROPS:
        missing.append("crop_unknown")
    if field.get("soil") not in SOILS:
        missing.append("soil_unknown")
    base = {"date": today.isoformat(), "missing_or_estimated": list(missing)}
    if missing:
        return {**base, "status": "insufficient_information", "reasons": ["missing_inputs"], "confidence": {"score": 0.0, "level": "low", "penalties": ["missing_inputs"]}}
    planting = date.fromisoformat(field["planting_date"])
    if planting > today:
        return {**base, "status": "insufficient_information", "reasons": ["planting_date_in_future"], "confidence": {"score": 0.0, "level": "low", "penalties": ["planting_date_in_future"]}}
    today_w = next((w for w in weather if w["date"] == today.isoformat()), None)
    sim = simulate(field, weather, irrigation_log, today)
    if not sim["days"] or sim["days"][-1]["date"] != today.isoformat():
        reason = "season_ended" if sim["days"] else "no_weather_data"
        return {**base, "status": "insufficient_information", "reasons": [reason], "confidence": {"score": 0.0, "level": "low", "penalties": [reason]}}
    recent = sim["days"][-10:]
    if sum(1 for d in recent if "weather_gap_filled_with_recent_mean_et0" in d["estimated"]) > 5:
        return {**base, "status": "insufficient_information", "reasons": ["too_many_weather_gaps"], "confidence": {"score": 0.0, "level": "low", "penalties": ["weather_gaps"]}}

    t = sim["days"][-1]
    dr, taw, raw = t["dr"], t["taw"], t["raw"]
    proj = project(dr, field, weather, today, 3)
    reported = [e["date"] for e in irrigation_log if e["date"] <= today.isoformat()]
    days_since = (today - date.fromisoformat(max(reported))).days if reported else None
    conf = confidence(field, sim, _usable(today_w), days_since)
    estimated = sorted(set(missing + [x for d in sim["days"] for x in d["estimated"]]))
    if sim["initial_assumed"]:
        estimated.append("initial_depletion_assumed_field_capacity")
    if not field.get("soil_confirmed", False):
        estimated.append("soil_parameters_from_texture_class")

    # decision
    net = dr
    eff = sim["efficiency"]
    status, reasons = "no_irrigation_needed", []
    stress_now = dr >= raw
    first_raw = next((i for i, p in enumerate(proj) if p["dr"] >= p["raw"]), None)
    rain48 = sum(p["infiltration"] for p in proj[:2])
    # rain only counts as a reason to wait if its probability is known and >= 60 %
    rainy = [p for p in proj[:2] if p["rain"] > 0]
    rain_prob_ok = bool(rainy) and all(p["prob"] is not None and p["prob"] >= 60 for p in rainy)
    relieved = any(p["infiltration"] > 0 and p["dr"] < p["raw"] for p in proj[:2])
    if stress_now:
        if relieved and rain_prob_ok and dr < raw + 0.5 * (taw - raw):
            status, reasons = "wait_for_rain", ["depletion_above_raw", "useful_rain_forecast"]
        else:
            status, reasons = "irrigation_recommended", ["depletion_above_raw"]
    elif first_raw is not None:
        status, reasons = "irrigation_approaching", ["raw_reached_within_3_days"]
    elif dr >= 0.6 * raw:
        status, reasons = "monitor", ["depletion_moderate"]
    else:
        reasons = ["depletion_low"]
    if conf["level"] == "low" and status == "irrigation_recommended":
        reasons.append("low_confidence_verify_in_field")

    gross = gross_depth(net, eff) if status in ("irrigation_recommended", "irrigation_approaching") else None
    return {
        **base,
        "status": status, "reasons": reasons,
        "stage": t["stage"], "dap": t["dap"], "kc": t["kc"], "root_depth_m": t["zr"],
        "et0_mm": t["et0"], "etc_mm": t["etc"], "rain_today_mm": t["rain"],
        "depletion_mm": dr, "depletion_fraction_of_taw": dr / taw, "taw_mm": taw, "raw_mm": raw, "ks": t["ks"],
        "forecast": proj, "forecast_effective_rain_48h_mm": rain48,
        "net_irrigation_mm": net if gross is not None else None,
        "gross_irrigation_mm": gross, "application_efficiency": eff,
        "volume_m3": mm_to_m3(gross, field["area_ha"]) if gross is not None else None,
        "confidence": conf, "missing_or_estimated": estimated,
        "days_since_farmer_report": days_since,
    }
