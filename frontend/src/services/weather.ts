import { aggregate, buildRequests, mergeDays, OPEN_METEO_ATTRIBUTION, type WeatherDay, type HourlyPayload } from "@engine";
import { getWeather, putWeather, type LocalField } from "../storage/db";

// Optional: route through the Cloudflare Worker cache (protects the free Open-Meteo limit). Empty = call Open-Meteo directly.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export type WeatherStatus = "live" | "cached" | "unavailable";
export interface WeatherResult { days: WeatherDay[]; retrievedAt: string | null; source: string; status: WeatherStatus; elevation: number | null; error?: string }

export const todayPK = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

async function getJson(url: string): Promise<any> {
  const target = API_BASE ? `${API_BASE}/api/weather?u=${encodeURIComponent(url)}` : url;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(target, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`weather provider returned ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export async function loadWeather(f: LocalField, today = todayPK()): Promise<WeatherResult> {
  try {
    const payloads: HourlyPayload[] = [];
    let elevation: number | null = null;
    for (const req of buildRequests(f.lat, f.lon, f.planting_date, today)) {
      const p = await getJson(req.url);
      if (typeof p.elevation === "number") elevation = p.elevation;
      payloads.push(p);
    }
    const days = mergeDays(...payloads.map((p) => aggregate(p)));
    if (!days.length) throw new Error("provider returned no data");
    const retrievedAt = new Date().toISOString();
    await putWeather({ fieldId: f.id, days, retrievedAt, source: OPEN_METEO_ATTRIBUTION, elevation });
    return { days, retrievedAt, source: OPEN_METEO_ATTRIBUTION, status: "live", elevation };
  } catch (e: any) {
    const c = await getWeather(f.id);
    if (c) return { days: c.days, retrievedAt: c.retrievedAt, source: c.source, status: "cached", elevation: c.elevation, error: String(e?.message ?? e) };
    return { days: [], retrievedAt: null, source: OPEN_METEO_ATTRIBUTION, status: "unavailable", elevation: null, error: String(e?.message ?? e) };
  }
}
