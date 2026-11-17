/**
 * Timezone helpers. Mira reasons in the owner's timezone (env TZ, default
 * Asia/Kuwait) so "today", "tomorrow at 10" and the morning brief line up
 * with the owner's clock rather than the server's.
 */
import { env } from "../env";

export const TZ = env.TZ;

/** Offset (minutes) of `tz` from UTC at instant `d`. */
export function tzOffsetMinutes(d: Date, tz = TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - d.getTime()) / 60000);
}

/** Wall-clock parts of instant `d` in `tz`. */
export function zonedParts(d = new Date(), tz = TZ) {
  const shifted = new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** Build an instant from wall-clock values in `tz`. */
export function zonedDate(year: number, month: number, day: number, hour = 0, minute = 0, tz = TZ): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const off = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60000);
}

/** YYYY-MM-DD for instant `d` in `tz`. */
export function dateKey(d = new Date(), tz = TZ): string {
  const p = zonedParts(d, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function startOfDay(d = new Date(), tz = TZ): Date {
  const p = zonedParts(d, tz);
  return zonedDate(p.year, p.month, p.day, 0, 0, tz);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function startOfMonth(d = new Date(), tz = TZ): Date {
  const p = zonedParts(d, tz);
  return zonedDate(p.year, p.month, 1, 0, 0, tz);
}

export function startOfNextMonth(d = new Date(), tz = TZ): Date {
  const p = zonedParts(d, tz);
  return p.month === 12 ? zonedDate(p.year + 1, 1, 1, 0, 0, tz) : zonedDate(p.year, p.month + 1, 1, 0, 0, tz);
}

/** Human description of "now" for system prompts. */
export function nowForPrompt(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const off = tzOffsetMinutes(now);
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${fmt} (${TZ}, UTC${sign}${hh}:${mm}). Today's date is ${dateKey(now)}. Always send ISO-8601 datetimes with the ${sign}${hh}:${mm} offset.`;
}

/**
 * Very small natural-language date parser used by the offline fallback and as
 * a safety net when a tool receives "tomorrow 10am" instead of ISO.
 * Supports: today/tomorrow/day names/"in N days", "at 10", "10:30", "3pm",
 * and the Arabic equivalents (اليوم، غداً/بكرة، الساعة ١٠).
 */
export function parseNaturalDate(input: string, now = new Date()): Date | null {
  if (!input) return null;
  const iso = Date.parse(input);
  if (/^\d{4}-\d{2}-\d{2}/.test(input) && !Number.isNaN(iso)) {
    // Date-only strings are interpreted in the owner's timezone, not UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      const [y, m, d] = input.split("-").map(Number);
      return zonedDate(y, m, d, 9, 0);
    }
    return new Date(iso);
  }

  // normalise Arabic-Indic digits
  const s = input.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).toLowerCase();
  const p = zonedParts(now);
  let dayOffset: number | null = null;

  if (/\b(today|tonight)\b|اليوم|الليلة/.test(s)) dayOffset = 0;
  else if (/day after tomorrow|بعد غد|بعد بكرة/.test(s)) dayOffset = 2;
  else if (/\btomorrow\b|غد|غدا|غداً|بكرة|بكره/.test(s)) dayOffset = 1;
  const inDays = s.match(/in (\d+) days?|بعد (\d+) (?:أيام|يوم)/);
  if (inDays) dayOffset = Number(inDays[1] ?? inDays[2]);

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const arDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  dayNames.forEach((n, i) => {
    if (dayOffset === null && (s.includes(n) || s.includes(arDays[i]))) {
      dayOffset = (i - p.weekday + 7) % 7 || 7;
    }
  });

  let hour: number | null = null;
  let minute = 0;
  const t = s.match(/(?:at|@|الساعة|الساعه)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|صباحا|صباحاً|مساء|مساءً|ص|م)?/);
  if (t && (t[3] || /at|@|الساعة|الساعه/.test(t[0]) || t[2])) {
    hour = Number(t[1]);
    minute = Number(t[2] ?? 0);
    const mer = t[3];
    if (mer && /pm|مساء|^م$/.test(mer) && hour < 12) hour += 12;
    if (mer && /am|صباح|^ص$/.test(mer) && hour === 12) hour = 0;
    if (hour > 23) hour = null;
  }

  if (dayOffset === null && hour === null) return null;
  const base = addDays(zonedDate(p.year, p.month, p.day, 12), dayOffset ?? 0);
  const bp = zonedParts(base);
  const d = zonedDate(bp.year, bp.month, bp.day, hour ?? 9, minute);
  // "at 9" with no day and already past → tomorrow
  if (dayOffset === null && d.getTime() < now.getTime()) return addDays(d, 1);
  return d;
}

/** Accept ISO or natural language; returns null when unparseable. */
export function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  return parseNaturalDate(String(v));
}
