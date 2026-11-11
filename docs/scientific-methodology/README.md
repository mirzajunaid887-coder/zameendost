# Scientific methodology (FAO-56, single Kc)

Reference: Allen, Pereira, Raes, Smith (1998), FAO Irrigation and Drainage Paper 56.

- **ET0**: daily Penman–Monteith (eq. 6) with Rn from Rs, Ra, Rso, Rnl; es from Tmax/Tmin; ea from mean RH × es; wind 10 m → 2 m (log profile); G = 0 daily. Missing Rs → Hargreaves-type estimate (krs 0.16); missing humidity → ea = e°(Tmin); missing wind → 2 m/s. Each estimate is reported in `missing_or_estimated` and lowers nothing silently.
- **ETc** = Kc × ET0; Kc from three points with linear development/late stages (`crop-parameters/crops.json`).
- **TAW** = 1000 (θFC − θWP) Zr; **RAW** = p × TAW; root depth grows linearly to the end of the development stage.
- **Balance** (eq. 85 style): Dr,i = Dr,i−1 − infiltrated rain − net irrigation + Ks·ETc, bounded to [0, TAW]; excess becomes deep percolation. Ks = (TAW − Dr)/(TAW − RAW) beyond RAW.
- **Rain**: events below 0.2 × ET0 ignored (heuristic); runoff = soil-class fraction × rain (uncalibrated placeholder).
- **Irrigation reports**: reported depth × application efficiency = net. "Yes" without depth refills to field capacity and is flagged "assumed"; "partial" assumes half; no report = no irrigation, plus lower confidence.
- **Advice**: stress now (Dr ≥ RAW) → recommend, unless rain with known probability ≥ 60 % within 2 days brings Dr below RAW → wait. RAW reached within 3 days → approaching; Dr ≥ 0.6 RAW → monitor.
- **Gross depth** = net / efficiency; 1 mm × 1 ha = 10 m³.

## Known simplifications
No dual Kc (soil evaporation), no capillary rise, no salinity, no slope/intensity runoff, no water-table, rain forecast treated as a point value with a probability gate, weather is gridded model data. Crop and soil parameters are unverified defaults (see `_meta` in the JSON files).
