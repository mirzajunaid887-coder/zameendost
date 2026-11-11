/**
 * Open-Meteo adapter (keep replaceable: any provider returning WeatherDay[] works).
 * Free API is for NON-COMMERCIAL use; attribute "Weather data by Open-Meteo.com (CC BY 4.0)".
 * Hourly variables are fetched and aggregated locally so every FAO-56 input is explicit.
 * NOTE: response shape is implemented from Open-Meteo's documented format and tested only
 * against synthetic fixtures; verify against the live API after deployment (docs/validation).
 */
import { addDays, diffDays, type WeatherDay } from "./engine";

export const OPEN_METEO_ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";
export const HOURLY_VARS = ["temperature_2m", "relative_humidity_2m", "wind_speed_10m", "shortwave_radiation", "precipitation"] as const;
const TZ = "Asia/Karachi";

export interface HourlyPayload {
  hourly?: Record<string, (number | null)[]> & { time: string[] };
  daily?: { time: string[]; et0_fao_evapotranspiration?: (number | null)[]; precipitation_probability_max?: (number | null)[] };
}

export interface MeteoRequest { url: string; kind: "archive" | "forecast" }

const q = (n: number) => (Math.round(n * 100) / 100).toFixed(2); // ~1 km cache key, avoids false precision

export function buildRequests(lat: number, lon: number, start: string, today: string): MeteoRequest[] {
  const common = `latitude=${q(lat)}&longitude=${q(lon)}&timezone=${encodeURIComponent(TZ)}&wind_speed_unit=ms&hourly=${HOURLY_VARS.join(",")}`;
  const dailyF = "&daily=et0_fao_evapotranspiration,precipitation_probability_max";
  const age = diffDays(today, start);
  const reqs: MeteoRequest[] = [];
  const pastDays = Math.min(92, Math.max(age, 0) + 1);
  if (age > 85) {
    const archiveEnd = addDays(today, -10);
    reqs.push({ kind: "archive", url: `https://archive-api.open-meteo.com/v1/archive?${common}&start_date=${start}&end_date=${archiveEnd}&daily=et0_fao_evapotranspiration` });
    reqs.push({ kind: "forecast", url: `https://api.open-meteo.com/v1/forecast?${common}${dailyF}&past_days=11&forecast_days=7` });
  } else {
    reqs.push({ kind: "forecast", url: `https://api.open-meteo.com/v1/forecast?${common}${dailyF}&past_days=${pastDays}&forecast_days=7` });
  }
  return reqs;
}

export function aggregate(payload: HourlyPayload, minHours = 20): WeatherDay[] {
  const h = payload.hourly;
  if (!h || !h.time) return [];
  const byDay = new Map<string, number[]>();
  h.time.forEach((t, i) => { const d = t.slice(0, 10); (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(i); });
  const et0 = new Map<string, number | null>();
  const prob = new Map<string, number | null>();
  payload.daily?.time.forEach((d, i) => {
    et0.set(d, payload.daily?.et0_fao_evapotranspiration?.[i] ?? null);
    prob.set(d, payload.daily?.precipitation_probability_max?.[i] ?? null);
  });
  const out: WeatherDay[] = [];
  for (const [date, idx] of byDay) {
    const col = (name: string) => idx.map((i) => h[name]?.[i]).filter((v): v is number => typeof v === "number");
    const t = col("temperature_2m"), rh = col("relative_humidity_2m"), ws = col("wind_speed_10m"), sw = col("shortwave_radiation"), pr = col("precipitation");
    const full = t.length >= minHours;
    out.push({
      date,
      tmax: full ? Math.max(...t) : null,
      tmin: full ? Math.min(...t) : null,
      rh_mean: rh.length >= minHours ? rh.reduce((a, b) => a + b, 0) / rh.length : null,
      wind_10m: ws.length >= minHours ? ws.reduce((a, b) => a + b, 0) / ws.length : null,
      rs: sw.length >= minHours ? sw.reduce((a, b) => a + b, 0) * 0.0036 : null, // W m-2 hourly mean -> MJ m-2 day-1
      precip: pr.length >= minHours ? pr.reduce((a, b) => a + b, 0) : null,
      precip_prob: prob.get(date) ?? null,
      et0_provider: et0.get(date) ?? null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Later payloads (forecast endpoint) override earlier ones (archive) for the same date. Days with null core values are kept as gaps. */
export function mergeDays(...sets: WeatherDay[][]): WeatherDay[] {
  const m = new Map<string, WeatherDay>();
  for (const s of sets) for (const d of s) m.set(d.date, d);
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Cross-check our PM ET0 against the provider's. Returns relative difference, or null if unavailable. */
export function et0Discrepancy(ours: number, provider: number | null | undefined): number | null {
  if (provider == null || provider <= 0) return null;
  return (ours - provider) / provider;
}
