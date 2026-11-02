/**
 * Menu import — pure helpers (unit-tested). The AI reads a photo/PDF of a menu; everything it
 * returns is validated here. A price that isn't clearly printed stays EMPTY (never guessed),
 * and such items can't be added until the owner types the price.
 */
export type MenuItem = { name: string; description: string | null; price: number | null; currency: string };

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/٫/g, ".").replace(/[٬،]/g, ",");

/** "1.500 KD", "د.ك ٢٫٧٥٠", 2.5 → number (3 decimals) or null when there is no clear single price. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 100000 ? Math.round(v * 1000) / 1000 : null;
  if (typeof v !== "string") return null;
  const nums = toLatinDigits(v).match(/\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length !== 1) return null; // "1.5 - 2.5" or no number → ask the owner
  const n = Number(nums[0].replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 1000) / 1000 : null;
}

export function normalizeCurrency(c: unknown, fallback = "KWD"): string {
  const s = typeof c === "string" ? c.trim().toUpperCase() : "";
  if (/^(KWD|KD|د\.?ك|دينار)/i.test(s) || /د\.?ك|دينار/.test(typeof c === "string" ? c : "")) return "KWD";
  if (/^(SAR|SR|ر\.?س)/.test(s) || /ر\.?س|ريال سعودي/.test(typeof c === "string" ? c : "")) return "SAR";
  if (/^(AED|د\.?إ)/.test(s) || /درهم/.test(typeof c === "string" ? c : "")) return "AED";
  return /^[A-Z]{3}$/.test(s) ? s : fallback;
}

/** Validates, trims, de-duplicates (by name) and caps the AI's list. */
export function normalizeMenuItems(raw: unknown, fallbackCurrency = "KWD"): MenuItem[] {
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown[] })?.items ?? [];
  const seen = new Set<string>();
  const out: MenuItem[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const name = typeof r?.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 160) : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const description = typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 1000) : null;
    out.push({ name, description, price: parsePrice(r.price), currency: normalizeCurrency(r.currency, fallbackCurrency) });
    if (out.length >= 200) break;
  }
  return out;
}

export const MENU_IMPORT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MENU_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
