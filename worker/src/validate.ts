import area from "@turf/area";

export class HttpError extends Error { constructor(public status: number, message: string, public code = "bad_request") { super(message); } }

// Supported region for the pilot (Rawalpindi + neighbouring districts). Widen deliberately, not by accident.
export const SUPPORTED_BBOX = { minLon: 71.0, maxLon: 74.5, minLat: 32.0, maxLat: 34.5 };
export const CROP_IDS = ["wheat", "maize", "groundnut", "sorghum"];
export const SOIL_IDS = ["sand", "sandy_loam", "loam", "silt_loam", "clay_loam", "clay"];
export const METHODS = ["flood", "basin", "furrow", "sprinkler", "drip"];
export const SOURCES = ["canal", "electric_tubewell", "diesel_pump", "solar_pump", "mixed"];

const num = (v: unknown, lo: number, hi: number, name: string, optional = false): number | null => {
  if (v === undefined || v === null || v === "") { if (optional) return null; throw new HttpError(400, `${name} is required`); }
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new HttpError(400, `${name} must be a number between ${lo} and ${hi}`);
  return v;
};
const oneOf = (v: unknown, list: string[], name: string, optional = false): string | null => {
  if ((v === undefined || v === null) && optional) return null;
  if (typeof v !== "string" || !list.includes(v)) throw new HttpError(400, `${name} must be one of: ${list.join(", ")}`);
  return v;
};
export const isoDate = (v: unknown, name: string): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${name} must be YYYY-MM-DD`);
  return v;
};

type Pt = [number, number];
const orient = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function validatePolygon(g: any): { geometry: any; area_ha: number; centroid: Pt } {
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates) || g.coordinates.length !== 1) throw new HttpError(400, "geometry must be a GeoJSON Polygon with one outer ring (no holes)");
  const ring: Pt[] = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 500) throw new HttpError(400, "polygon ring must have 4 to 500 positions");
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== "number" || typeof p[1] !== "number" || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new HttpError(400, "invalid coordinate");
    if (p[0] < SUPPORTED_BBOX.minLon || p[0] > SUPPORTED_BBOX.maxLon || p[1] < SUPPORTED_BBOX.minLat || p[1] > SUPPORTED_BBOX.maxLat) throw new HttpError(400, "field is outside the supported region", "outside_region");
  }
  const first = ring[0], last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) throw new HttpError(400, "polygon ring must be closed");
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segmentsCross(ring[i], ring[i + 1], ring[j], ring[j + 1])) throw new HttpError(400, "polygon edges must not cross", "self_intersecting");
  }
  const geometry = { type: "Polygon", coordinates: [ring.map((p) => [p[0], p[1]])] };
  const area_ha = area({ type: "Feature", properties: {}, geometry } as any) / 10_000; // turf: geodesic m2
  if (area_ha < 0.01 || area_ha > 500) throw new HttpError(400, "field area must be between 0.01 and 500 hectares", "bad_area");
  // vertex-mean centroid is adequate at field scale (< 1 km)
  const centroid: Pt = [ring.slice(0, n).reduce((a, p) => a + p[0], 0) / n, ring.slice(0, n).reduce((a, p) => a + p[1], 0) / n];
  return { geometry, area_ha, centroid };
}

export function validateField(b: any) {
  if (!b || typeof b !== "object") throw new HttpError(400, "JSON body required");
  const poly = validatePolygon(b.geometry);
  const name = typeof b.name === "string" && b.name.trim().length > 0 && b.name.length <= 80 ? b.name.trim() : (() => { throw new HttpError(400, "name is required (max 80 chars)"); })();
  return {
    name, ...poly,
    farm_id: typeof b.farm_id === "string" ? b.farm_id : null,
    crop: oneOf(b.crop, CROP_IDS, "crop")!,
    planting_date: isoDate(b.planting_date, "planting_date"),
    soil: oneOf(b.soil, SOIL_IDS, "soil")!,
    soil_confirmed: b.soil_confirmed === true ? 1 : 0,
    irrigation_method: oneOf(b.irrigation_method, METHODS, "irrigation_method")!,
    water_source: oneOf(b.water_source, SOURCES, "water_source", true),
    elevation_m: num(b.elevation_m, -100, 4000, "elevation_m", true),
    pump_kw: num(b.pump_kw, 0, 500, "pump_kw", true), pump_discharge_m3h: num(b.pump_discharge_m3h, 0, 2000, "pump_discharge_m3h", true),
    pump_head_m: num(b.pump_head_m, 0, 500, "pump_head_m", true), pump_efficiency: num(b.pump_efficiency, 0.05, 1, "pump_efficiency", true),
    fuel_l_per_h: num(b.fuel_l_per_h, 0, 100, "fuel_l_per_h", true), tariff_per_kwh: num(b.tariff_per_kwh, 0, 10000, "tariff_per_kwh", true),
    diesel_price_per_l: num(b.diesel_price_per_l, 0, 10000, "diesel_price_per_l", true),
  };
}

export function validateReport(b: any) {
  if (!b || typeof b !== "object") throw new HttpError(400, "JSON body required");
  return {
    date: isoDate(b.date, "date"), status: oneOf(b.status, ["yes", "no", "partial"], "status")!,
    pumping_hours: num(b.pumping_hours, 0, 48, "pumping_hours", true), gross_depth_mm: num(b.gross_depth_mm, 0, 500, "gross_depth_mm", true),
  };
}
