# Validation status — read before showing this to farmers

## Verified in this repository
- ET0 reproduces the FAO-56 Example 18 (Brussels) value 3.88 mm/day (inputs as recalled from the paper; re-check against the PDF).
- TAW/RAW, unit conversions, balance steps match hand calculations.
- TypeScript and Python engines agree on 14+ scenarios (`irrigation-engine/tests/vectors.json`). The weather in those vectors is **synthetic**; this proves consistency, not accuracy.
- Worker: 28 integration checks against a local D1 (auth, ownership isolation, geometry rules).
- Browser: end-to-end workflow in headless Chromium with **mocked** weather, including Urdu/RTL, offline fallback, manifest.

## NOT verified
- Live Open-Meteo responses and their field names/units from this build.
- Crop Kc/root/p values and stage lengths for Rawalpindi planting dates.
- Soil defaults against any real Pothohar soil.
- Urdu wording by a native extension worker.
- Advice quality against soil-moisture measurements or farmer practice.
- Real Android device install; push notifications (not implemented).

## Pilot plan (Phase 6)
1. Verify crop parameters with PARC/NARC/Agriculture Department staff.
2. Instrument 3–5 fields with cheap soil-moisture sensors or tensiometers and compare modelled depletion with readings.
3. Log advice vs what the farmer did; report water saved only against each farmer's own baseline.
4. Native-speaker review of Urdu text.
