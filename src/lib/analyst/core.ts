/**
 * AI Analyst — pure, unit-tested calculations. Every number the analyst says comes from here;
 * the model only chooses which tool to call and explains the result. Times are Asia/Kuwait (UTC+3, no DST).
 */
export const RANGE_KEYS = ["today", "yesterday", "last_7_days", "this_week", "last_week", "this_month", "last_month", "last_30_days", "last_90_days", "this_year", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export type Range = { from: Date; to: Date; key: RangeKey; label: { from: string; to: string } };

const KW = 3 * 3600_000;
const DAY = 86400_000;
/** Kuwait-local midnight of the given Kuwait calendar date, as a real instant. */
const kwMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - KW);
const kwDate = (dt: Date) => new Date(dt.getTime() + KW).toISOString().slice(0, 10);

export class RangeError_ extends Error {}

export function resolveRange(key: RangeKey, now = new Date(), from?: string, to?: string): Range {
  const k = new Date(now.getTime() + KW);
  const y = k.getUTCFullYear(), m = k.getUTCMonth(), d = k.getUTCDate();
  const today = kwMidnight(y, m, d);
  const weekStart = new Date(today.getTime() - k.getUTCDay() * DAY); // week starts Sunday (Gulf)
  let a: Date, b: Date;
  switch (key) {
    case "today": a = today; b = now; break;
    case "yesterday": a = new Date(today.getTime() - DAY); b = today; break;
    case "last_7_days": a = new Date(today.getTime() - 6 * DAY); b = now; break;
    case "last_30_days": a = new Date(today.getTime() - 29 * DAY); b = now; break;
    case "last_90_days": a = new Date(today.getTime() - 89 * DAY); b = now; break;
    case "this_week": a = weekStart; b = now; break;
    case "last_week": a = new Date(weekStart.getTime() - 7 * DAY); b = weekStart; break;
    case "this_month": a = kwMidnight(y, m, 1); b = now; break;
    case "last_month": a = kwMidnight(y, m - 1, 1); b = kwMidnight(y, m, 1); break;
    case "this_year": a = kwMidnight(y, 0, 1); b = now; break;
    case "custom": {
      const re = /^\d{4}-\d{2}-\d{2}$/;
      if (!from || !to || !re.test(from) || !re.test(to)) throw new RangeError_("custom range needs from and to as YYYY-MM-DD");
      const [fy, fm, fd] = from.split("-").map(Number), [ty, tm, td] = to.split("-").map(Number);
      a = kwMidnight(fy, fm - 1, fd); b = kwMidnight(ty, tm - 1, td + 1); // `to` is inclusive
      if (!(a < b)) throw new RangeError_("from must be on or before to");
      if (b.getTime() - a.getTime() > 366 * DAY) throw new RangeError_("range longer than 366 days");
      if (b > now) b = now;
      break;
    }
  }
  return { from: a, to: b, key, label: { from: kwDate(a), to: kwDate(new Date(b.getTime() - 1)) } };
}

/** Same-length window right before the range ("previous period"). */
export function previousOf(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  const from = new Date(r.from.getTime() - len), to = r.from;
  return { from, to, key: "custom", label: { from: kwDate(from), to: kwDate(new Date(to.getTime() - 1)) } };
}

/** Same dates one year earlier. */
export function lastYearOf(r: Range): Range {
  const shift = (dt: Date) => { const x = new Date(dt); x.setUTCFullYear(x.getUTCFullYear() - 1); return x; };
  const from = shift(r.from), to = shift(r.to);
  return { from, to, key: "custom", label: { from: kwDate(from), to: kwDate(new Date(to.getTime() - 1)) } };
}

export const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function change(current: number, previous: number) {
  return { current: r3(current), previous: r3(previous), change: r3(current - previous), change_pct: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null };
}

export type AOrder = {
  created_at: string; status: string; total: number; fulfillment: string;
  customer_id: string | null; customer_name: string | null;
  items: { name: string; quantity: number; line_total: number }[];
};
const valid = (o: AOrder[]) => o.filter((x) => x.status !== "canceled");

export function totals(orders: AOrder[]) {
  const v = valid(orders);
  const revenue = v.reduce((s, o) => s + Number(o.total), 0);
  return { orders: v.length, canceled: orders.length - v.length, revenue: r3(revenue), average_order: v.length ? r3(revenue / v.length) : 0 };
}

