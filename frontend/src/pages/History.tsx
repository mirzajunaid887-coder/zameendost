import { useLang } from "../i18n/LangContext";
import { useActiveField } from "../components/FieldPicker";
import { useAdvice } from "../advisory/useAdvice";

export default function History() {
  const { t } = useLang();
  const { active } = useActiveField();
  const a = useAdvice(active?.id);
  if (!active) return <p>{t("none_yet")}</p>;
  if (a.loading) return <p>{t("loading")}</p>;
  const f1 = (n: number) => n.toFixed(1);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow">
        <h2 className="mb-2 font-bold">{t("hist_title")}</h2>
        {a.reports.length === 0 ? <p>{t("none_yet")}</p> : (
          <table className="w-full text-sm"><thead><tr className="text-start"><th className="text-start">{t("date")}</th><th className="text-start">{t("reported")}</th><th className="text-start">{t("mm")}</th></tr></thead>
            <tbody>{[...a.reports].reverse().map((r) => <tr key={r.date} className="border-t"><td>{r.date}</td><td>{t(r.status)}</td><td>{r.gross_depth_mm != null ? r.gross_depth_mm.toFixed(0) : "—"}</td></tr>)}</tbody></table>
        )}
      </section>
      {a.recent.length > 0 && (
        <section className="overflow-x-auto rounded-2xl bg-white p-4 shadow">
          <h2 className="mb-2 font-bold">{t("balance_title")}</h2>
          <table className="w-full min-w-[420px] text-xs"><thead><tr><th className="text-start">{t("date")}</th><th>ETc</th><th>🌧</th><th>💧</th><th>{t("depletion")}</th></tr></thead>
            <tbody>{a.recent.map((d) => <tr key={d.date} className="border-t text-center"><td className="text-start">{d.date.slice(5)}</td><td>{f1(d.etc)}</td><td>{f1(d.rain)}</td><td>{d.irrigation_net ? f1(d.irrigation_net) : "—"}</td><td>{f1(d.dr)}</td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  );
}
