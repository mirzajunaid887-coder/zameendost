# Research notes (what was found, what we took)

Only search-result excerpts/abstracts were read for these items, not full papers; treat the "idea taken" column as inspiration to verify.

| Source | Finding (from excerpt) | Idea for ZameenDost |
|---|---|---|
| Combination of Sentinel-2 Satellite Images and Meteorological Data for Crop Water Requirements Estimation (ResearchGate) | Daily FAO-56 soil-water balance combined with NDVI-derived basal Kc / fractional cover | Phase 4: NDVI-adjusted Kc as an optional correction; engine must still work without it |
| A Sustainable Irrigation System for Small Landholdings of Rainfed Punjab, Pakistan | Scheduling at ~50 % allowable depletion; furrow efficiency ~50 %; drip saved most water | Efficiency defaults (flood 0.50) and p-based triggering; local evidence for efficiency assumptions |
| FAO "Simple irrigation calendars" (CRPSM) | Calendars for Punjab were synchronised with the **warabandi** rotation | Future: make advice warabandi-aware (water only available on the farmer's turn) |
| Clemson "Checkbook vs FAO-56" | Daily checkbook balance using farmer-recorded irrigation and rain | The daily "did you irrigate?" loop and depletion % display |
| Soil water balance models review (Pereira et al.) | FAO-56 is accurate with moderate data; simpler models risk errors in deep percolation | Keep percolation and Ks in the balance |
| Wheat vs maize threshold study (via ResearchGate page) | Different optimal depletion thresholds by crop (about 45 % wheat, 25 % maize in that simulation) | Make p per crop and tune locally; do not hard-code one threshold |
| Physics-informed ML + FAO-56 depletion (Plants, DOI 10.3390/plants15142112) | FAO-56 depletion used as a physical feature | Only after real sensor data exists; no ML for show |
| 2022 Pakistan floods remote sensing (arXiv 2410.07126) | Used NASA SMAP L4 soil moisture and Landsat NDWI | Candidate NASA-data cross-check (SMAP root-zone) for the Space Apps entry |