/** Every product sold in the period with its share, compared with the previous period. */
export function productTable(cur: AOrder[], prev: AOrder[], filter?: string) {
  const agg = (orders: AOrder[]) => {
    const m = new Map<string, { quantity: number; revenue: number; orders: number }>();
    for (const o of valid(orders)) for (const i of o.items) {
      const k = i.name.trim();
      const e = m.get(k) ?? { quantity: 0, revenue: 0, orders: 0 };
      e.quantity += Number(i.quantity); e.revenue += Number(i.line_total); e.orders += 1;
      m.set(k, e);
    }
    return m;
  };
  const c = agg(cur), p = agg(prev);
  const totalRev = [...c.values()].reduce((s, x) => s + x.revenue, 0);
  const f = filter?.trim().toLowerCase();
  const names = new Set([...c.keys(), ...p.keys()]);
  return [...names]
    .filter((n) => !f || n.toLowerCase().includes(f))
    .map((name) => {
      const a = c.get(name) ?? { quantity: 0, revenue: 0, orders: 0 }, b = p.get(name) ?? { quantity: 0, revenue: 0, orders: 0 };
      return { name, quantity: a.quantity, revenue: r3(a.revenue), orders: a.orders, revenue_share_pct: totalRev ? Math.round((a.revenue / totalRev) * 1000) / 10 : 0, quantity_vs_previous: change(a.quantity, b.quantity), revenue_vs_previous: change(a.revenue, b.revenue) };
    })
    .sort((x, y) => y.revenue - x.revenue || y.quantity - x.quantity);
}

/** Customers ranked by spend or number of orders. Orders without a linked customer are counted separately. */
export function customerRanking(orders: AOrder[], by: "revenue" | "orders" = "revenue", limit = 10) {
  const m = new Map<string, { name: string; orders: number; revenue: number; last_order: string }>();
  let anonymous = 0;
  for (const o of valid(orders)) {
    if (!o.customer_id) { anonymous++; continue; }
    const e = m.get(o.customer_id) ?? { name: o.customer_name || "—", orders: 0, revenue: 0, last_order: o.created_at };
    e.orders++; e.revenue += Number(o.total);
    if (o.created_at > e.last_order) e.last_order = o.created_at;
    m.set(o.customer_id, e);
  }
  const list = [...m.values()].map((x) => ({ ...x, revenue: r3(x.revenue), average_order: r3(x.revenue / x.orders), last_order: kwDate(new Date(x.last_order)) }));
  list.sort((a, b) => (by === "orders" ? b.orders - a.orders || b.revenue - a.revenue : b.revenue - a.revenue || b.orders - a.orders));
  return { customers: list.slice(0, Math.min(Math.max(limit, 1), 25)), customers_total: list.length, orders_without_customer: anonymous };
}

/** New vs. returning buyers in the period, judged by whether they ordered before the period started. */
export function loyalty(orders: AOrder[], customersWithEarlierOrders: Set<string>) {
  const v = valid(orders);
  const per = new Map<string, number>();
  for (const o of v) if (o.customer_id) per.set(o.customer_id, (per.get(o.customer_id) ?? 0) + 1);
  const buyers = per.size;
  const repeatInPeriod = [...per.values()].filter((n) => n >= 2).length;
  const returning = [...per.keys()].filter((id) => customersWithEarlierOrders.has(id)).length;
  return {
    buyers, new_buyers: buyers - returning, returning_buyers: returning,
    returning_share_pct: buyers ? Math.round((returning / buyers) * 1000) / 10 : 0,
    ordered_twice_or_more_in_period: repeatInPeriod,
    orders_per_buyer: buyers ? r3(v.filter((o) => o.customer_id).length / buyers) : 0,
    orders_without_customer: v.filter((o) => !o.customer_id).length,
  };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
export function weekdays(orders: AOrder[]) {
  const out = WEEKDAYS.map((day) => ({ day, orders: 0, revenue: 0 }));
  for (const o of valid(orders)) {
    const w = new Date(new Date(o.created_at).getTime() + KW).getUTCDay();
    out[w].orders++; out[w].revenue += Number(o.total);
  }
  return out.map((x) => ({ ...x, revenue: r3(x.revenue) }));
}
