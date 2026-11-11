/**
 * ZameenDost irrigation engine (TypeScript). Mirrors python-reference/zameendost_engine/core.py.
 * FAO-56 Penman-Monteith ET0, single-Kc ETc, daily root-zone soil-water balance.
 * Units: mm, MJ m-2 day-1, degC, kPa, m, ha. Pure functions; no network, no DOM.
 */
import cropsJson from "../../crop-parameters/crops.json";
import soilsJson from "../../soil-parameters/soils.json";
import effJson from "../../crop-parameters/efficiency.json";

export interface Crop {
  name_en: string; name_ur: string; season: string;
  kc_ini: number; kc_mid: number; kc_end: number;
  stages_days: { ini: number; dev: number; mid: number; late: number };
  root_depth_ini_m: number; root_depth_max_m: number; p: number; source_status: string;
}
export interface Soil { name_en: string; name_ur: string; theta_fc: number; theta_wp: number; runoff_fraction: number }
export const CROPS = cropsJson.crops as Record<string, Crop>;
export const SOILS = soilsJson.soils as Record<string, Soil>;
export const EFFICIENCY = effJson.application_efficiency as Record<string, number>;

const GSC = 0.082, SIGMA = 4.903e-9, ALBEDO = 0.23;

export const satVp = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
export const slopeSvp = (t: number) => (4098 * satVp(t)) / (t + 237.3) ** 2;
export const pressure = (z: number) => 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26;
export const wind10To2 = (u10: number) => (u10 * 4.87) / Math.log(67.8 * 10 - 5.42);

export function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  const f = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((f(a) - f(b)) / 86400000);
}

export function extraterrestrialRadiation(latDeg: number, doy: number): number {
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const x = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta)));
  const ws = Math.acos(x);
  return ((24 * 60) / Math.PI) * GSC * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
}

export interface Et0Input {
  tmax: number; tmin: number; lat: number; elevation: number; doy: number;
  rs?: number | null; rh_mean?: number | null; u2?: number | null; u10?: number | null;
}
export interface Et0Result { et0: number; estimated: string[]; rn: number; ra: number; rs: number }

export function et0PenmanMonteith(i: Et0Input): Et0Result {
  const estimated: string[] = [];
  const tmean = (i.tmax + i.tmin) / 2;
  const ra = extraterrestrialRadiation(i.lat, i.doy);
  let rs = i.rs ?? null;
  if (rs === null) { rs = 0.16 * Math.sqrt(Math.max(i.tmax - i.tmin, 0)) * ra; estimated.push("rs_hargreaves"); }
  let u2 = i.u2 ?? null;
  if (u2 === null) {
    if (i.u10 !== undefined && i.u10 !== null) u2 = wind10To2(i.u10);
    else { u2 = 2.0; estimated.push("wind_default_2ms"); }
  }
  const es = (satVp(i.tmax) + satVp(i.tmin)) / 2;
  let ea: number;
  if (i.rh_mean === undefined || i.rh_mean === null) { ea = satVp(i.tmin); estimated.push("humidity_from_tmin"); }
  else ea = (Math.max(0, Math.min(100, i.rh_mean)) / 100) * es;
  const gamma = 0.000665 * pressure(i.elevation);
  const delta = slopeSvp(tmean);
  const rns = (1 - ALBEDO) * rs;
  const rso = (0.75 + 2e-5 * i.elevation) * ra;
  const ratio = rso <= 0 ? 0.8 : Math.max(0.3, Math.min(1, rs / rso));
  const rnl = SIGMA * (((i.tmax + 273.16) ** 4 + (i.tmin + 273.16) ** 4) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) * (1.35 * ratio - 0.35);
  const rn = rns - rnl;
  const num = 0.408 * delta * rn + gamma * (900 / (tmean + 273)) * u2 * (es - ea);
  const den = delta + gamma * (1 + 0.34 * u2);
  return { et0: Math.max(0, num / den), estimated, rn, ra, rs };
}

