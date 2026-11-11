# Data sources, limits, licences

| Source | Used for | Status | Notes |
|---|---|---|---|
| Open-Meteo forecast + archive APIs | Hourly T, RH, wind, shortwave, rain; daily ET0 cross-check; rain probability | **Integrated (adapter + tests on synthetic fixtures); live responses not yet verified from this build environment** | Free for non-commercial use; reports of ~10,000 calls/day fair-use; CC BY 4.0 attribution shown in app. Confirm current terms at open-meteo.com/en/terms. |
| NASA POWER | Fallback / historical | Not implemented | Coarse grid; not a station. |
| NASA SMAP L4 (root-zone soil moisture, ~9 km) | Candidate cross-check, good NASA Space Apps fit | Not implemented | Too coarse to equal field moisture. |
| SoilGrids / Pakistani soil data | Better soil defaults | Not implemented | Currently 6 texture-class defaults (FAO-56 range midpoints). |
| Sentinel-2 / Sentinel-1 / Landsat via Copernicus Data Space | NDVI/NDMI, backscatter, LST | Index maths only | See `satellite/README.md`. |
| OpenStreetMap tiles | Basemap | Integrated | Standard tile server has a usage policy; fine for a pilot, swap provider if traffic grows. |
