import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLang } from "../i18n/LangContext";
import { areaHa, centroid, polygonOf, RAWALPINDI, validate, type LngLat } from "../maps/geometry";
import { squareFromAcres } from "../maps/geometry-extra";
import { putField, type LocalField } from "../storage/db";
import { CROPS } from "@engine";
import { todayPK } from "../services/weather";

const CROP_ICON: Record<string, string> = { wheat: "🌾", maize: "🌽", groundnut: "🥜", sorghum: "🌿" };
const SOURCES = [["canal", "🚰"], ["electric_tubewell", "⚡"], ["diesel_pump", "⛽"], ["solar_pump", "☀️"], ["mixed", "🔀"]] as const;
const METHODS = [["flood", "🌊"], ["furrow", "〰️"], ["basin", "⬜"], ["sprinkler", "💦"], ["drip", "💧"]] as const;
const SOILS = [["light", "sandy_loam", "🏜️"], ["mid", "loam", "🟫"], ["heavy", "clay_loam", "🧱"]] as const;
const ago = (days: number) => { const d = new Date(Date.now() - days * 86400000); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(d); };
const numOrNull = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const STEPS = 6;

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics and the GIS User Community";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function Card({ on, onClick, icon, title, sub }: { on: boolean; onClick: () => void; icon: string; title: string; sub?: string }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-start ${on ? "border-green-700 bg-green-50" : "border-slate-200 bg-white"}`}>
      <span className="text-4xl" aria-hidden>{icon}</span>
      <span><span className="block text-xl font-bold">{title}</span>{sub && <span className="block text-sm text-slate-600">{sub}</span>}</span>
    </button>
  );
}

