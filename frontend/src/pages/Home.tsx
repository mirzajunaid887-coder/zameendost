import { useState } from "react";
import { Link } from "react-router-dom";
import { useLang } from "../i18n/LangContext";
import { useActiveField } from "../components/FieldPicker";
import { useAdvice } from "../advisory/useAdvice";
import { putReport } from "../storage/db";
import { todayPK } from "../services/weather";
import { CROPS } from "@engine";

const COLORS: Record<string, string> = {
  no_irrigation_needed: "bg-green-600", monitor: "bg-lime-600", irrigation_approaching: "bg-amber-500",
  irrigation_recommended: "bg-blue-700", wait_for_rain: "bg-sky-600", insufficient_information: "bg-slate-500",
};
const fmt = (n: number | null | undefined, d = 1) => (n == null || Number.isNaN(n) ? "—" : n.toFixed(d));

export default function Home() {
  const { t, lang } = useLang();
  const { fields, active } = useActiveField();
  const a = useAdvice(active?.id);
  const [hours, setHours] = useState(""); const [depth, setDepth] = useState(""); const [saved, setSaved] = useState(false); const [open, setOpen] = useState<null | "yes" | "partial">(null);

  if (fields === null) return <p>{t("loading")}</p>;
  if (!active) return (
    <div className="space-y-4 rounded-2xl bg-white p-5 shadow">
      <p className="text-lg">{t("welcome")}</p>
      <Link to="/field" className="block rounded-xl bg-green-700 py-4 text-center text-lg font-bold text-white">{t("add_field")}</Link>
      <p className="text-sm text-slate-600">{t("local_note")}</p>
    </div>
  );
  if (a.loading || !a.advice) return <p className="p-4">{t("loading")}</p>;
  const adv = a.advice, w = a.weather!;

  async function report(status: "yes" | "no" | "partial") {
    const f = a.field!;
    const hrs = hours ? Number(hours) : null;
    let gross = depth ? Number(depth) : null;
    if (gross === null && hrs !== null && f.pump_discharge_m3h) gross = (hrs * f.pump_discharge_m3h) / (f.area_ha * 10); // m3 -> mm over the field
    await putReport({ fieldId: f.id, date: todayPK(), status, pumping_hours: hrs, gross_depth_mm: status === "no" ? null : gross });
    setSaved(true); setOpen(null); a.reload(); setTimeout(() => setSaved(false), 2500);
  }

  const pct = adv.taw_mm ? Math.min(100, ((adv.depletion_mm ?? 0) / adv.taw_mm) * 100) : 0;
  const rawPct = adv.taw_mm && adv.raw_mm ? (adv.raw_mm / adv.taw_mm) * 100 : 0;
  const crop = CROPS[active.crop];

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">{active.name} · {lang === "ur" ? crop.name_ur : crop.name_en} · {fmt(active.area_ha, 2)} {t("ha")}</div>
      <section className={`${COLORS[adv.status]} rounded-2xl p-5 text-white shadow`}>
        <h1 className="text-2xl font-bold">{t(`title_${adv.status}`)}</h1>
        <p className="mt-2 text-lg">{t(`st_${adv.status}`)}</p>
        <p className="mt-3 text-sm opacity-90">{t("estimate_note")} · {t("confidence")}: <b>{t(`c_${adv.confidence.level}`)}</b></p>
      </section>

      {adv.status !== "insufficient_information" && (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow">
          <div className="text-sm">{t("depletion")}: <b>{fmt(adv.depletion_mm)} {t("mm")}</b></div>
          <div className="relative h-5 overflow-hidden rounded-full bg-sky-100" aria-hidden>
            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-red-600" style={{ left: `${rawPct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>{t("et_today")}: <b>{fmt(adv.etc_mm)} {t("mm")}</b></div><div>{t("rain_today")}: <b>{fmt(adv.rain_today_mm)} {t("mm")}</b></div>
            <div>{t("rain_48")}: <b>{fmt(adv.forecast_effective_rain_48h_mm)} {t("mm")}</b></div><div>{t("stage")}: <b>{t(`stage_${adv.stage}`)}</b></div>
          </div>
          {adv.gross_irrigation_mm != null && (
            <div className="rounded-xl bg-blue-50 p-3 text-sm">
              <div className="font-bold">{t("how_much")}</div>
              <div>{t("gross")}: <b>{fmt(adv.gross_irrigation_mm, 0)} {t("mm")}</b> · {t("volume")}: <b>{fmt(adv.volume_m3, 0)} {t("m3")}</b></div>
              <div className="text-xs text-slate-600">{t("eff_note")}</div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow">
        <h2 className="font-bold">{t("did_irrigate")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => setOpen("yes")} className="rounded-xl bg-blue-700 py-3 text-white">{t("yes")}</button>
          <button onClick={() => report("no")} className="rounded-xl bg-slate-200 py-3">{t("no")}</button>
          <button onClick={() => setOpen("partial")} className="rounded-xl bg-sky-200 py-3">{t("partial")}</button>
        </div>
        {open && (
          <div className="mt-3 space-y-2">
            <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder={t("hours")} className="w-full rounded-lg border p-2" />
            <input inputMode="decimal" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder={t("depth_opt")} className="w-full rounded-lg border p-2" />
            <button onClick={() => report(open)} className="w-full rounded-xl bg-green-700 py-3 font-bold text-white">{t("save")}</button>
          </div>
        )}
        {saved && <p className="mt-2 text-green-700">✓ {t("saved")}</p>}
        <p className="mt-2 text-xs text-slate-600">{t("no_reply_note")}</p>
      </section>

      <section className="space-y-1 rounded-2xl bg-white p-4 text-sm shadow">
        <h2 className="font-bold">{t("why")}</h2>
        <div>{t("weather_src")}: {w.source} — <b>{t(`w_${w.status}`)}</b></div>
        {w.retrievedAt && <div>{t("retrieved")}: {new Date(w.retrievedAt).toLocaleString(lang === "ur" ? "ur-PK" : "en-GB")}</div>}
        {w.error && <div className="text-xs text-amber-700">{w.error}</div>}
        {adv.confidence.penalties.length > 0 && <ul className="list-disc ps-5">{adv.confidence.penalties.map((p) => <li key={p}>{t(`pen_${p}`)}</li>)}</ul>}
        {adv.missing_or_estimated.length > 0 && <div className="text-xs text-slate-500">{t("assumptions")}: {adv.missing_or_estimated.join(", ")}</div>}
      </section>
      <section className="rounded-2xl bg-white p-4 text-sm shadow"><h2 className="font-bold">🛰️ {t("sat_title")}</h2><p>{t("sat_none")}</p></section>
      <p className="text-xs text-slate-600">{t("local_note")}</p>
    </div>
  );
}
