import type { Env } from "../env";
import { HttpError } from "../validate";
import { SUPPORTED_BBOX } from "../validate";
import { countUsage, rateLimit } from "../database/limits";

const ALLOWED_HOSTS = new Set(["api.open-meteo.com", "archive-api.open-meteo.com"]);
const TTL_SECONDS = 3 * 3600;

/** Caching proxy so many farmers in one area share one upstream call (protects Open-Meteo's fair-use limit). */
export async function weatherProxy(req: Request, env: Env, ctx: ExecutionContext, ip: string) {
  const u = new URL(req.url);
  const target = u.searchParams.get("u");
  if (!target) throw new HttpError(400, "missing u");
  let t: URL;
  try { t = new URL(target); } catch { throw new HttpError(400, "invalid u"); }
  if (t.protocol !== "https:" || !ALLOWED_HOSTS.has(t.hostname)) throw new HttpError(400, "host not allowed");
  const lat = Number(t.searchParams.get("latitude")), lon = Number(t.searchParams.get("longitude"));
  if (!(lat >= SUPPORTED_BBOX.minLat && lat <= SUPPORTED_BBOX.maxLat && lon >= SUPPORTED_BBOX.minLon && lon <= SUPPORTED_BBOX.maxLon)) throw new HttpError(400, "location outside supported region", "outside_region");
  await rateLimit(env.DB, `weather:${ip}`, 120, 3600);

  const cache = (caches as any).default as Cache;
  const key = new Request(`https://cache.zameendost.invalid/${encodeURIComponent(t.toString())}`);
  const hit = await cache.match(key);
  if (hit) return new Response(hit.body, { status: 200, headers: { "content-type": "application/json", "x-zd-cache": "hit", "x-zd-fetched-at": hit.headers.get("x-zd-fetched-at") ?? "" } });

  const upstream = await fetch(t.toString(), { headers: { "user-agent": "ZameenDost/0.1 (non-commercial farmer advisory)" } });
  if (!upstream.ok) {
    await countUsage(env.DB, "weather_upstream_error");
    throw new HttpError(upstream.status === 429 ? 503 : 502, "weather provider unavailable; please retry later", "provider_unavailable");
  }
  const body = await upstream.text();
  const fetchedAt = new Date().toISOString();
  const res = new Response(body, { headers: { "content-type": "application/json", "cache-control": `public, max-age=${TTL_SECONDS}`, "x-zd-fetched-at": fetchedAt } });
  ctx.waitUntil(cache.put(key, res.clone()));
  await countUsage(env.DB, "weather_upstream_call");
  return new Response(body, { headers: { "content-type": "application/json", "x-zd-cache": "miss", "x-zd-fetched-at": fetchedAt } });
}
