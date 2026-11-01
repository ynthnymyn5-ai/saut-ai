/**
 * Live status semantics. The stored status is written only by backend events (orchestrator,
 * voice bridge, telephony webhooks). The displayed status adds a freshness rule so a status
 * from a crashed process can't linger: anything older than FRESH_MS falls back to
 * Online (available) or Offline (not available).
 */
export type LiveStatus = "online" | "working" | "listening" | "thinking" | "speaking" | "waiting" | "needs_attention" | "offline";
export const FRESH_MS = 2 * 60_000;
const TRANSIENT: LiveStatus[] = ["working", "listening", "thinking", "speaking", "waiting"];

export function effectiveStatus(a: { status: string; live_status: LiveStatus | null; live_updated_at: string | null; hasChannel: boolean; withinHours: boolean; pendingAttention: number }, now = Date.now()): LiveStatus {
  if (a.status !== "active") return "offline";
  if (a.pendingAttention > 0) return "needs_attention";
  const fresh = a.live_updated_at ? now - new Date(a.live_updated_at).getTime() < FRESH_MS : false;
  if (a.live_status && TRANSIENT.includes(a.live_status) && fresh) return a.live_status;
  if (a.live_status === "needs_attention") return "needs_attention";
  return a.hasChannel && a.withinHours ? "online" : "offline";
}

/** opening_hours / working_hours shape: {"sun":[["09:00","22:00"]], ...}; empty = always open. */
export function isWithinHours(hours: Record<string, [string, string][]> | null | undefined, tz = "Asia/Kuwait", at = new Date()) {
  if (!hours || Object.keys(hours).length === 0) return true;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const day = parts.find((p) => p.type === "weekday")!.value.toLowerCase().slice(0, 3);
  const hm = `${parts.find((p) => p.type === "hour")!.value.replace("24", "00")}:${parts.find((p) => p.type === "minute")!.value}`;
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const prev = DAYS[(DAYS.indexOf(day) + 6) % 7];
  const today = (hours[day] ?? []).some(([from, to]) => (from <= to ? hm >= from && hm < to : hm >= from));
  const spill = (hours[prev] ?? []).some(([from, to]) => from > to && hm < to); // e.g. Sat 20:00–02:00 covers Sun 01:30
  return today || spill;
}