export function kcAndStage(crop: Crop, dap: number): [number | null, string] {
  const { ini, dev, mid, late } = crop.stages_days;
  if (dap < 0) return [null, "not_planted"];
  if (dap < ini) return [crop.kc_ini, "initial"];
  if (dap < ini + dev) return [crop.kc_ini + ((dap - ini) / dev) * (crop.kc_mid - crop.kc_ini), "development"];
  if (dap < ini + dev + mid) return [crop.kc_mid, "mid_season"];
  if (dap < ini + dev + mid + late) return [crop.kc_mid + ((dap - ini - dev - mid) / late) * (crop.kc_end - crop.kc_mid), "late_season"];
  return [null, "season_ended"];
}
export function rootDepth(crop: Crop, dap: number): number {
  const span = crop.stages_days.ini + crop.stages_days.dev;
  const f = Math.max(0, Math.min(1, dap / span));
  return crop.root_depth_ini_m + f * (crop.root_depth_max_m - crop.root_depth_ini_m);
}
export const tawMm = (fc: number, wp: number, zr: number) => 1000 * (fc - wp) * zr;
export const rawMm = (p: number, taw: number) => p * taw;
export const ksFactor = (dr: number, taw: number, raw: number) => (dr <= raw ? 1 : Math.max(0, (taw - dr) / (taw - raw)));

export interface StepInput { etc: number; rain: number; irrigation_net: number; taw: number; raw: number; runoff_fraction: number; et0: number }
export interface StepResult { dr: number; ks: number; etc_adj: number; runoff: number; deep_percolation: number; infiltration: number }
export function waterBalanceStep(drPrev: number, s: StepInput): StepResult {
  const ks = ksFactor(drPrev, s.taw, s.raw);
  const etcAdj = ks * s.etc;
  const threshold = 0.2 * s.et0;
  let infiltration = 0, runoff = 0;
  if (s.rain >= threshold) { runoff = s.runoff_fraction * s.rain; infiltration = s.rain - runoff; }
  const drRaw = drPrev - infiltration - s.irrigation_net + etcAdj;
  const dp = Math.max(0, -drRaw);
  const dr = Math.min(Math.max(drRaw, 0), s.taw);
  return { dr, ks, etc_adj: etcAdj, runoff, deep_percolation: dp, infiltration };
}

export const mmToM3 = (mm: number, ha: number) => mm * ha * 10;
export const grossDepth = (netMm: number, eff: number) => netMm / eff;
export const pumpPowerKw = (m3h: number, headM: number, eta: number) => ((m3h / 3600) * 9.81 * headM) / eta;
export const electricityCost = (kw: number, hours: number, tariff: number) => kw * hours * tariff;

export interface WeatherDay {
  date: string; tmax?: number | null; tmin?: number | null; rh_mean?: number | null; wind_10m?: number | null;
  rs?: number | null; precip?: number | null; precip_prob?: number | null; et0_provider?: number | null;
}
export interface IrrigationReport { date: string; status: "yes" | "no" | "partial"; gross_depth_mm?: number | null }
export interface Field {
  crop: string; planting_date: string; soil: string; irrigation_method: string;
  lat: number; lon: number; elevation: number; area_ha: number;
  soil_confirmed?: boolean; initial_depletion_mm?: number | null; application_efficiency?: number | null;
}
const usable = (w?: WeatherDay): w is WeatherDay => !!w && w.tmax != null && w.tmin != null && w.precip != null;
const weatherEt0 = (w: WeatherDay, f: Field) =>
  et0PenmanMonteith({ tmax: w.tmax!, tmin: w.tmin!, lat: f.lat, elevation: f.elevation, doy: dayOfYear(w.date), rs: w.rs, rh_mean: w.rh_mean, u10: w.wind_10m });

export interface SimDay {
  date: string; dap: number; stage: string; kc: number; et0: number; etc: number; rain: number; irrigation_net: number;
  irrigation_note: string; dr: number; taw: number; raw: number; zr: number; ks: number; deep_percolation: number; estimated: string[];
}
export interface Simulation { days: SimDay[]; weather_gaps: number; initial_assumed: boolean; assumed_irrigation_events: number; efficiency: number }

