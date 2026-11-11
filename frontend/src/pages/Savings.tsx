import { useState } from "react";
import { useLang } from "../i18n/LangContext";
import { useActiveField } from "../components/FieldPicker";
import { useAdvice } from "../advisory/useAdvice";
import { putField } from "../storage/db";
import { estimateSavings, diffDays, EFFICIENCY } from "@engine";
import { todayPK } from "../services/weather";

export default function Savings() {
  const { t } = useLang();
  const { active } = useActiveField();
  const a = useAdvice(active?.id);
  const [iv, setIv] = useState(""); const [dp, setDp] = useState("");
  if (!active) return <p>{t("none_yet")}</p>;
  if (a.loading || !a.field) return <p>{t("loading")}</p>;
  const f = a.field;
  const eff = EFFICIENCY[f.irrigation_method];
  const actualGross = a.recent.length ? 0 : 0; // placeholder replaced below
  void actualGross;
  const events = a.reports.filter((r) => r.status !== "no").length;
  const grossTotal = a.reports.reduce((s, r) => s + (r.status !== "no" ? (r.gross_depth_mm ?? 0) : 0), 0);
  const baseline = f.baseline_interval_days && f.baseline_depth_mm ? { usual_interval_days: f.baseline_interval_days, usual_gross_depth_mm: f.baseline_depth_mm } : null;
  const res = estimateSavings({
    period_days: diffDays(todayPK(), f.planting_date), actual_events: events, actual_gross_depth_mm_total: grossTotal, area_ha: f.area_ha, baseline,
    pump: { water_source: f.water_source as any, pump_kw: f.pump_kw, pump_discharge_m3h: f.pump_discharge_m3h, tariff_per_kwh: f.tariff_per_kwh, fuel_l_per_h: f.fuel_l_per_h, diesel_price_per_l: f.diesel_price_per_l },
  });
  const missingDepth = a.reports.some((r) => r.status !== "no" && r.gross_depth_mm == null);
  void eff;

  async function saveBaseline() {
    await putField({ ...f, baseline_interval_days: Number(iv) || null, baseline_depth_mm: Number(dp) || null });
    a.reload();
  }
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow">
        <h1 className="text-lg font-bold">{t("sv_title")}</h1>
        <p className="text-sm">{t("sv_intro")}</p>
        <input inputMode="numeric" value={iv} onChange={(e) => setIv(e.target.value)} placeholder={`${t("sv_interval")}${f.baseline_interval_days ? ` (${f.baseline_interval_days})` : ""}`} className="w-full rounded-lg border p-2" />
        <input inputMode="decimal" value={dp} onChange={(e) => setDp(e.target.value)} placeholder={`${t("sv_depth")}${f.baseline_depth_mm ? ` (${f.baseline_depth_mm})` : ""}`} className="w-full rounded-lg border p-2" />
        <button onClick={saveBaseline} className="w-full rounded-xl bg-green-700 py-3 font-bold text-white">{t("save")}</button>
      </section>
      <section className="space-y-2 rounded-2xl bg-white p-4 text-sm shadow">
        {"error" in res ? <p>{t("sv_none")}</p> : (
          <>
            <p className="text-base">💧 <b>{res.avoided_water_m3.toFixed(0)}</b> {t("m3")} <span className="text-xs">({res.avoided_gross_depth_mm.toFixed(0)} {t("mm")})</span></p>
            {res.pumping_hours_saved != null && <p>⏱ {res.pumping_hours_saved.toFixed(1)} h</p>}
            {res.energy.kind === "electricity" && <p>⚡ {res.energy.kwh!.toFixed(0)} kWh{res.energy.cost_pkr != null && <> · PKR {Math.round(res.energy.cost_pkr).toLocaleString()}</>}</p>}
            {res.energy.kind === "diesel" && <p>⛽ {res.energy.litres!.toFixed(0)} L{res.energy.cost_pkr != null && <> · PKR {Math.round(res.energy.cost_pkr).toLocaleString()}</>}</p>}
            <p className="text-slate-700">{res.energy.note}</p>
            {missingDepth && <p className="text-amber-700">⚠ Some irrigation reports have no amount; their water is counted as 0, so savings may be overstated. Enter hours or depth when you irrigate.</p>}
            <ul className="list-disc ps-5 text-xs text-slate-600">{res.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <p className="font-bold">{t("estimate_note")}</p>
          </>
        )}
      </section>
    </div>
  );
}
