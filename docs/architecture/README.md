# Architecture

```
Phone (PWA on GitHub Pages)  --IndexedDB-->  fields, reports, weather cache
   | engine (TypeScript, runs in browser)        ^ offline: shows saved weather, labelled
   |--> Open-Meteo (direct, or via Worker cache)
   '--> (future) Cloudflare Worker + D1: accounts, sync, shared weather cache
Python reference engine + satellite processing: run locally / CI only
```
Rules: no backend Python; no fabricated data; engine pure and shared by test vectors; every output is labelled an estimate.
