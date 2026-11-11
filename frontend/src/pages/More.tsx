import { Link } from "react-router-dom";
import { useLang } from "../i18n/LangContext";
import { useActiveField } from "../components/FieldPicker";
import { CROPS } from "@engine";

export default function More() {
  const { t, lang } = useLang();
  const { fields, active, setActive } = useActiveField();
  const row = "flex items-center justify-between rounded-2xl bg-white p-4 text-lg shadow";
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="font-bold">{t("more_fields")}</h2>
        {fields?.map((f) => (
          <button key={f.id} onClick={() => { setActive(f.id); location.hash = "#/"; location.reload(); }} className={`${row} w-full text-start ${active?.id === f.id ? "ring-2 ring-green-700" : ""}`}>
            <span>{f.name} · {lang === "ur" ? CROPS[f.crop].name_ur : CROPS[f.crop].name_en}</span><span>{active?.id === f.id ? "✓" : ""}</span>
          </button>))}
        <Link to="/field" className="block rounded-2xl bg-green-700 p-4 text-center text-lg font-bold text-white">➕ {t("add_field")}</Link>
      </section>
      <section className="space-y-2">
        <h2 className="font-bold">{t("more_other")}</h2>
        <Link to="/savings" className={row}><span>💰 {t("nav_savings")}</span><span>›</span></Link>
        <Link to="/about" className={row}><span>ℹ️ {t("nav_about")}</span><span>›</span></Link>
      </section>
    </div>
  );
}
