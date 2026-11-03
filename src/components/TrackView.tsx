"use client";
import { Check, ChefHat, Clock, PackageCheck, ShoppingBag, Truck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";

export type Tracking = {
  business: string; lang: "ar" | "en" | null; order_no: number; status: string; fulfillment: string;
  subtotal: number; delivery_fee: number; total: number; currency: string; zone: string | null;
  created_at: string; out_for_delivery_at: string | null;
  items: { name: string; quantity: number }[]; events: { status: string; at: string }[];
};

const L = {
  ar: { title: "حالة طلبك", order: "طلب رقم", items: "الطلب", total: "المجموع", fee: "رسوم التوصيل", updated: "تتحدّث الصفحة تلقائياً", canceled: "تم إلغاء الطلب. تواصل مع المحل إذا عندك سؤال.", powered: "مقدَّم من SAUT AI",
    steps: { pending: "استلمنا طلبك", confirmed: "تم التأكيد", preparing: "قيد التجهيز", ready: "جاهز", out_for_delivery: "في الطريق إليك", delivered: "تم التسليم" } as Record<string, string>,
    readyPickup: "جاهز للاستلام" },
  en: { title: "Your order", order: "Order", items: "Items", total: "Total", fee: "Delivery fee", updated: "This page updates automatically", canceled: "This order was canceled. Contact the business if you have a question.", powered: "Powered by SAUT AI",
    steps: { pending: "Order received", confirmed: "Confirmed", preparing: "Being prepared", ready: "Ready", out_for_delivery: "On the way", delivered: "Delivered" } as Record<string, string>,
    readyPickup: "Ready for pickup" },
};
const ICON: Record<string, typeof Check> = { pending: ShoppingBag, confirmed: Check, preparing: ChefHat, ready: PackageCheck, out_for_delivery: Truck, delivered: Check };

export function TrackView({ token, initial }: { token: string; initial: Tracking }) {
  const [d, setD] = useState(initial);
  const lang = d.lang === "en" ? "en" : "ar";
  const t = L[lang];
  useEffect(() => {
    if (["delivered", "canceled"].includes(d.status)) return;
    const id = setInterval(async () => {
      const r = await fetch(`/api/track/${token}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) setD(await r.json());
    }, 20_000);
    return () => clearInterval(id);
  }, [token, d.status]);

  const flow = d.fulfillment === "delivery" ? ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"] : ["pending", "confirmed", "preparing", "ready", "delivered"];
  const at = (s: string) => d.events.filter((e) => e.status === s).at(-1)?.at;
  const idx = flow.indexOf(d.status);
  const fmtT = (iso: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Kuwait" }).format(new Date(iso));
  const money = (v: number) => `${Number(v).toFixed(3)} ${d.currency}`;

  return (
    <main dir={lang === "ar" ? "rtl" : "ltr"} className="min-h-screen bg-ink px-4 py-8 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <header className="flex items-center gap-3">
          <LogoMark size={36} />
          <div className="min-w-0"><p className="truncate font-semibold" dir="auto">{d.business}</p><p className="text-xs text-muted">{t.title}</p></div>
        </header>
        <section className="glass rounded-2xl p-5">
          <p className="text-sm text-muted">{t.order} <span dir="ltr" className="font-semibold text-white">#{d.order_no}</span></p>
          {d.status === "canceled" ? (
            <p className="mt-3 flex items-center gap-2 text-rose-300"><XCircle className="h-5 w-5" />{t.canceled}</p>
          ) : (
            <ol className="mt-4 space-y-3" aria-label={t.title}>
              {flow.map((s, i) => {
                const I = ICON[s] ?? Check; const done = i <= idx; const current = i === idx;
                const when = at(s) ?? (s === "pending" ? d.created_at : undefined);
                return (
                  <li key={s} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${done ? "border-violet bg-violet/25 text-white" : "border-line text-muted"} ${current ? "ring-2 ring-violet/50" : ""}`}><I className="h-4 w-4" /></span>
                    <span className={`flex-1 text-sm ${done ? "text-white" : "text-muted"} ${current ? "font-semibold" : ""}`}>{s === "ready" && d.fulfillment !== "delivery" ? t.readyPickup : t.steps[s]}</span>
                    {done && when && <span className="text-xs text-muted" dir="ltr">{fmtT(when)}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <section className="glass rounded-2xl p-5 text-sm">
          <p className="mb-2 font-semibold">{t.items}</p>
          <ul className="space-y-1">{d.items.map((i, k) => <li key={k} className="flex justify-between gap-2" dir="auto"><span>{i.name}</span><span className="text-muted" dir="ltr">× {i.quantity}</span></li>)}</ul>
          {Number(d.delivery_fee) > 0 && <p className="mt-3 flex justify-between text-muted"><span>{t.fee}{d.zone ? ` · ${d.zone}` : ""}</span><span dir="ltr">{money(d.delivery_fee)}</span></p>}
          <p className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><span>{t.total}</span><span dir="ltr">{money(d.total)}</span></p>
        </section>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">{!["delivered", "canceled"].includes(d.status) && <><Clock className="h-3.5 w-3.5" />{t.updated} · </>}{t.powered}</p>
      </div>
    </main>
  );
}
