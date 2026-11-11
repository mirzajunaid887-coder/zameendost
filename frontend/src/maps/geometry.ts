import area from "@turf/area";

export type LngLat = [number, number];
// Keep in sync with worker/src/validate.ts SUPPORTED_BBOX.
export const BBOX = { minLon: 71.0, maxLon: 74.5, minLat: 32.0, maxLat: 34.5 };
export const RAWALPINDI: LngLat = [73.05, 33.6];

const orient = (a: LngLat, b: LngLat, c: LngLat) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const cross = (a: LngLat, b: LngLat, c: LngLat, d: LngLat) => orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;

export function ringOf(points: LngLat[]): LngLat[] { return [...points, points[0]]; }
export function polygonOf(points: LngLat[]): GeoJSON.Polygon { return { type: "Polygon", coordinates: [ringOf(points)] }; }

export function areaHa(points: LngLat[]): number {
  if (points.length < 3) return 0;
  return area({ type: "Feature", properties: {}, geometry: polygonOf(points) }) / 10_000; // geodesic m2 -> ha
}

export type GeomError = "points" | "region" | "shape" | "size" | null;
export function validate(points: LngLat[]): GeomError {
  if (points.length < 3) return "points";
  if (points.some(([x, y]) => x < BBOX.minLon || x > BBOX.maxLon || y < BBOX.minLat || y > BBOX.maxLat)) return "region";
  const r = ringOf(points), n = r.length - 1;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (cross(r[i], r[i + 1], r[j], r[j + 1])) return "shape"; }
  const a = areaHa(points);
  return a < 0.01 || a > 500 ? "size" : null;
}
export const centroid = (points: LngLat[]): LngLat => [points.reduce((a, p) => a + p[0], 0) / points.length, points.reduce((a, p) => a + p[1], 0) / points.length];
