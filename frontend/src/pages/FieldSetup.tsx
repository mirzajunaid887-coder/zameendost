import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLang } from "../i18n/LangContext";
import { areaHa, centroid, polygonOf, RAWALPINDI, validate, type LngLat } from "../maps/geometry";
import { putField, type LocalField } from "../storage/db";
import { CROPS, SOILS } from "@engine";
import { todayPK } from "../services/weather";

const METHODS = ["flood", "basin", "furrow", "sprinkler", "drip"];
const SOURCES = ["canal", "electric_tubewell", "diesel_pump", "solar_pump", "mixed"];
const numOrNull = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

export default function FieldSetup() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [pts, setPts] = useState<LngLat[]>([]);
  const [f, setF] = useState({ name: "", crop: "wheat", planting_date: todayPK(), soil: "loam", soil_confirmed: false, irrigation_method: "flood", water_source: "canal", pump_kw: "", pump_discharge: "", tariff: "", fuel: "", diesel_price: "" });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!mapEl.current || map.current) return;
    const m = L.map(mapEl.current).setView([RAWALPINDI[1], RAWALPINDI[0]], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => setPts((p) => [...p, [e.latlng.lng, e.latlng.lat]]));
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layer.current; if (!g) return;
    g.clearLayers();
    pts.forEach((p) => L.circleMarker([p[1], p[0]], { radius: 6, color: "#1d4ed8", fillOpacity: 1 }).addTo(g));
    if (pts.length >= 3) L.polygon(pts.map((p) => [p[1], p[0]] as [number, number]), { color: "#15803d" }).addTo(g);
    else if (pts.length === 2) L.polyline(pts.map((p) => [p[1], p[0]] as [number, number]), { color: "#15803d" }).addTo(g);
  }, [pts]);

  const err = pts.length ? validate(pts) : null;
  const ha = pts.length >= 3 ? areaHa(pts) : 0;
  const ok = pts.length >= 3 && !err && f.name.trim().length > 0;

  async function save() {
    if (!ok) return;
    const [lon, lat] = centroid(pts);
    const field: LocalField = {
      id: crypto.randomUUID(), name: f.name.trim(), geometry: polygonOf(pts), area_ha: ha, lat, lon, elevation: null,
      crop: f.crop, planting_date: f.planting_date, soil: f.soil, soil_confirmed: f.soil_confirmed, irrigation_method: f.irrigation_method, water_source: f.water_source,
      pump_kw: numOrNull(f.pump_kw), pump_discharge_m3h: numOrNull(f.pump_discharge), tariff_per_kwh: numOrNull(f.tariff), fuel_l_per_h: numOrNull(f.fuel), diesel_price_per_l: numOrNull(f.diesel_price),
      baseline_interval_days: null, baseline_depth_mm: null, created_at: new Date().toISOString(),
    };
    await putField(field);
    localStorage.setItem("zd_active", field.id);
    nav("/");
  }

  const sel = "w-full rounded-lg border bg-white p-2";
  const label = "block text-sm font-bold mb-1";
  return (
    <div className="space-y-4">
      <p>{t("draw_hint")}</p>
      <div ref={mapEl} className="h-72 w-full overflow-hidden rounded-2xl border" />
      <div className="flex gap-2">
        <button onClick={() => setPts((p) => p.slice(0, -1))} className="flex-1 rounded-lg bg-slate-200 py-2">{t("undo")}</button>
        <button onClick={() => setPts([])} className="flex-1 rounded-lg bg-slate-200 py-2">{t("clear")}</button>
      </div>
      {ha > 0 && <p className="font-bold">{t("area")}: {ha.toFixed(2)} {t("ha")} ({(ha * 2.47105).toFixed(2)} {t("acre")})</p>}
      {err && <p className="text-red-700">{t(`err_${err === "points" ? "points" : err === "region" ? "region" : err === "shape" ? "shape" : "size"}`)}</p>}
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow">
        <div><label className={label}>{t("f_name")}</label><input value={f.name} onChange={(e) => set("name", e.target.value)} className={sel} /></div>
        <div><label className={label}>{t("f_crop")}</label><select value={f.crop} onChange={(e) => set("crop", e.target.value)} className={sel}>{Object.entries(CROPS).map(([k, c]) => <option key={k} value={k}>{lang === "ur" ? c.name_ur : c.name_en}</option>)}</select></div>
        <div><label className={label}>{t("f_plant")}</label><input type="date" value={f.planting_date} max={todayPK()} onChange={(e) => set("planting_date", e.target.value)} className={sel} /></div>
        <div><label className={label}>{t("f_soil")}</label><select value={f.soil} onChange={(e) => set("soil", e.target.value)} className={sel}>{Object.entries(SOILS).map(([k, s]) => <option key={k} value={k}>{lang === "ur" ? s.name_ur : s.name_en}</option>)}</select>
          <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.soil_confirmed} onChange={(e) => set("soil_confirmed", e.target.checked)} />{t("f_soil_confirmed")}</label></div>
        <div><label className={label}>{t("f_method")}</label><select value={f.irrigation_method} onChange={(e) => set("irrigation_method", e.target.value)} className={sel}>{METHODS.map((m) => <option key={m} value={m}>{t(`m_${m}`)}</option>)}</select></div>
        <div><label className={label}>{t("f_source")}</label><select value={f.water_source} onChange={(e) => set("water_source", e.target.value)} className={sel}>{SOURCES.map((m) => <option key={m} value={m}>{t(`w_${m}`)}</option>)}</select></div>
        <details className="rounded-lg border p-2"><summary className="cursor-pointer font-bold">{t("pump_optional")}</summary>
          <div className="mt-2 space-y-2">
            {([["pump_kw", "pump_kw"], ["pump_discharge", "pump_discharge"], ["tariff", "tariff"], ["fuel", "fuel"], ["diesel_price", "diesel_price"]] as const).map(([k, lab]) => (
              <div key={k}><label className="text-sm">{t(lab)}</label><input inputMode="decimal" value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className={sel} /></div>
            ))}
          </div></details>
      </div>
      <button disabled={!ok} onClick={save} className="w-full rounded-xl bg-green-700 py-4 text-lg font-bold text-white disabled:opacity-40">{t("save")}</button>
    </div>
  );
}
