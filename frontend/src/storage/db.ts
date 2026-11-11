import { openDB, type DBSchema } from "idb";
import type { WeatherDay } from "@engine";

export interface LocalField {
  id: string; name: string; geometry: GeoJSON.Polygon; area_ha: number; lat: number; lon: number; elevation: number | null;
  crop: string; planting_date: string; soil: string; soil_confirmed: boolean; irrigation_method: string; water_source: string | null;
  pump_kw: number | null; pump_discharge_m3h: number | null; tariff_per_kwh: number | null; fuel_l_per_h: number | null; diesel_price_per_l: number | null;
  baseline_interval_days: number | null; baseline_depth_mm: number | null; created_at: string;
}
export interface LocalReport { fieldId: string; date: string; status: "yes" | "no" | "partial"; pumping_hours: number | null; gross_depth_mm: number | null }
export interface WeatherCache { fieldId: string; days: WeatherDay[]; retrievedAt: string; source: string; elevation: number | null }

interface Schema extends DBSchema {
  fields: { key: string; value: LocalField };
  reports: { key: [string, string]; value: LocalReport; indexes: { byField: string } };
  weather: { key: string; value: WeatherCache };
}
const dbp = openDB<Schema>("zameendost", 1, {
  upgrade(db) {
    db.createObjectStore("fields", { keyPath: "id" });
    db.createObjectStore("reports", { keyPath: ["fieldId", "date"] }).createIndex("byField", "fieldId");
    db.createObjectStore("weather", { keyPath: "fieldId" });
  },
});

export const listFields = async () => (await dbp).getAll("fields");
export const getField = async (id: string) => (await dbp).get("fields", id);
export const putField = async (f: LocalField) => { await (await dbp).put("fields", f); };
export const listReports = async (fieldId: string) => (await (await dbp).getAllFromIndex("reports", "byField", fieldId)).sort((a, b) => a.date.localeCompare(b.date));
export const putReport = async (r: LocalReport) => { await (await dbp).put("reports", r); };
export const getWeather = async (fieldId: string) => (await dbp).get("weather", fieldId);
export const putWeather = async (w: WeatherCache) => { await (await dbp).put("weather", w); };
export async function deleteEverything() {
  const db = await dbp;
  await Promise.all(["fields", "reports", "weather"].map((s) => db.clear(s as "fields" | "reports" | "weather")));
}
