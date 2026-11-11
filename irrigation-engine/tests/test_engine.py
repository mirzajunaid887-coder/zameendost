import json, math, sys
from datetime import date
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python-reference"))
from zameendost_engine import core as c  # noqa: E402

VEC = json.loads((Path(__file__).parent / "vectors.json").read_text())


def test_et0_matches_fao56_example_18_brussels():
    # FAO-56 Example 18: published ET0 = 3.88 mm/day (inputs as recalled; verify against the FAO-56 PDF).
    ea = (c.sat_vp(12.3) * 0.84 + c.sat_vp(21.5) * 0.63) / 2
    es = (c.sat_vp(21.5) + c.sat_vp(12.3)) / 2
    r = c.et0_penman_monteith(tmax=21.5, tmin=12.3, lat=50.8, elevation=100, doy=187, rs=22.07, rh_mean=100 * ea / es, u2=2.078)
    assert r["et0"] == pytest.approx(3.88, abs=0.02)
    assert r["ra"] == pytest.approx(41.09, abs=0.05)
    assert r["rn"] == pytest.approx(13.28, abs=0.05)


def test_et0_reports_estimated_inputs_when_variables_missing():
    r = c.et0_penman_monteith(tmax=30, tmin=18, lat=33.6, elevation=508, doy=100)
    assert set(r["estimated"]) == {"rs_hargreaves", "wind_default_2ms", "humidity_from_tmin"}
    assert 2.0 < r["et0"] < 8.0


def test_taw_raw_hand_calculation():
    taw = c.taw_mm(0.25, 0.12, 1.0)
    assert taw == pytest.approx(130.0)
    assert c.raw_mm(0.55, taw) == pytest.approx(71.5)


def test_unit_conversions():
    assert c.mm_to_m3(1, 1) == 10
    assert c.mm_to_m3(25, 2.0) == 500
    assert c.gross_depth(30, 0.6) == pytest.approx(50)
    assert c.electricity_cost(5.0, 4.0, 40.0) == 800.0
    assert c.pump_power_kw(36, 30, 0.5) == pytest.approx(0.01 * 9.81 * 30 / 0.5)


def test_kc_curve_and_stages():
    wheat = c.CROPS["wheat"]
    assert c.kc_and_stage(wheat, 0) == (0.40, "initial")
    kc, st = c.kc_and_stage(wheat, 52)  # halfway through development (30 + 22.5)
    assert st == "development" and kc == pytest.approx(0.40 + 0.5 * (1.15 - 0.40), abs=0.01)
    assert c.kc_and_stage(wheat, 100) == (1.15, "mid_season")
    assert c.kc_and_stage(wheat, 155)[1] == "season_ended"
    assert c.kc_and_stage(wheat, -1)[1] == "not_planted"


def test_root_depth_grows_then_caps():
    maize = c.CROPS["maize"]
    assert c.root_depth(maize, 0) == pytest.approx(0.25)
    assert c.root_depth(maize, 200) == pytest.approx(1.0)


def test_ks_reduces_et_beyond_raw():
    assert c.ks_factor(50, 130, 71.5) == 1.0
    assert c.ks_factor(100.75, 130, 71.5) == pytest.approx(0.5)
    assert c.ks_factor(130, 130, 71.5) == 0.0


def test_no_rain_depletion_grows_by_etc():
    s = c.water_balance_step(20, etc=4, rain=0, irrigation_net=0, taw=130, raw=71.5, runoff_fraction=0.12, et0=4)
    assert s["dr"] == pytest.approx(24.0) and s["deep_percolation"] == 0


def test_heavy_rain_causes_runoff_and_deep_percolation():
    s = c.water_balance_step(40, etc=3, rain=60, irrigation_net=0, taw=130, raw=71.5, runoff_fraction=0.12, et0=3)
    assert s["runoff"] == pytest.approx(7.2)
    assert s["dr"] == 0.0
    assert s["deep_percolation"] == pytest.approx((60 - 7.2) - 40 - 3)


def test_tiny_rain_is_ignored():
    s = c.water_balance_step(40, etc=3, rain=0.4, irrigation_net=0, taw=130, raw=71.5, runoff_fraction=0.12, et0=3)
    assert s["infiltration"] == 0 and s["dr"] == pytest.approx(43.0)


def test_depletion_cannot_exceed_taw():
    s = c.water_balance_step(129, etc=6, rain=0, irrigation_net=0, taw=130, raw=71.5, runoff_fraction=0.12, et0=6)
    assert s["dr"] <= 130


def test_irrigation_event_refills_and_excess_percolates():
    s = c.water_balance_step(40, etc=3, rain=0, irrigation_net=60, taw=130, raw=71.5, runoff_fraction=0.12, et0=3)
    assert s["dr"] == 0.0 and s["deep_percolation"] > 0


@pytest.mark.parametrize("u", VEC["units"]["et0"])
def test_vectors_et0_selfconsistent(u):
    r = c.et0_penman_monteith(**u["in"])
    assert r["et0"] == pytest.approx(u["out"]["et0"], abs=1e-9)


@pytest.mark.parametrize("s", VEC["scenarios"], ids=lambda s: s["name"])
def test_scenarios_reproducible(s):
    a = c.advise(s["field"], s["weather"], s["irrigation_log"], date.fromisoformat(s["today"]))
    assert a["status"] == s["expected"]["status"]
    assert a["confidence"] == s["expected"]["confidence"]


def by(name):
    return next(s for s in VEC["scenarios"] if s["name"] == name)["expected"]


def test_behaviour_expectations():
    assert by("too_many_gaps")["status"] == "insufficient_information"
    assert by("unknown_soil")["status"] == "insufficient_information"
    assert by("future_planting")["status"] == "insufficient_information"
    assert by("season_ended")["status"] == "insufficient_information"
    assert by("stress_dry_recommended")["status"] == "irrigation_recommended"
    assert by("approaching_raw")["status"] == "irrigation_approaching"
    assert by("stress_wait_for_rain_85pct")["status"] == "wait_for_rain"
    assert by("stress_rain_unlikely_30pct")["status"] == "irrigation_recommended"
    assert by("stress_small_rain_not_enough")["status"] == "irrigation_recommended"
    assert by("heavy_rain_jan15")["depletion_mm"] < by("dry_no_reports")["depletion_mm"]
    assert by("stress_stale_reports_low_conf")["confidence"]["level"] == "low"
    # no reported irrigation must not silently create irrigation
    assert by("dry_no_reports")["depletion_mm"] == by("dry_with_recent_report")["depletion_mm"]
    # drip efficiency changes gross depth only when irrigation is recommended
    g = by("stress_dry_recommended")
    assert g["gross_irrigation_mm"] == pytest.approx(g["net_irrigation_mm"] / 0.50)
    assert g["volume_m3"] == pytest.approx(g["gross_irrigation_mm"] * 2.0 * 10)
