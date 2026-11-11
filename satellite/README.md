# Satellite module (Phase 4) — STATUS: partly implemented

| Piece | Status |
|---|---|
| NDVI / NDMI maths with SCL cloud masking and "no usable observation" handling | **Implemented and tested** (`processing/indices.py`) |
| Copernicus Data Space download (Sentinel-1/2) | **Not implemented.** Needs a free CDSE account and verified API/quota details first. |
| Sentinel-1 backscatter time series | **Not implemented** |
| Landsat thermal / ET | **Not implemented** (research item) |
| NDVI-derived crop coefficients feeding the engine | **Not implemented** |

The irrigation engine never depends on any of this. The app shows "satellite not connected" until real, dated observations exist.
Heavy raster work runs locally or in an optional GitHub Actions job, never inside Cloudflare Workers.
Never publish per-farmer field geometries or results in public repo artifacts.

Planned workflow: create a free account at https://dataspace.copernicus.eu, request Sentinel-2 L2A for the field bounding box, mask with SCL,
compute `field_stats`, and write `{date, ndvi_mean, valid_fraction, source_scene_id}` records — only real scene dates, never interpolated.
