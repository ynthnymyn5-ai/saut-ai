/**
 * Slot computation for check_availability — pure. Times are handled in Kuwait time (UTC+3,
 * no DST), which is the primary market; branches in other GCC zones pass their own offset.
 */
export interface Busy { starts_at: string; ends_at: string | null }

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

export function freeSlots(opts: {
  date: string;                                    // YYYY-MM-DD (local)
  hours: Record<string, [string, string][]>;       // opening hours; {} = 09:00–21:00 default
  busy: Busy[];
  durationMin?: number;
  stepMin?: number;
  capacity?: number;                               // parallel bookings per slot (tables, chairs)
  utcOffsetMin?: number;                           // +180 for Kuwait
  notBefore?: Date;                                // e.g. now + 30 min
  max?: number;
}) {
  const dur = opts.durationMin ?? 30, step = opts.stepMin ?? 30, cap = opts.capacity ?? 1, off = opts.utcOffsetMin ?? 180;
  const [y, mo, d] = opts.date.split("-").map(Number);
  const dayKey = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const ranges = Object.keys(opts.hours).length ? opts.hours[dayKey] ?? [] : [["09:00", "21:00"] as [string, string]];
  const localToUtc = (min: number) => new Date(Date.UTC(y, mo - 1, d, 0, min - off));
  const busy = opts.busy.map((b) => ({ s: new Date(b.starts_at).getTime(), e: new Date(b.ends_at ?? new Date(new Date(b.starts_at).getTime() + dur * 60000)).getTime() }));
  const out: { starts_at: string; ends_at: string; local: string }[] = [];
  for (const [from, to] of ranges) {
    const end = toMin(to) <= toMin(from) ? toMin(to) + 1440 : toMin(to);
    for (let t = toMin(from); t + dur <= end; t += step) {
      const s = localToUtc(t), e = localToUtc(t + dur);
      if (opts.notBefore && s < opts.notBefore) continue;
      const overlapping = busy.filter((b) => b.s < e.getTime() && b.e > s.getTime()).length;
      if (overlapping >= cap) continue;
      const hh = String(Math.floor((t % 1440) / 60)).padStart(2, "0"), mm = String(t % 60).padStart(2, "0");
      out.push({ starts_at: s.toISOString(), ends_at: e.toISOString(), local: `${hh}:${mm}` });
      if (out.length >= (opts.max ?? 6)) return out;
    }
  }
  return out;
}

/**
 * Validates ONE requested booking against opening hours and capacity — pure.
 * Used by the AI booking tools and the staff booking API so neither can double-book or book
 * outside opening hours. Returns the reason so the caller can explain or offer alternatives.
 */
export function checkSlot(opts: {
  startsAt: Date;
  durationMin: number;
  hours: Record<string, [string, string][]>;      // {} = 09:00–21:00 default
  busy: Busy[];                                    // other live bookings that day (excluding the one being moved)
  capacity?: number;
  utcOffsetMin?: number;
}): { ok: true } | { ok: false; reason: "outside_hours" | "full" } {
  const off = opts.utcOffsetMin ?? 180, cap = Math.max(1, opts.capacity ?? 1);
  const local = new Date(opts.startsAt.getTime() + off * 60000);
  const dayKey = DAYS[local.getUTCDay()];
  const startMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const endMin = startMin + opts.durationMin;
  const ranges = Object.keys(opts.hours).length ? opts.hours[dayKey] ?? [] : [["09:00", "21:00"] as [string, string]];
  const inHours = ranges.some(([from, to]) => {
    const f = toMin(from), t0 = toMin(to), t = t0 <= f ? t0 + 1440 : t0;
    return startMin >= f && endMin <= t;
  });
  if (!inHours) return { ok: false, reason: "outside_hours" };
  const s = opts.startsAt.getTime(), e = s + opts.durationMin * 60000;
  const overlapping = opts.busy.filter((b) => {
    const bs = new Date(b.starts_at).getTime();
    const be = b.ends_at ? new Date(b.ends_at).getTime() : bs + 30 * 60000;
    return bs < e && be > s;
  }).length;
  return overlapping >= cap ? { ok: false, reason: "full" } : { ok: true };
}
