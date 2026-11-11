# Free deployment guide (GitHub Pages + Cloudflare Workers + D1)

Everything below is free-tier. Limits change: re-check https://developers.cloudflare.com/workers/platform/limits/ and
https://developers.cloudflare.com/d1/platform/limits/ before a pilot. Do not enter a card anywhere.

## 1. GitHub (frontend)
1. Create a free account, then a **public** repo named `zameendost`; push this folder.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Push to `main`. `.github/workflows/pages.yml` builds with `VITE_BASE=/zameendost/` and deploys to `https://<user>.github.io/zameendost/`.
   (If you name the repo differently the workflow adapts; the local default base is `/zameendost/`.)
4. Routing uses `#/` URLs so refresh never 404s on static hosting.

## 2. Cloudflare (API + database) — optional for the MVP
The app already works **local-only** without any of this (data stays in the phone's IndexedDB).
1. Free account at https://dash.cloudflare.com/sign-up (no card needed for Workers/D1 free plans).
2. `cd worker && npm install && npx wrangler login`
3. `npx wrangler d1 create zameendost` → copy the `database_id` into `wrangler.toml`.
4. `npx wrangler d1 migrations apply zameendost --remote`
5. `npx wrangler secret put JWT_SECRET` (paste a random 32+ character string; never commit it)
6. Set `ALLOWED_ORIGIN` in `wrangler.toml` to `https://<user>.github.io`
7. `npx wrangler deploy` → note the `https://zameendost-api.<subdomain>.workers.dev` URL.
8. In GitHub repo **Settings → Secrets and variables → Actions → Variables**, add `VITE_API_BASE` = that URL, re-run the Pages workflow. The weather proxy then caches Open-Meteo calls for 3 h per ~1 km cell.

## 3. Free-tier behaviour built in
Per-IP rate limits (D1), 3 h weather cache, input size limits, per-user field cap (50), and a friendly 503 when a platform quota is hit.
`daily_usage` records upstream weather calls and errors so you can see consumption.
Open-Meteo free access is non-commercial; keep attribution; the adapter is isolated in `irrigation-engine/typescript/src/weather.ts`.

## 4. Not yet wired
The browser UI does not yet sign in or sync to the Worker (the API and its tests exist). Records are local-only until that UI is added.
