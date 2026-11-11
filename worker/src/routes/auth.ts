import type { Env } from "../env";
import { hashPassword, signJwt, timingSafeEqual } from "../auth/crypto";
import { HttpError } from "../validate";
import { rateLimit } from "../database/limits";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export async function register(req: Request, env: Env, ip: string) {
  await rateLimit(env.DB, `register:${ip}`, 10, 3600);
  const b: any = await req.json().catch(() => null);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) throw new HttpError(400, "valid email required");
  if (typeof b?.password !== "string" || b.password.length < 8 || b.password.length > 200) throw new HttpError(400, "password must be 8-200 characters");
  const language = b.language === "en" ? "en" : "ur";
  const name = typeof b.name === "string" ? b.name.slice(0, 80) : null;
  const { hash, salt } = await hashPassword(b.password);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO users (id,email,name,language,password_hash,salt) VALUES (?1,?2,?3,?4,?5,?6)").bind(id, email, name, language, hash, salt).run();
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) throw new HttpError(409, "an account with this email already exists", "email_taken");
    throw e;
  }
  return json({ token: await signJwt(id, env.JWT_SECRET), user: { id, email, name, language } }, 201);
}

export async function login(req: Request, env: Env, ip: string) {
  const b: any = await req.json().catch(() => null);
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  await rateLimit(env.DB, `login:${ip}:${email}`, 8, 900);
  const row = await env.DB.prepare("SELECT id,email,name,language,password_hash,salt FROM users WHERE email=?1").bind(email).first<any>();
  // compute a hash either way to keep timing similar for unknown emails
  const { hash } = await hashPassword(String(b?.password ?? ""), row?.salt);
  if (!row || !timingSafeEqual(hash, row.password_hash)) throw new HttpError(401, "incorrect email or password", "bad_credentials");
  return json({ token: await signJwt(row.id, env.JWT_SECRET), user: { id: row.id, email: row.email, name: row.name, language: row.language } });
}

export async function deleteAccount(env: Env, userId: string) {
  // ON DELETE CASCADE removes farms, fields, reports, recommendations.
  await env.DB.prepare("DELETE FROM users WHERE id=?1").bind(userId).run();
  return json({ deleted: true });
}