export default function FieldSetup() {
  const { t, lang } = useLang();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"draw" | "acres">("draw");
  const [basemap, setBasemap] = useState<"sat" | "street">("sat");
  const [pts, setPts] = useState<LngLat[]>([]);
  const [pin, setPin] = useState<LngLat | null>(null);
  const [acres, setAcres] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const [f, setF] = useState({ crop: "wheat", planting_date: ago(30), soil: "loam", soil_known: false, water_source: "canal", irrigation_method: "flood", name: "", pump_kw: "", pump_discharge: "", tariff: "", fuel: "", diesel_price: "" });
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const base = useRef<L.TileLayer | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const modeRef = useRef(mode); modeRef.current = mode;

  const ring: LngLat[] = mode === "draw" ? pts : pin && Number(acres) > 0 ? squareFromAcres(pin, Number(acres)) : [];
  const err = ring.length ? validate(ring) : null;
  const ha = ring.length >= 3 ? areaHa(ring) : 0;
  const geomOk = ring.length >= 3 && !err;

  useEffect(() => {
    if (step !== 0 || !mapEl.current) return;
    const start: [number, number] = pts.length ? [pts[0][1], pts[0][0]] : pin ? [pin[1], pin[0]] : [RAWALPINDI[1], RAWALPINDI[0]];
    const m = L.map(mapEl.current).setView(start, pts.length || pin ? 17 : 13);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", (e: L.LeafletMouseEvent) => {
      const p: LngLat = [e.latlng.lng, e.latlng.lat];
      if (modeRef.current === "draw") setPts((x) => [...x, p]); else setPin(p);
    });
    map.current = m; base.current = null; setBasemap((b) => b);
    return () => { m.remove(); map.current = null; base.current = null; };
  }, [step]);

  useEffect(() => {
    const m = map.current; if (!m || step !== 0) return;
    base.current?.remove();
    base.current = (basemap === "sat"
      ? L.tileLayer(ESRI, { maxZoom: 19, maxNativeZoom: 18, attribution: ESRI_ATTR })
      : L.tileLayer(OSM, { maxZoom: 19, attribution: "© OpenStreetMap contributors" })).addTo(m);
    base.current.bringToBack();
  }, [basemap, step]);

  useEffect(() => {
    const g = layer.current; if (!g || step !== 0) return;
    g.clearLayers();
    const col = basemap === "sat" ? "#ffeb3b" : "#15803d";
    const ll = (r: LngLat[]) => r.map((p) => [p[1], p[0]] as [number, number]);
    if (mode === "draw") pts.forEach((p) => L.circleMarker([p[1], p[0]], { radius: 7, color: "#fff", weight: 2, fillColor: "#1d4ed8", fillOpacity: 1 }).addTo(g));
    else if (pin) L.circleMarker([pin[1], pin[0]], { radius: 8, color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: 1 }).addTo(g);
    if (ring.length >= 3) L.polygon(ll(ring), { color: col, weight: 3, fillOpacity: 0.15 }).addTo(g);
    else if (ring.length === 2) L.polyline(ll(ring), { color: col, weight: 3 }).addTo(g);
  }, [pts, pin, acres, mode, basemap, step]);

  function locate() {
    setLocMsg("");
    if (!navigator.geolocation) { setLocMsg(t("loc_fail")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => map.current?.setView([pos.coords.latitude, pos.coords.longitude], 17),
      () => setLocMsg(t("loc_fail")), { enableHighAccuracy: true, timeout: 15000 });
  }

  async function finish() {
    const [lon, lat] = centroid(ring);
    const field: LocalField = {
      id: crypto.randomUUID(), name: f.name.trim() || (lang === "ur" ? "میرا کھیت" : "My field"), geometry: polygonOf(ring), area_ha: ha, lat, lon, elevation: null,
      crop: f.crop, planting_date: f.planting_date, soil: f.soil, soil_confirmed: f.soil_known, irrigation_method: f.irrigation_method, water_source: f.water_source,
      pump_kw: numOrNull(f.pump_kw), pump_discharge_m3h: numOrNull(f.pump_discharge), tariff_per_kwh: numOrNull(f.tariff), fuel_l_per_h: numOrNull(f.fuel), diesel_price_per_l: numOrNull(f.diesel_price),
      baseline_interval_days: null, baseline_depth_mm: null, created_at: new Date().toISOString(),
    };
    await putField(field);
    localStorage.setItem("zd_active", field.id);
    nav("/");
  }

  const canNext = step === 0 ? geomOk : true;
  const big = "w-full rounded-xl py-4 text-xl font-bold";
  const chip = (on: boolean) => `rounded-full border-2 px-4 py-2 ${on ? "border-green-700 bg-green-100 font-bold" : "border-slate-300 bg-white"}`;
  const sel = "w-full rounded-lg border bg-white p-3 text-lg";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{t("w_step")} {step + 1} {t("w_of")} {STEPS}</span>
        <span className="flex gap-1">{Array.from({ length: STEPS }).map((_, i) => <span key={i} className={`h-2 w-6 rounded-full ${i <= step ? "bg-green-700" : "bg-slate-300"}`} />)}</span>
      </div>

      {step === 0 && (<>
        <h1 className="text-2xl font-bold">{t("w_where")}</h1>
        <p className="text-sm">{t("w_where_hint")}</p>
        <div className="flex gap-2">
          <button onClick={locate} className="flex-1 rounded-xl bg-blue-700 py-3 font-bold text-white">{t("my_loc")}</button>
          <button onClick={() => setBasemap(basemap === "sat" ? "street" : "sat")} className="flex-1 rounded-xl bg-slate-200 py-3">{basemap === "sat" ? t("street") : t("sat")}</button>
        </div>
        {locMsg && <p className="text-sm text-amber-700">{locMsg}</p>}
        <div className="flex gap-2">
          <button onClick={() => setMode("draw")} className={`flex-1 ${chip(mode === "draw")}`}>{t("mode_draw")}</button>
          <button onClick={() => setMode("acres")} className={`flex-1 ${chip(mode === "acres")}`}>{t("mode_acres")}</button>
        </div>
        <p className="text-sm font-bold">{mode === "draw" ? t("draw_short") : t("acres_hint")}</p>
        <div ref={mapEl} className="h-80 w-full overflow-hidden rounded-2xl border" />
        {mode === "draw" ? (
          <div className="flex gap-2">
            <button onClick={() => setPts((p) => p.slice(0, -1))} className="flex-1 rounded-lg bg-slate-200 py-3">{t("undo")}</button>
            <button onClick={() => setPts([])} className="flex-1 rounded-lg bg-slate-200 py-3">{t("clear")}</button>
          </div>
        ) : (
          <div><label className="mb-1 block font-bold">{t("acres_q")}</label><input inputMode="decimal" value={acres} onChange={(e) => setAcres(e.target.value)} className={sel} /></div>
        )}
        {ha > 0 && <p className="text-lg font-bold">{(ha * 2.47105).toFixed(1)} {t("acre")} ({ha.toFixed(2)} {t("ha")})</p>}
        {err && <p className="text-red-700">{t(`err_${err}`)}</p>}
      </>)}

      {step === 1 && (<><h1 className="text-2xl font-bold">{t("w_crop")}</h1>
        {Object.entries(CROPS).map(([k, c]) => <Card key={k} on={f.crop === k} onClick={() => set("crop", k)} icon={CROP_ICON[k] ?? "🌱"} title={lang === "ur" ? c.name_ur : c.name_en} />)}</>)}

      {step === 2 && (<><h1 className="text-2xl font-bold">{t("w_when")}</h1>
        <div className="flex flex-wrap gap-2">
          {([["d_week", 3], ["d_2w", 14], ["d_1m", 30], ["d_2m", 60], ["d_3m", 90]] as const).map(([k, d]) => <button key={k} onClick={() => set("planting_date", ago(d))} className={chip(f.planting_date === ago(d))}>{t(k)}</button>)}
        </div>
        <label className="block font-bold">{t("or_date")}</label>
        <input type="date" value={f.planting_date} max={todayPK()} onChange={(e) => set("planting_date", e.target.value)} className={sel} /></>)}

      {step === 3 && (<><h1 className="text-2xl font-bold">{t("w_soil")}</h1>
        {SOILS.map(([k, soil, icon]) => <Card key={k} on={f.soil_known && f.soil === soil} onClick={() => setF((p) => ({ ...p, soil, soil_known: true }))} icon={icon} title={t(`soil_${k}`)} sub={t(`soil_${k}_d`)} />)}
        <Card on={!f.soil_known} onClick={() => setF((p) => ({ ...p, soil: "loam", soil_known: false }))} icon="❔" title={t("soil_unknown")} /></>)}

      {step === 4 && (<><h1 className="text-2xl font-bold">{t("w_source")}</h1>
        {SOURCES.map(([k, icon]) => <Card key={k} on={f.water_source === k} onClick={() => set("water_source", k)} icon={icon} title={t(`w_${k}`)} />)}</>)}

      {step === 5 && (<><h1 className="text-2xl font-bold">{t("w_method")}</h1>
        {METHODS.map(([k, icon]) => <Card key={k} on={f.irrigation_method === k} onClick={() => set("irrigation_method", k)} icon={icon} title={t(`m_${k}`)} />)}
        <h2 className="pt-2 text-xl font-bold">{t("w_finish")}</h2>
        <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={t("f_name")} className={sel} />
        <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer">{t("later")}</summary>
          <div className="mt-2 space-y-2">
            {([["pump_kw", "pump_kw"], ["pump_discharge", "pump_discharge"], ["tariff", "tariff"], ["fuel", "fuel"], ["diesel_price", "diesel_price"]] as const).map(([k, lab]) => (
              <div key={k}><label className="text-sm">{t(lab)}</label><input inputMode="decimal" value={(f as any)[k]} onChange={(e) => set(k, e.target.value)} className={sel} /></div>))}
          </div></details></>)}

      <div className="flex gap-3 pt-2">
        {step > 0 && <button onClick={() => setStep(step - 1)} className={`${big} flex-1 bg-slate-200`}>{t("back")}</button>}
        {step < STEPS - 1
          ? <button disabled={!canNext} onClick={() => setStep(step + 1)} className={`${big} flex-[2] bg-green-700 text-white disabled:opacity-40`}>{t("next")}</button>
          : <button onClick={finish} className={`${big} flex-[2] bg-green-700 text-white`}>{t("finish_btn")}</button>}
      </div>
    </div>
  );
}
