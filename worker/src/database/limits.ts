import { HttpError } from "../validate";

/** Fixed-window limiter in D1. Fine for the free tier; each check costs one write, so use it only on sensitive/expensive routes. */
export async function rateLimit(db: D1Database, bucket: string, max: number, windowSec: number) {
  const win = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const row = await db.prepare("INSERT INTO rate_limits (bucket, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1 RETURNING count").bind(bucket, win).first<{ count: number }>();
  if (row && row.count > max) throw new HttpError(429, "Too many requests. Please try again later.", "rate_limited");
  if (Math.random() < 0.02) await db.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(win - 86400).run();
}

export async function countUsage(db: D1Database, metric: string) {
  const day = new Date().toISOString().slice(0, 10);
  await db.prepare("INSERT INTO daily_usage (day, metric, count) VALUES (?1, ?2, 1) ON CONFLICT(day, metric) DO UPDATE SET count = count + 1").bind(day, metric).run();
}
