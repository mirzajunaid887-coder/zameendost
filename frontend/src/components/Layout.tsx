import { NavLink, Outlet } from "react-router-dom";
import { useLang } from "../i18n/LangContext";

export default function Layout() {
  const { t, lang, setLang } = useLang();
  const link = ({ isActive }: { isActive: boolean }) => `flex-1 text-center py-4 text-base ${isActive ? "bg-green-800 text-white font-bold" : "text-green-900"}`;
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col pb-20">
      <header className="flex items-center justify-between bg-green-700 px-4 py-3 text-white">
        <div><div className="text-xl font-bold">💧 {t("appName")}</div><div className="text-xs opacity-90">{t("tagline")}</div></div>
        <button onClick={() => setLang(lang === "ur" ? "en" : "ur")} className="rounded-lg border border-white/60 px-3 py-1 text-sm" aria-label="Language">{lang === "ur" ? "English" : "اردو"}</button>
      </header>
      <main className="flex-1 space-y-4 p-4"><Outlet /></main>
      <nav className="fixed bottom-0 left-0 right-0 z-[1000] mx-auto flex max-w-xl border-t bg-green-50" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <NavLink to="/" end className={link}>🌱 {t("nav_home")}</NavLink>
        <NavLink to="/history" className={link}>📋 {t("nav_history")}</NavLink>
        <NavLink to="/more" className={link}>☰ {t("nav_more")}</NavLink>
      </nav>
    </div>
  );
}