export function simulate(field: Field, weather: WeatherDay[], log: IrrigationReport[], through: string): Simulation {
  const crop = CROPS[field.crop], soil = SOILS[field.soil];
  const eff = field.application_efficiency ?? EFFICIENCY[field.irrigation_method];
  const byDate = new Map(weather.map((w) => [w.date, w]));
  const logMap = new Map(log.map((e) => [e.date, e]));
  const initialAssumed = field.initial_depletion_mm == null;
  let dr = field.initial_depletion_mm ?? 0;
  const days: SimDay[] = [];
  let gaps = 0, assumedIrr = 0;
  const recent: number[] = [];
  for (let d = field.planting_date; d <= through; d = addDays(d, 1)) {
    const dap = diffDays(d, field.planting_date);
    const [kc, stage] = kcAndStage(crop, dap);
    if (kc === null) break;
    const zr = rootDepth(crop, dap);
    const taw = tawMm(soil.theta_fc, soil.theta_wp, zr), raw = rawMm(crop.p, taw);
    const w = byDate.get(d);
    let et0: number, rain: number, est: string[] = [];
    if (usable(w)) {
      const r = weatherEt0(w, field);
      et0 = r.et0; est = [...r.estimated]; recent.push(et0); rain = w.precip!;
    } else {
      gaps++;
      const last = recent.slice(-7);
      if (!last.length) continue;
      et0 = last.reduce((a, b) => a + b, 0) / last.length; rain = 0;
      est.push("weather_gap_filled_with_recent_mean_et0");
    }
    const entry = logMap.get(d);
    let irrNet = 0, note = entry ? entry.status : "no_report";
    if (entry && (entry.status === "yes" || entry.status === "partial")) {
      if (entry.gross_depth_mm != null) irrNet = entry.gross_depth_mm * eff;
      else { irrNet = entry.status === "yes" ? dr : 0.5 * dr; assumedIrr++; note += "_depth_assumed"; }
    }
    const etc = et0 * kc;
    const st = waterBalanceStep(dr, { etc, rain, irrigation_net: irrNet, taw, raw, runoff_fraction: soil.runoff_fraction, et0 });
    dr = st.dr;
    days.push({ date: d, dap, stage, kc, et0, etc, rain, irrigation_net: irrNet, irrigation_note: note, dr, taw, raw, zr, ks: st.ks, deep_percolation: st.deep_percolation, estimated: est });
  }
  return { days, weather_gaps: gaps, initial_assumed: initialAssumed, assumed_irrigation_events: assumedIrr, efficiency: eff };
}

export interface ProjDay { date: string; dr: number; rain: number; infiltration: number; raw: number; taw: number; prob: number | null }
export function project(stateDr: number, field: Field, forecast: WeatherDay[], start: string, n = 3): ProjDay[] {
  const crop = CROPS[field.crop], soil = SOILS[field.soil];
  const fmap = new Map(forecast.map((w) => [w.date, w]));
  const out: ProjDay[] = [];
  let dr = stateDr;
  for (let i = 1; i <= n; i++) {
    const d = addDays(start, i);
    const w = fmap.get(d);
    if (!usable(w)) break;
    const dap = diffDays(d, field.planting_date);
    const [kc] = kcAndStage(crop, dap);
    if (kc === null) break;
    const zr = rootDepth(crop, dap);
    const taw = tawMm(soil.theta_fc, soil.theta_wp, zr), raw = rawMm(crop.p, taw);
    const et0 = weatherEt0(w, field).et0;
    const st = waterBalanceStep(dr, { etc: et0 * kc, rain: w.precip!, irrigation_net: 0, taw, raw, runoff_fraction: soil.runoff_fraction, et0 });
    dr = st.dr;
    out.push({ date: d, dr, rain: w.precip!, infiltration: st.infiltration, raw, taw, prob: w.precip_prob ?? null });
  }
  return out;
}

