import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as E from "../src/engine";

const here = dirname(fileURLToPath(import.meta.url));
const VEC = JSON.parse(readFileSync(join(here, "../../tests/vectors.json"), "utf8"));
const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("ET0 (FAO-56 Penman-Monteith)", () => {
  it("reproduces FAO-56 Example 18 (3.88 mm/day)", () => {
    const ea = (E.satVp(12.3) * 0.84 + E.satVp(21.5) * 0.63) / 2;
    const es = (E.satVp(21.5) + E.satVp(12.3)) / 2;
    const r = E.et0PenmanMonteith({ tmax: 21.5, tmin: 12.3, lat: 50.8, elevation: 100, doy: 187, rs: 22.07, rh_mean: (100 * ea) / es, u2: 2.078 });
    close(r.et0, 3.88, 0.02); close(r.ra, 41.09, 0.05); close(r.rn, 13.28, 0.05);
  });
  it("reports estimated variables", () => {
    const r = E.et0PenmanMonteith({ tmax: 30, tmin: 18, lat: 33.6, elevation: 508, doy: 100 });
    expect(new Set(r.estimated)).toEqual(new Set(["rs_hargreaves", "wind_default_2ms", "humidity_from_tmin"]));
  });
  it.each(VEC.units.et0.map((u: any, i: number) => [i, u]))("matches Python vector %i", (_i: number, u: any) => {
    const r = E.et0PenmanMonteith(u.in);
    close(r.et0, u.out.et0, 1e-9);
    expect(r.estimated).toEqual(u.out.estimated);
  });
});

describe("crop, soil and balance", () => {
  it("TAW / RAW hand calculation", () => { close(E.tawMm(0.25, 0.12, 1), 130); close(E.rawMm(0.55, 130), 71.5); });
  it("conversions", () => {
    expect(E.mmToM3(1, 1)).toBe(10); expect(E.mmToM3(25, 2)).toBe(500);
    close(E.grossDepth(30, 0.6), 50); expect(E.electricityCost(5, 4, 40)).toBe(800);
  });
  it.each(VEC.units.kc.map((u: any) => [u.dap, u]))("kc dap=%i matches Python", (_d: number, u: any) => {
    const [kc, st] = E.kcAndStage(E.CROPS[u.crop], u.dap);
    expect(st).toBe(u.out[1]);
    if (u.out[0] === null) expect(kc).toBeNull(); else close(kc as number, u.out[0]);
  });
  it.each(VEC.units.root.map((u: any) => [u.dap, u]))("root depth dap=%i matches Python", (_d: number, u: any) => close(E.rootDepth(E.CROPS[u.crop], u.dap), u.out));
  it.each(VEC.units.steps.map((u: any, i: number) => [i, u]))("balance step %i matches Python", (_i: number, u: any) => {
    const r = E.waterBalanceStep(u.dr_prev, u);
    for (const k of Object.keys(u.out)) close((r as any)[k], u.out[k]);
  });
  it("heavy rain -> runoff + deep percolation", () => {
    const r = E.waterBalanceStep(40, { etc: 3, rain: 60, irrigation_net: 0, taw: 130, raw: 71.5, runoff_fraction: 0.12, et0: 3 });
    close(r.runoff, 7.2); close(r.deep_percolation, 60 - 7.2 - 40 - 3); expect(r.dr).toBe(0);
  });
  it("depletion cannot exceed TAW; tiny rain ignored", () => {
    expect(E.waterBalanceStep(129, { etc: 6, rain: 0, irrigation_net: 0, taw: 130, raw: 71.5, runoff_fraction: 0.1, et0: 6 }).dr).toBeLessThanOrEqual(130);
    expect(E.waterBalanceStep(40, { etc: 3, rain: 0.4, irrigation_net: 0, taw: 130, raw: 71.5, runoff_fraction: 0.1, et0: 3 }).infiltration).toBe(0);
  });
});

describe("advisory scenarios match Python reference", () => {
  it.each(VEC.scenarios.map((s: any) => [s.name, s]))("%s", (_n: string, s: any) => {
    const a = E.advise(s.field, s.weather, s.irrigation_log, s.today);
    const x = s.expected;
    expect(a.status).toBe(x.status);
    expect(a.reasons).toEqual(x.reasons);
    expect(a.confidence).toEqual(x.confidence);
    expect(a.missing_or_estimated).toEqual(x.missing_or_estimated);
    for (const k of ["depletion_mm", "taw_mm", "raw_mm", "et0_mm", "etc_mm", "kc", "root_depth_m", "gross_irrigation_mm", "volume_m3", "forecast_effective_rain_48h_mm"]) {
      if (x[k] === undefined) continue;
      if (x[k] === null) expect((a as any)[k]).toBeNull(); else close((a as any)[k], x[k], 1e-7);
    }
    expect(a.days_since_farmer_report ?? null).toBe(x.days_since_farmer_report ?? null);
  });
});
