/** The public, canonical address of the marketing site. Previews and local builds still point search engines here. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.sautai.company").replace(/\/+$/, "");

/** True only on the production deployment, so preview URLs are never indexed. */
export const IS_PRODUCTION_SITE = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production";

export type SeoLocale = "ar" | "en";

/** Homepage URL for one language: `/ar` or `/en` (the middleware serves the homepage in that language). */
export function homeUrl(locale: SeoLocale) {
  return `/${locale}`;
}

/** hreflang alternates for the homepage; x-default (/) lets the visitor's browser language decide. */
export const HOME_ALTERNATES = { ar: "/ar", en: "/en", "x-default": "/" } as const;