export interface Confidence { score: number; level: "high" | "medium" | "low"; penalties: string[] }
function confidence(field: Field, sim: Simulation, todayHasWeather: boolean, daysSince: number | null): Confidence {
  let score = 1; const pen: string[] = [];
  if (!field.soil_confirmed) { score -= 0.15; pen.push("soil_type_not_confirmed"); }
  if (sim.initial_assumed) { score -= 0.15; pen.push("initial_depletion_assumed"); }
  if (sim.assumed_irrigation_events) { score -= 0.1; pen.push("irrigation_depth_assumed"); }
  if (sim.weather_gaps) { score -= Math.min(0.3, 0.05 * sim.weather_gaps); pen.push("weather_gaps"); }
  if (daysSince === null || daysSince > 3) { score -= Math.min(0.3, 0.05 * (daysSince ?? 6)); pen.push("farmer_report_stale"); }
  if (!todayHasWeather) { score -= 0.2; pen.push("no_current_weather"); }
  score = Math.max(0, Math.round(score * 1000) / 1000);
  return { score, level: score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low", penalties: pen };
}

export type Status = "no_irrigation_needed" | "monitor" | "irrigation_approaching" | "irrigation_recommended" | "wait_for_rain" | "insufficient_information";
export interface Advice {
  date: string; status: Status; reasons: string[]; confidence: Confidence; missing_or_estimated: string[];
  stage?: string; dap?: number; kc?: number; root_depth_m?: number; et0_mm?: number; etc_mm?: number; rain_today_mm?: number;
  depletion_mm?: number; depletion_fraction_of_taw?: number; taw_mm?: number; raw_mm?: number; ks?: number;
  forecast?: ProjDay[]; forecast_effective_rain_48h_mm?: number;
  net_irrigation_mm?: number | null; gross_irrigation_mm?: number | null; application_efficiency?: number; volume_m3?: number | null;
  days_since_farmer_report?: number | null;
}
const insufficient = (base: { date: string; missing_or_estimated: string[] }, reason: string, penalty: string = reason): Advice => ({
  ...base, status: "insufficient_information", reasons: [reason], confidence: { score: 0, level: "low", penalties: [penalty] },
});

export function advise(field: Partial<Field>, weather: WeatherDay[], log: IrrigationReport[], today: string): Advice {
  const missing: string[] = [];
  for (const k of ["crop", "planting_date", "soil", "irrigation_method", "lat", "lon", "elevation", "area_ha"] as const)
    if (field[k] === undefined || field[k] === null) missing.push(k);
  if (field.crop && !(field.crop in CROPS)) missing.push("crop_unknown");
  if (field.soil && !(field.soil in SOILS)) missing.push("soil_unknown");
  const base = { date: today, missing_or_estimated: [...missing] };
  if (missing.length) return insufficient(base, "missing_inputs");
  const f = field as Field;
  if (f.planting_date > today) return insufficient(base, "planting_date_in_future");
  const todayW = weather.find((w) => w.date === today);
  const sim = simulate(f, weather, log, today);
  if (!sim.days.length || sim.days[sim.days.length - 1].date !== today) return insufficient(base, sim.days.length ? "season_ended" : "no_weather_data");
  if (sim.days.slice(-10).filter((d) => d.estimated.includes("weather_gap_filled_with_recent_mean_et0")).length > 5) return insufficient(base, "too_many_weather_gaps", "weather_gaps");

  const t = sim.days[sim.days.length - 1];
  const { dr, taw, raw } = t;
  const proj = project(dr, f, weather, today, 3);
  const reported = log.filter((e) => e.date <= today).map((e) => e.date);
  const daysSince = reported.length ? diffDays(today, reported.reduce((a, b) => (a > b ? a : b))) : null;
  const conf = confidence(f, sim, usable(todayW), daysSince);
  const estimated = [...new Set([...missing, ...sim.days.flatMap((d) => d.estimated)])].sort();
  if (sim.initial_assumed) estimated.push("initial_depletion_assumed_field_capacity");
  if (!f.soil_confirmed) estimated.push("soil_parameters_from_texture_class");

  const eff = sim.efficiency;
  let status: Status = "no_irrigation_needed";
  let reasons: string[] = [];
  const stressNow = dr >= raw;
  const firstRaw = proj.findIndex((p) => p.dr >= p.raw);
  const rain48 = proj.slice(0, 2).reduce((a, p) => a + p.infiltration, 0);
  const rainy = proj.slice(0, 2).filter((p) => p.rain > 0);
  const rainProbOk = rainy.length > 0 && rainy.every((p) => p.prob !== null && p.prob >= 60);
  const relieved = proj.slice(0, 2).some((p) => p.infiltration > 0 && p.dr < p.raw);
  if (stressNow) {
    if (relieved && rainProbOk && dr < raw + 0.5 * (taw - raw)) { status = "wait_for_rain"; reasons = ["depletion_above_raw", "useful_rain_forecast"]; }
    else { status = "irrigation_recommended"; reasons = ["depletion_above_raw"]; }
  } else if (firstRaw >= 0) { status = "irrigation_approaching"; reasons = ["raw_reached_within_3_days"]; }
  else if (dr >= 0.6 * raw) { status = "monitor"; reasons = ["depletion_moderate"]; }
  else reasons = ["depletion_low"];
  if (conf.level === "low" && status === "irrigation_recommended") reasons.push("low_confidence_verify_in_field");

  const gross = status === "irrigation_recommended" || status === "irrigation_approaching" ? grossDepth(dr, eff) : null;
  return {
    ...base, status, reasons, stage: t.stage, dap: t.dap, kc: t.kc, root_depth_m: t.zr, et0_mm: t.et0, etc_mm: t.etc, rain_today_mm: t.rain,
    depletion_mm: dr, depletion_fraction_of_taw: dr / taw, taw_mm: taw, raw_mm: raw, ks: t.ks, forecast: proj, forecast_effective_rain_48h_mm: rain48,
    net_irrigation_mm: gross !== null ? dr : null, gross_irrigation_mm: gross, application_efficiency: eff,
    volume_m3: gross !== null ? mmToM3(gross, f.area_ha) : null, confidence: conf, missing_or_estimated: estimated, days_since_farmer_report: daysSince,
  };
}
