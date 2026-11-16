"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { strings } from "./strings";

export type Lang = "en" | "ar";
type Ctx = {
  lang: Lang;
  rtl: boolean;
  t: (typeof strings)["en"];
  setLang: (l: Lang) => void;
  /** KWD with three decimals; Arabic-Indic digits in Arabic, as on the shop's banner. */
  price: (n: number) => string;
};

const LangContext = createContext<Ctx | null>(null);
const KEY = "mmar-lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let initial: Lang = navigator.language?.toLowerCase().startsWith("ar") ? "ar" : "en";
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "ar" || saved === "en") initial = saved;
    } catch {}
    setLangState(initial);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      rtl: lang === "ar",
      t: strings[lang] as (typeof strings)["en"],
      setLang,
      price: (n) => (lang === "ar" ? n.toLocaleString("ar-KW-u-nu-arab", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : n.toFixed(3)),
    }),
    [lang, setLang],
  );
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const c = useContext(LangContext);
  if (!c) throw new Error("useLang must be used inside LangProvider");
  return c;
}
