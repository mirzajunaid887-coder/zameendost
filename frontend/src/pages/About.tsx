import { useLang } from "../i18n/LangContext";
import { deleteEverything } from "../storage/db";
import { CROPS } from "@engine";

export default function About() {
  const { t, lang } = useLang();
  const en = lang === "en";
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-2xl bg-white p-4 text-sm shadow">
        <h1 className="text-lg font-bold">{t("about_title")}</h1>
        {en ? (<>
          <p>Method: FAO-56 (Allen et al., 1998). Reference evapotranspiration (Penman–Monteith) × crop coefficient gives crop water use; a daily root-zone soil-water balance tracks how much water is missing. Irrigation is advised when depletion reaches the crop’s readily-available-water limit.</p>
          <p><b>Weather:</b> Open-Meteo (non-commercial use). Weather is a model estimate at a grid point, not a measurement at your field.</p>
          <p><b>Soil:</b> a coarse texture-class default, not a lab measurement. Correct it if you know better.</p>
          <p><b>Crop settings:</b> Kc, root depth and stage lengths are generic FAO-56 starting values that still need local verification for Rawalpindi.</p>
          <p><b>Satellite:</b> not connected yet. NDVI and radar cannot by themselves tell you when to irrigate.</p>
          <p><b>Money and energy savings</b> are shown only as estimates and only when you provide your usual practice.</p>
        </>) : (<>
          <p>طریقہ: ایف اے او-56۔ موسم سے فصل کے پانی کے استعمال کا اندازہ لگا کر روزانہ جڑوں والی مٹی کا پانی کا حساب رکھا جاتا ہے۔ جب نمی کی کمی فصل کی حد تک پہنچتی ہے تو آبپاشی کا مشورہ دیا جاتا ہے۔</p>
          <p><b>موسم:</b> اوپن میٹیو۔ یہ آپ کے کھیت کی پیمائش نہیں بلکہ قریبی علاقے کا ماڈل اندازہ ہے۔</p>
          <p><b>مٹی:</b> عمومی اندازہ ہے، لیبارٹری ٹیسٹ نہیں۔ بہتر علم ہو تو درست کریں۔</p>
          <p><b>سیٹلائٹ:</b> ابھی منسلک نہیں۔</p>
          <p><b>بچت</b> صرف اندازہ ہے اور تب دکھائی جاتی ہے جب آپ اپنا عام طریقہ بتائیں۔</p>
        </>)}
      </section>
      <section className="space-y-1 rounded-2xl bg-white p-4 text-sm shadow">
        <h2 className="font-bold">{en ? "Crop settings in use" : "استعمال شدہ فصل کی ترتیبات"}</h2>
        <ul className="list-disc ps-5">{Object.values(CROPS).map((c) => <li key={c.name_en}>{en ? c.name_en : c.name_ur}: Kc {c.kc_ini}/{c.kc_mid}/{c.kc_end}, p={c.p} — <i>{c.source_status}</i></li>)}</ul>
        <p className="text-xs text-slate-500">© OpenStreetMap contributors · Weather data by Open-Meteo.com (CC BY 4.0)</p>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow"><p className="mb-2 text-sm">{t("local_note")}</p>
        <button onClick={async () => { if (confirm(t("confirm_delete"))) { await deleteEverything(); localStorage.removeItem("zd_active"); location.hash = "#/"; location.reload(); } }} className="w-full rounded-xl border border-red-600 py-3 text-red-700">{t("delete_all")}</button></section>
    </div>
  );
}
