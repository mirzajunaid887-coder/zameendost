import { describe, it, expect } from "vitest";
import { estimateSavings } from "../src/savings";

const base = { period_days: 60, actual_events: 3, actual_gross_depth_mm_total: 3 * 60, area_ha: 2, baseline: { usual_interval_days: 10, usual_gross_depth_mm: 60 } };
describe("savings", () => {
  it("no baseline -> no savings claimed", () => expect(estimateSavings({ ...base, baseline: null, pump: {} })).toEqual({ error: "no_baseline" }));
  it("period shorter than baseline interval -> no claim", () => expect(estimateSavings({ ...base, period_days: 5, pump: {} })).toEqual({ error: "period_too_short" }));
  it("water: 6 baseline events x 60 mm minus 180 mm = 180 mm over 2 ha = 3600 m3", () => {
    const r: any = estimateSavings({ ...base, pump: { water_source: "canal" } });
    expect(r.avoided_gross_depth_mm).toBe(180); expect(r.avoided_water_m3).toBe(3600); expect(r.energy.kind).toBe("none");
  });
  it("never reports negative savings", () => {
    const r: any = estimateSavings({ ...base, actual_gross_depth_mm_total: 900, pump: { water_source: "canal" } });
    expect(r.avoided_water_m3).toBe(0);
  });
  it("electric tubewell: kWh = kW x hours; cost = kWh x tariff", () => {
    const r: any = estimateSavings({ ...base, pump: { water_source: "electric_tubewell", pump_kw: 7.5, pump_discharge_m3h: 90, tariff_per_kwh: 50 } });
    expect(r.pumping_hours_saved).toBeCloseTo(40); expect(r.energy.kwh).toBeCloseTo(300); expect(r.energy.cost_pkr).toBeCloseTo(15000);
  });
  it("solar and canal: water saved but no energy claim", () => {
    for (const s of ["solar_pump", "canal"] as const) expect((estimateSavings({ ...base, pump: { water_source: s, pump_kw: 5, pump_discharge_m3h: 90, tariff_per_kwh: 50 } }) as any).energy.kind).toBe("none");
  });
  it("diesel needs fuel rate; missing price gives litres but no money", () => {
    const r: any = estimateSavings({ ...base, pump: { water_source: "diesel_pump", pump_discharge_m3h: 90, fuel_l_per_h: 2 } });
    expect(r.energy.litres).toBeCloseTo(80); expect(r.energy.cost_pkr).toBeNull();
  });
  it("electric without discharge cannot estimate hours", () => {
    const r: any = estimateSavings({ ...base, pump: { water_source: "electric_tubewell", pump_kw: 7.5, tariff_per_kwh: 50 } });
    expect(r.pumping_hours_saved).toBeNull(); expect(r.energy.kind).toBe("none");
  });
});
