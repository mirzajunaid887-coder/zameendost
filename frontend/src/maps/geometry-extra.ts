import type { LngLat } from "./geometry";

/** Approximate square of a given area (acres) centred on a point. Used when the farmer types acres instead of drawing. */
export function squareFromAcres(center: LngLat, acres: number): LngLat[] {
  const side = Math.sqrt(acres * 4046.8564224); // metres
  const dLat = side / 2 / 111_320;
  const dLon = side / 2 / (111_320 * Math.cos((center[1] * Math.PI) / 180));
  const [x, y] = center;
  return [[x - dLon, y - dLat], [x + dLon, y - dLat], [x + dLon, y + dLat], [x - dLon, y + dLat]];
}
