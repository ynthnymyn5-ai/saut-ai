"use client";
import { useState } from "react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { ErrorNote, useApi, useTr } from "@/components/os/shared";
import { useI18n } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/payments/money";
import { cn } from "@/lib/utils";

type Summary = {
  days: number; currency: string; truncated?: boolean; demo?: boolean;
  orders: number; canceled: number; revenue: number; average: number; deliveryShare: number; peakHour: number | null;
  topItems: { name: string; quantity: number; revenue: number }[];
  hours: { hour: number; orders: number }[];
  byDay: { day: string; orders: number; revenue: number }[];
  zones: { zone: string; orders: number; revenue: number }[];
};

/** Measured sales from real orders (canceled excluded). No estimates. */
export function SalesAnalytics() {
  const tr = useTr();
  const { locale } = useI18n();
  const [days, setDays] = useState(30);
  const q = useApi<Summary>(`/api/orders/analytics?days=${days}`);
  const d = q.data;
  const money = (v: number) => formatMoney(Number(v), d?.currency ?? "KWD", locale);
  const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? (locale === "ar" ? "ص" : "am") : (locale === "ar" ? "م" : "pm")}`;
  const maxH = Math.max(1, ...(d?.hours ?? []).map((h) => h.orders));
  const maxI = Math.max(1, ...(d?.topItems ?? []).map((i) => i.quantity));

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label={tr("Period", "الفترة")}>
        {[7, 30, 90].map((n) => (
          <button key={n} type="button" onClick={() => setDays(n)} className={cn("rounded-full border px-3 py-1.5 text-sm", days === n ? "border-violet bg-violet/15 text-white" : "border-line text-muted")}>
            {tr(`Last ${n} days`, `آخر ${n} يوم`)}
          </button>
        ))}
      </div>
      <ErrorNote error={q.error} />
      {!d ? <Skeleton className="h-48" /> : d.orders === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">{tr("No orders in this period yet.", "ما فيه طلبات في هالفترة للحين.")}</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[[tr("Orders", "الطلبات"), String(d.orders)], [tr("Sales", "المبيعات"), money(d.revenue)], [tr("Average order", "متوسط الطلب"), money(d.average)], [tr("Busiest hour", "وقت الذروة"), d.peakHour === null ? "—" : hourLabel(d.peakHour)]].map(([k, v]) => (
              <Card key={k} className="p-4"><p className="text-xs text-muted">{k}</p><p className="mt-1 text-xl font-semibold tabular-nums" dir="ltr">{v}</p></Card>
            ))}
          </div>
          <p className="text-xs text-muted">{tr(`Delivery is ${d.deliveryShare}% of orders · ${d.canceled} canceled (not counted).`, `التوصيل ${d.deliveryShare}٪ من الطلبات · ${d.canceled} ملغي (غير محسوب).`)}{d.truncated ? tr(" Showing the latest 5,000 orders.", " يعرض آخر ٥٠٠٠ طلب.") : ""}</p>

          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">{tr("Top items", "أكثر الأصناف مبيعاً")}</p>
            <ul className="space-y-2">
              {d.topItems.map((i) => (
                <li key={i.name} className="text-sm">
                  <div className="flex justify-between gap-2"><span dir="auto" className="truncate">{i.name}</span><span className="shrink-0 text-muted tabular-nums" dir="ltr">{i.quantity} · {money(i.revenue)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-gradient-to-r from-violet to-electric" style={{ width: `${(i.quantity / maxI) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">{tr("Orders by hour", "الطلبات حسب الساعة")}</p>
            <div className="flex h-32 items-end gap-[3px]" dir="ltr" role="img" aria-label={tr("Orders by hour of day", "عدد الطلبات لكل ساعة")}>
              {d.hours.map((h) => (
                <div key={h.hour} className="flex flex-1 flex-col items-center justify-end" title={`${hourLabel(h.hour)}: ${h.orders}`}>
                  <div className={cn("w-full rounded-t", h.hour === d.peakHour ? "bg-electric" : "bg-violet/60")} style={{ height: `${(h.orders / maxH) * 100}%`, minHeight: h.orders ? 3 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted" dir="ltr"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
          </Card>

          {d.zones.length > 0 && (
            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">{tr("Sales by delivery area", "المبيعات حسب منطقة التوصيل")}</p>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted"><th className="pb-2 text-start font-normal">{tr("Area", "المنطقة")}</th><th className="pb-2 text-end font-normal">{tr("Orders", "الطلبات")}</th><th className="pb-2 text-end font-normal">{tr("Sales", "المبيعات")}</th></tr></thead>
                <tbody>{d.zones.map((z) => <tr key={z.zone} className="border-t border-line"><td className="py-2" dir="auto">{z.zone}</td><td className="py-2 text-end tabular-nums">{z.orders}</td><td className="py-2 text-end tabular-nums" dir="ltr">{money(z.revenue)}</td></tr>)}</tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
