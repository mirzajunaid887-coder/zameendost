# ZameenDost (زمین دوست)

Zero-budget, open-source irrigation advisory for farmers around Rawalpindi, Punjab. FAO-56 Penman–Monteith ET0, crop coefficients and a daily root-zone soil-water balance turn weather and the farmer's own reports into a plain-language "water now / wait" recommendation, in Urdu or English, offline-capable on Android.

**Status: working MVP core, not yet pilot-ready.** Read `docs/validation/README.md` for exactly what is and is not verified.

## What works today
- Engine (TypeScript + Python reference, shared test vectors), crop/soil parameter files (unverified defaults), honest savings calculator
- PWA: draw field on map, geodesic area, crop/soil/method/source, advisory with confidence and assumptions, daily irrigation report, history, savings, about/data-quality, Urdu RTL, IndexedDB, offline weather fallback
- Cloudflare Worker + D1: auth (PBKDF2 + JWT), per-user fields/reports, geometry validation, caching weather proxy, rate limits
- Not done: UI sign-in/sync, satellite downloads, notifications, admin dashboard, SoilGrids, NASA POWER fallback

## Run tests
```
cd irrigation-engine && python3 -m pytest tests -q
cd irrigation-engine/typescript && npm install && npm test
cd worker && npm install && npm run typecheck   # integration: see worker/test/integration.py
cd frontend && npm install && npm run build && python3 e2e/e2e.py
```
Local dev: `cd frontend && npm run dev`. Deploy: `docs/free-deployment/README.md`.

Weather data by Open-Meteo.com (CC BY 4.0, non-commercial use). Map © OpenStreetMap contributors. MIT licence.
