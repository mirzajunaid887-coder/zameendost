import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { tr, type Lang } from "./strings";

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string) => string }>({ lang: "ur", setLang: () => {}, t: (k) => k });
export const useLang = () => useContext(Ctx);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => ((localStorage.getItem("zd_lang") as Lang) || "ur"));
  useEffect(() => {
    localStorage.setItem("zd_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t: (k) => tr(k, lang) }}>{children}</Ctx.Provider>;
}
