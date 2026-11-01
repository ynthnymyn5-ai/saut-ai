import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

/** KWD, BHD, OMR use 3 decimals; most others 2. */
const THREE_DECIMALS = new Set(["KWD", "BHD", "OMR", "JOD"]);

export function formatMoney(amount: number, currency = "KWD", locale: "ar" | "en" = "en") {
  const digits = THREE_DECIMALS.has(currency) ? 3 : 2;
  return new Intl.NumberFormat(locale === "ar" ? "ar-KW" : "en-KW", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatNumber(n: number, locale: "ar" | "en" = "en") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-KW" : "en-US").format(n);
}

export function formatDate(d: string | Date, locale: "ar" | "en" = "en", opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-KW" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuwait",
    ...opts,
  }).format(new Date(d));
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
