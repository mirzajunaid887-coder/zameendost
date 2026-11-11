/**
 * Honest savings estimates. Nothing is "saved" unless a baseline exists.
 * Baseline = what the farmer says they would normally have done (interval + depth), entered by the farmer.
 * Savings = baseline-expected irrigation volume minus the volume actually reported/estimated. Always labelled estimate.
 */
import { mmToM3, electricityCost, pumpPowerKw } from "./engine";

export interface Baseline { usual_interval_days: number; usual_gross_depth_mm: number }
export interface PumpInfo {
  water_source?: "canal" | "electric_tubewell" | "diesel_pump" | "solar_pump" | "mixed" | null;
  pump_kw?: number | null; pump_discharge_m3h?: number | null; pump_head_m?: number | null; pump_efficiency?: number | null;
  fuel_l_per_h?: number | null; tariff_per_kwh?: number | null; diesel_price_per_l?: number | null;
}
export interface SavingsResult {
  period_days: number; baseline_events: number; actual_events: number; avoided_gross_depth_mm: number; avoided_water_m3: number;
  pumping_hours_saved: number | null; energy: { kind: "electricity" | "diesel" | "none"; kwh?: number; litres?: number; cost_pkr?: number | null; note: string };
  basis: "estimate"; notes: string[];
}

export function estimateSavings(opts: {
  period_days: number; actual_gross_depth_mm_total: number; actual_events: number; area_ha: number; baseline: Baseline | null; pump: PumpInfo;
}): SavingsResult | { error: "no_baseline" | "period_too_short" } {
  const { baseline, pump } = opts;
  if (!baseline || !(baseline.usual_interval_days > 0) || !(baseline.usual_gross_depth_mm > 0)) return { error: "no_baseline" };
  if (opts.period_days < baseline.usual_interval_days) return { error: "period_too_short" };
  const baselineEvents = Math.floor(opts.period_days / baseline.usual_interval_days);
  const baselineDepth = baselineEvents * baseline.usual_gross_depth_mm;
  const avoidedDepth = Math.max(0, baselineDepth - opts.actual_gross_depth_mm_total);
  const avoidedM3 = mmToM3(avoidedDepth, opts.area_ha);
  const notes: string[] = ["Estimate based on the farmer's own stated usual practice; not a measurement."];
  const src = pump.water_source ?? null;
  let hours: number | null = null;
  if (pump.pump_discharge_m3h && pump.pump_discharge_m3h > 0) hours = avoidedM3 / pump.pump_discharge_m3h;
  else notes.push("Pump discharge (m3/h) not provided, so pumping hours cannot be estimated.");
  let energy: SavingsResult["energy"];
  if (src === "canal") energy = { kind: "none", note: "Canal water: water is saved, but there is no pumping energy to save." };
  else if (src === "solar_pump") energy = { kind: "none", note: "Solar pump: water is saved, but there is no immediate electricity or fuel bill reduction." };
  else if (src === "electric_tubewell" || (src === "mixed" && pump.pump_kw)) {
    const kw = pump.pump_kw ?? (pump.pump_discharge_m3h && pump.pump_head_m && pump.pump_efficiency ? pumpPowerKw(pump.pump_discharge_m3h, pump.pump_head_m, pump.pump_efficiency) : null);
    if (kw && hours !== null) {
      const kwh = kw * hours;
      energy = { kind: "electricity", kwh, cost_pkr: pump.tariff_per_kwh != null ? electricityCost(kw, hours, pump.tariff_per_kwh) : null, note: "Electricity estimated from pump power x estimated pumping hours." + (src === "mixed" ? " Mixed source: assumes all avoided water would have been pumped; actual saving may be lower." : "") };
      if (pump.tariff_per_kwh == null) notes.push("Tariff not provided, so no money estimate.");
    } else energy = { kind: "none", note: "Need pump power (or discharge, head and efficiency) and pump discharge to estimate electricity." };
  } else if (src === "diesel_pump") {
    if (pump.fuel_l_per_h && hours !== null) {
      const l = pump.fuel_l_per_h * hours;
      energy = { kind: "diesel", litres: l, cost_pkr: pump.diesel_price_per_l != null ? l * pump.diesel_price_per_l : null, note: "Diesel estimated from fuel use per hour x estimated pumping hours." };
      if (pump.diesel_price_per_l == null) notes.push("Diesel price not provided, so no money estimate.");
    } else energy = { kind: "none", note: "Need fuel use per hour and pump discharge to estimate diesel." };
  } else energy = { kind: "none", note: "Water source not set, so no energy estimate." };
  return { period_days: opts.period_days, baseline_events: baselineEvents, actual_events: opts.actual_events, avoided_gross_depth_mm: avoidedDepth, avoided_water_m3: avoidedM3, pumping_hours_saved: hours, energy, basis: "estimate", notes };
}
