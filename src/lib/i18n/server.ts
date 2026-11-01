import "server-only";
import { cookies } from "next/headers";
import { dictionaries, type Locale } from "./dictionaries";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("saut_locale")?.value;
  return c === "en" ? "en" : "ar";
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale], dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const) };
}
