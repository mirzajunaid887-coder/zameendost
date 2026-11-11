import { describe, it, expect } from "vitest";
import { aggregate, buildRequests, mergeDays, et0Discrepancy } from "../src/weather";

// SYNTHETIC fixture shaped like Open-Meteo hourly output. Not real observations.
function day(date: string, hours = 24, base = 10) {
  const time: string[] = [], temperature_2m: number[] = [], relative_humidity_2m: number[] = [], wind_speed_10m: number[] = [], shortwave_radiation: number[] = [], precipitation: number[] = [];
  for (let h = 0; h < hours; h++) {
    time.push(`${date}T${String(h).padStart(2, "0")}:00`);
    temperature_2m.push(base + (h === 14 ? 12 : h === 5 ? -3 : 0));
    relative_humidity_2m.push(50); wind_speed_10m.push(2);
    shortwave_radiation.push(h >= 6 && h <= 17 ? 300 : 0); precipitation.push(h === 3 ? 1.5 : 0);
  }
  return { time, temperature_2m, relative_humidity_2m, wind_speed_10m, shortwave_radiation, precipitation };
}

describe("open-meteo adapter", () => {
  it("aggregates hourly to daily FAO inputs with correct units", () => {
    const a = aggregate({ hourly: day("2026-01-20") as any, daily: { time: ["2026-01-20"], et0_fao_evapotranspiration: [1.9], precipitation_probability_max: [40] } });
    expect(a).toHaveLength(1);
    expect(a[0].tmax).toBe(22); expect(a[0].tmin).toBe(7);
    expect(a[0].rs).toBeCloseTo(12 * 300 * 0.0036, 9); // 12 sunshine hours at 300 W/m2 = 12.96 MJ/m2
    expect(a[0].precip).toBeCloseTo(1.5); expect(a[0].precip_prob).toBe(40); expect(a[0].et0_provider).toBe(1.9);
  });
  it("marks incomplete days as gaps instead of inventing values", () => {
    const a = aggregate({ hourly: day("2026-01-21", 10) as any });
    expect(a[0].tmax).toBeNull(); expect(a[0].precip).toBeNull(); expect(a[0].rs).toBeNull();
  });
  it("builds archive+forecast requests for long seasons, single forecast request for short", () => {
    const long = buildRequests(33.6, 73.05, "2025-12-15", "2026-02-10"); // 57 days: within the 92-day past window
    expect(long.map((r) => r.kind)).toEqual(["forecast"]);
    const longer = buildRequests(33.6, 73.05, "2025-09-01", "2026-02-10");
    expect(longer.map((r) => r.kind)).toEqual(["archive", "forecast"]);
    expect(long[0].url).toContain("wind_speed_unit=ms"); expect(long[0].url).toContain("latitude=33.60");
  });
  it("merge prefers later payloads; discrepancy handles missing provider ET0", () => {
    const m = mergeDays([{ date: "2026-01-01", tmax: 1 }], [{ date: "2026-01-01", tmax: 2 }]);
    expect(m[0].tmax).toBe(2);
    expect(et0Discrepancy(2.2, 2.0)).toBeCloseTo(0.1); expect(et0Discrepancy(2, null)).toBeNull();
  });
});
