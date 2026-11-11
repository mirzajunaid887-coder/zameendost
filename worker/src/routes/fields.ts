import type { Env } from "../env";
import { HttpError, validateField, validateReport } from "../validate";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const COLS = "id,farm_id,name,geometry_geojson,area_ha,centroid_lat,centroid_lon,elevation_m,crop,planting_date,soil,soil_confirmed,irrigation_method,water_source,pump_kw,pump_discharge_m3h,pump_head_m,pump_efficiency,fuel_l_per_h,tariff_per_kwh,diesel_price_per_l,created_at,updated_at";
const out = (r: any) => ({ ...r, geometry: JSON.parse(r.geometry_geojson), geometry_geojson: undefined, soil_confirmed: !!r.soil_confirmed });

// Every query below filters by user_id: a farmer can never read or change another farmer's records.
export async function listFields(env: Env, uid: string) {
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM fields WHERE user_id=?1 ORDER BY created_at DESC LIMIT 100`).bind(uid).all();
  return json({ fields: results.map(out) });
}

async function ensureFarm(env: Env, uid: string, farmId: string | null) {
  if (farmId) {
    const f = await env.DB.prepare("SELECT id FROM farms WHERE id=?1 AND user_id=?2").bind(farmId, uid).first();
    if (!f) throw new HttpError(404, "farm not found", "not_found");
    return farmId;
  }
  const existing = await env.DB.prepare("SELECT id FROM farms WHERE user_id=?1 ORDER BY created_at LIMIT 1").bind(uid).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO farms (id,user_id,name,district) VALUES (?1,?2,?3,?4)").bind(id, uid, "My farm", "Rawalpindi").run();
  return id;
}

export async function createField(req: Request, env: Env, uid: string) {
  const v = validateField(await req.json().catch(() => null));
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM fields WHERE user_id=?1").bind(uid).first<{ n: number }>();
  if ((count?.n ?? 0) >= 50) throw new HttpError(403, "field limit reached (50)", "limit");
  const farmId = await ensureFarm(env, uid, v.farm_id);
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO fields (id,farm_id,user_id,name,geometry_geojson,area_ha,centroid_lat,centroid_lon,elevation_m,crop,planting_date,soil,soil_confirmed,irrigation_method,water_source,pump_kw,pump_discharge_m3h,pump_head_m,pump_efficiency,fuel_l_per_h,tariff_per_kwh,diesel_price_per_l)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)`)
    .bind(id, farmId, uid, v.name, JSON.stringify(v.geometry), v.area_ha, v.centroid[1], v.centroid[0], v.elevation_m, v.crop, v.planting_date, v.soil, v.soil_confirmed, v.irrigation_method, v.water_source, v.pump_kw, v.pump_discharge_m3h, v.pump_head_m, v.pump_efficiency, v.fuel_l_per_h, v.tariff_per_kwh, v.diesel_price_per_l).run();
  const row = await env.DB.prepare(`SELECT ${COLS} FROM fields WHERE id=?1`).bind(id).first();
  return json({ field: out(row) }, 201);
}

async function owned(env: Env, uid: string, fieldId: string) {
  const f = await env.DB.prepare("SELECT id FROM fields WHERE id=?1 AND user_id=?2").bind(fieldId, uid).first();
  if (!f) throw new HttpError(404, "field not found", "not_found"); // 404 (not 403) so ids are not probeable
}

export async function deleteField(env: Env, uid: string, fieldId: string) {
  await owned(env, uid, fieldId);
  await env.DB.prepare("DELETE FROM fields WHERE id=?1 AND user_id=?2").bind(fieldId, uid).run();
  return json({ deleted: true });
}

export async function putReport(req: Request, env: Env, uid: string, fieldId: string) {
  await owned(env, uid, fieldId);
  const v = validateReport(await req.json().catch(() => null));
  await env.DB.prepare(`INSERT INTO irrigation_reports (id,field_id,user_id,date,status,pumping_hours,gross_depth_mm) VALUES (?1,?2,?3,?4,?5,?6,?7)
    ON CONFLICT(field_id,date) DO UPDATE SET status=excluded.status, pumping_hours=excluded.pumping_hours, gross_depth_mm=excluded.gross_depth_mm`)
    .bind(crypto.randomUUID(), fieldId, uid, v.date, v.status, v.pumping_hours, v.gross_depth_mm).run();
  return json({ saved: true }, 200);
}

export async function listReports(env: Env, uid: string, fieldId: string) {
  await owned(env, uid, fieldId);
  const { results } = await env.DB.prepare("SELECT date,status,pumping_hours,gross_depth_mm FROM irrigation_reports WHERE field_id=?1 AND user_id=?2 ORDER BY date DESC LIMIT 400").bind(fieldId, uid).all();
  return json({ reports: results });
}

export async function putRecommendation(req: Request, env: Env, uid: string, fieldId: string) {
  await owned(env, uid, fieldId);
  const b: any = await req.json().catch(() => null);
  if (!b || typeof b.date !== "string" || typeof b.status !== "string" || typeof b.payload !== "object") throw new HttpError(400, "date, status, payload required");
  const payload = JSON.stringify(b.payload);
  if (payload.length > 20000) throw new HttpError(413, "payload too large");
  await env.DB.prepare(`INSERT INTO recommendations (id,field_id,user_id,date,status,payload_json) VALUES (?1,?2,?3,?4,?5,?6)
    ON CONFLICT(field_id,date) DO UPDATE SET status=excluded.status, payload_json=excluded.payload_json`).bind(crypto.randomUUID(), fieldId, uid, b.date, b.status, payload).run();
  return json({ saved: true });
}
