import type { Env } from "./env";
import { verifyJwt } from "./auth/crypto";
import { HttpError } from "./validate";
import * as auth from "./routes/auth";
import * as fields from "./routes/fields";
import { weatherProxy } from "./routes/weather";

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const ok = origin && (origin === env.ALLOWED_ORIGIN || origin.startsWith("http://localhost:"));
  return ok ? { "access-control-allow-origin": origin!, "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", vary: "origin" } : { vary: "origin" };
}

async function userId(req: Request, env: Env): Promise<string> {
  const h = req.headers.get("authorization") ?? "";
  const id = h.startsWith("Bearer ") ? await verifyJwt(h.slice(7), env.JWT_SECRET) : null;
  if (!id) throw new HttpError(401, "sign in required", "unauthorized");
  return id;
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new HttpError(500, "server not configured", "misconfigured");
  const body = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

  if (p === "/api/health" && m === "GET") return body({ ok: true, time: new Date().toISOString() });
  if (p === "/api/weather" && m === "GET") return weatherProxy(req, env, ctx, ip);
  if (p === "/api/auth/register" && m === "POST") return auth.register(req, env, ip);
  if (p === "/api/auth/login" && m === "POST") return auth.login(req, env, ip);

  const uid = await userId(req, env);
  if (p === "/api/account" && m === "DELETE") return auth.deleteAccount(env, uid);
  if (p === "/api/fields" && m === "GET") return fields.listFields(env, uid);
  if (p === "/api/fields" && m === "POST") return fields.createField(req, env, uid);
  const f = p.match(/^\/api\/fields\/([0-9a-f-]{36})(?:\/(reports|recommendations))?$/);
  if (f) {
    const [, id, sub] = f;
    if (!sub && m === "DELETE") return fields.deleteField(env, uid, id);
    if (sub === "reports" && m === "GET") return fields.listReports(env, uid, id);
    if (sub === "reports" && m === "PUT") return fields.putReport(req, env, uid, id);
    if (sub === "recommendations" && m === "PUT") return fields.putRecommendation(req, env, uid, id);
  }
  throw new HttpError(404, "not found", "not_found");
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const headers = cors(env, req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      const res = await route(req, env, ctx);
      const r = new Response(res.body, res);
      for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
      return r;
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error("unhandled", e?.message);
      const msg = e instanceof HttpError ? e.message : "internal error";
      const quota = /limit|quota|too many subrequests/i.test(String(e?.message)) && !(e instanceof HttpError);
      return new Response(JSON.stringify({ error: quota ? "Service is busy today. Your data is safe on your phone; please try again later." : msg, code: e instanceof HttpError ? e.code : quota ? "quota" : "internal" }), { status: quota ? 503 : status, headers: { "content-type": "application/json", ...headers } });
    }
  },
};
