// Password hashing (PBKDF2-SHA256) and HS256 JWTs using WebCrypto only. No secrets in code.
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (buf: ArrayBuffer | Uint8Array) => b64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

// workerd caps PBKDF2 at 100,000 iterations.
const ITER = 100_000;

export async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

export async function signJwt(sub: string, secret: string, ttlSeconds = 60 * 60 * 24 * 14) {
  const head = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + ttlSeconds })));
  return `${head}.${body}.${b64url(await hmac(secret, `${head}.${body}`))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = b64url(await hmac(secret, `${parts[0]}.${parts[1]}`));
  if (!timingSafeEqual(expected, parts[2])) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(unb64url(parts[1])));
    if (typeof p.sub !== "string" || typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    return p.sub;
  } catch { return null; }
}
