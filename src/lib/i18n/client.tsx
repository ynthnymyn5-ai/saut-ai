"use client";
import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dictionaries, type Dict, type Locale } from "./dictionaries";

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: "ar", t: dictionaries.ar });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t: dictionaries[locale] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Pick the right string from an {en, ar} pair. */
export function useL() {
  const { locale } = useI18n();
  return <T,>(v: { en: T; ar: T }) => v[locale];
}

export function useSetLocale() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    setLocale: (l: Locale) => {
      document.cookie = `saut_locale=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      document.documentElement.dir = l === "ar" ? "rtl" : "ltr";
      start(() => router.refresh());
    },
  };
}
