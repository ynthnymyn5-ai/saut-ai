/** Sales summary from real orders (canceled excluded). Pure, unit-tested. */
export type SaleOrder = { created_at: string; status: string; total: number; delivery_fee: number; fulfillment: string; zone: string | null; items: { name: string; quantity: number; line_total: number }[] };

export function salesSummary(orders: SaleOrder[], tz = "Asia/Kuwait") {
  const valid = orders.filter((o) => o.status !== "canceled");
  const hourOf = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz });
  const dayOf = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz });
  const r3 = (n: number) => Math.round(n * 1000) / 1000;

  const revenue = valid.reduce((s, o) => s + Number(o.total), 0);
  const items = new Map<string, { name: string; quantity: number; revenue: number }>();
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }));
  const days = new Map<string, { day: string; orders: number; revenue: number }>();
  const zones = new Map<string, { zone: string; orders: number; revenue: number }>();

  for (const o of valid) {
    for (const i of o.items) {
      const k = i.name.trim();
      const cur = items.get(k) ?? { name: k, quantity: 0, revenue: 0 };
      cur.quantity += Number(i.quantity); cur.revenue += Number(i.line_total);
      items.set(k, cur);
    }
    const d = new Date(o.created_at);
    hours[Number(hourOf.format(d)) % 24].orders++;
    const day = dayOf.format(d);
    const dd = days.get(day) ?? { day, orders: 0, revenue: 0 };
    dd.orders++; dd.revenue += Number(o.total); days.set(day, dd);
    if (o.fulfillment === "delivery") {
      const z = o.zone ?? "—";
      const zz = zones.get(z) ?? { zone: z, orders: 0, revenue: 0 };
      zz.orders++; zz.revenue += Number(o.total); zones.set(z, zz);
    }
  }
  const peak = hours.reduce((a, b) => (b.orders > a.orders ? b : a), hours[0]);
  return {
    orders: valid.length,
    canceled: orders.length - valid.length,
    revenue: r3(revenue),
    average: valid.length ? r3(revenue / valid.length) : 0,
    deliveryShare: valid.length ? Math.round((valid.filter((o) => o.fulfillment === "delivery").length / valid.length) * 100) : 0,
    topItems: [...items.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10).map((i) => ({ ...i, revenue: r3(i.revenue) })),
    hours,
    peakHour: peak.orders ? peak.hour : null,
    byDay: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, revenue: r3(d.revenue) })),
    zones: [...zones.values()].sort((a, b) => b.orders - a.orders).map((z) => ({ ...z, revenue: r3(z.revenue) })),
  };
}
