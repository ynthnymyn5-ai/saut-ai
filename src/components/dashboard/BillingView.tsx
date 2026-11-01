"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CreditCard, ExternalLink, Loader2, Receipt, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PricingCards } from "@/components/landing/Landing";
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, statusTone } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { BillingAddons } from "@/components/os/BillingAddons";
import { getPlan, type Interval, type PlanCode } from "@/lib/plans";
import { cn, formatDate, formatMoney } from "@/lib/utils";

type Props = {
  demo: boolean;
  plan: string | null;
  status: string | null;
  interval: string;
  renews: string | null;
  cancelAtPeriodEnd: boolean;
  billingProvider: "stripe" | "myfatoorah" | null;
  payments: { id: string; date: string; amount: number; currency: string; status: string; method: string; provider: string; receiptUrl: string | null }[];
  usage: { voiceMinutes: number; voiceLimit: number; conversations: number; conversationLimit: number; employees: number; employeeLimit: number };
  providers: { stripe: boolean; myfatoorah: boolean };
};

export function BillingView(p: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const params = useSearchParams();
  const [checkout, setCheckout] = useState<{ plan: PlanCode; interval: Interval } | null>(null);
  const [provider, setProvider] = useState<"myfatoorah" | "stripe">(p.providers.myfatoorah || !p.providers.stripe ? "myfatoorah" : "stripe");
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false);

  useEffect(() => {
    const c = params.get("checkout");
    if (c === "processing") toast({ kind: "info", title: locale === "ar" ? "جارٍ التحقق من الدفع" : "Verifying payment", body: locale === "ar" ? "سيتم تفعيل خطتك بعد تأكيد مزوّد الدفع." : "Your plan activates once the payment provider confirms." });
    if (c === "failed" || c === "canceled") toast({ kind: "error", title: locale === "ar" ? "لم تكتمل عملية الدفع" : "Payment not completed" });
  }, [params, toast, locale]);

  async function pay() {
    if (!checkout) return;
    setBusy(true);
    const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...checkout, provider, coupon: coupon || undefined }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.url) { window.location.href = data.url; return; }
    if (data.demo) return toast({ kind: "info", title: locale === "ar" ? "وضع تجريبي — لا يوجد دفع فعلي" : "Demo mode — no real payment" });
    toast({ kind: "error", title: locale === "ar" ? "تعذّر بدء الدفع" : "Couldn't start checkout", body: data?.error?.code === "provider_not_configured" ? `${data.error.variable} ${locale === "ar" ? "غير مُعد" : "not configured"}` : data?.error?.message });
  }

  async function doCancel() {
    const res = await fetch("/api/billing/cancel", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.demo) return toast({ kind: "info", title: locale === "ar" ? "وضع تجريبي — لم يتغير شيء" : "Demo mode — nothing changed" });
    if (!res.ok) return toast({ kind: "error", title: data?.error?.message ?? "Failed" });
    toast({ kind: "success", title: locale === "ar" ? "سيتم إلغاء الاشتراك في نهاية الفترة" : "Subscription will cancel at period end" });
  }

  async function openPortal() {
    setBusy(true);
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.url) { window.location.href = data.url; return; }
    if (data.demo) return toast({ kind: "info", title: locale === "ar" ? "وضع تجريبي — لا يوجد حساب دفع" : "Demo mode — no billing account" });
    toast({ kind: "error", title: locale === "ar" ? "تعذّر فتح بوابة الدفع" : "Couldn't open the billing portal", body: data?.error?.message });
  }

  const current = p.plan && p.plan !== "enterprise" ? getPlan(p.plan as PlanCode) ?? null : null;
  const meters = [
    [locale === "ar" ? "الموظفون الأذكياء" : "AI employees", p.usage.employees, p.usage.employeeLimit],
    [locale === "ar" ? "الدقائق الصوتية" : "Voice minutes", p.usage.voiceMinutes, p.usage.voiceLimit],
    [locale === "ar" ? "المحادثات" : "Conversations", p.usage.conversations, p.usage.conversationLimit],
  ] as const;

  return (
    <>
      <PageHeader title={t.dash.nav.billing} demo={p.demo} />
      {p.status === "past_due" && current && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
          <p className="min-w-[200px] flex-1">{locale === "ar" ? "لم نستلم دفعة التجديد. ادفع الآن حتى لا يتوقف موظفوك الأذكياء." : "We haven't received your renewal payment. Pay now so your AI employees keep working."}</p>
          {p.billingProvider === "stripe"
            ? <Button size="sm" onClick={openPortal} disabled={busy}>{locale === "ar" ? "تحديث طريقة الدفع" : "Update payment method"}</Button>
            : <Button size="sm" onClick={() => setCheckout({ plan: p.plan as PlanCode, interval: p.interval === "annual" ? "annual" : "monthly" })}>{locale === "ar" ? "ادفع الآن" : "Pay now"}</Button>}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="glow-border bg-violet/[0.05]">
          <p className="text-sm text-muted">{locale === "ar" ? "خطتك الحالية" : "Current plan"}</p>
          {current ? (
            <>
              <div className="mt-2 flex items-center gap-2"><h2 className="font-display text-3xl font-semibold">{current.name[locale]}</h2><Badge tone={statusTone(p.status ?? "")}>{p.status}</Badge></div>
              <p className="mt-1 text-muted">{formatMoney(p.interval === "annual" ? current.annual : current.monthly, "KWD", locale)} {p.interval === "annual" ? t.pricing.perYear : t.pricing.perMonth}</p>
              {p.renews && <p className="mt-4 text-sm">{p.cancelAtPeriodEnd ? (locale === "ar" ? "ينتهي في " : "Ends on ") : (locale === "ar" ? "يتجدد تلقائياً في " : "Renews automatically on ")}<span className="font-semibold">{formatDate(p.renews, locale, { timeStyle: undefined })}</span></p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {p.billingProvider === "stripe" && <Button variant="outline" size="sm" onClick={openPortal} disabled={busy}><CreditCard className="h-4 w-4" />{locale === "ar" ? "طريقة الدفع والفواتير" : "Payment method & invoices"}</Button>}
                {!p.cancelAtPeriodEnd && <Button variant="ghost" size="sm" className="text-rose-300" onClick={() => setCancel(true)}>{locale === "ar" ? "إلغاء الاشتراك" : "Cancel subscription"}</Button>}
              </div>
            </>
          ) : p.plan === "enterprise" ? <p className="mt-2 font-display text-3xl font-semibold">{locale === "ar" ? "المؤسسات" : "Enterprise"}</p> : <p className="mt-2 text-lg">{locale === "ar" ? "لا يوجد اشتراك نشط — اختر خطة لبدء التجربة المجانية." : "No active subscription — choose a plan to start your free trial."}</p>}
        </Card>
        <Card>
          <p className="mb-4 text-sm font-semibold">{locale === "ar" ? "الاستخدام هذا الشهر" : "Usage this month"}</p>
          <div className="space-y-4">
            {meters.map(([l, used, max]) => {
              const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
              return (
                <div key={l}>
                  <div className="mb-1.5 flex justify-between text-sm"><span>{l}</span><span className="text-muted">{used.toLocaleString()} / {max.toLocaleString()}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className={cn("h-full rounded-full", pct > 90 ? "bg-rose-400" : pct > 70 ? "bg-amber-300" : "bg-brand-gradient")} /></div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <h2 className="mb-6 mt-10 text-center font-display text-xl font-semibold">{locale === "ar" ? "تغيير الخطة" : "Change plan"}</h2>
      <PricingCards current={p.plan ?? undefined} onChoose={(plan, interval) => setCheckout({ plan: plan as PlanCode, interval })} />
      <BillingAddons providers={p.providers} />

      <h2 className="mb-3 mt-10 font-semibold">{locale === "ar" ? "سجل الفواتير" : "Billing history"}</h2>
      {p.payments.length === 0 ? <EmptyState icon={<Receipt className="h-6 w-6" />} title={t.dash.empty} /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-line text-xs text-muted"><tr>{[locale === "ar" ? "التاريخ" : "Date", locale === "ar" ? "المبلغ" : "Amount", locale === "ar" ? "الطريقة" : "Method", locale === "ar" ? "المزوّد" : "Provider", t.common.status, locale === "ar" ? "الإيصال" : "Receipt"].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{p.payments.map((x) => (
              <tr key={x.id}><td className="px-4 py-3">{x.date}</td><td className="px-4 py-3 font-medium">{formatMoney(x.amount, x.currency, locale)}</td><td className="px-4 py-3 text-muted">{x.method}</td><td className="px-4 py-3 text-muted">{x.provider}</td><td className="px-4 py-3"><Badge tone={statusTone(x.status)}>{x.status}</Badge></td><td className="px-4 py-3">{x.receiptUrl ? <a href={x.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-electric hover:underline">{locale === "ar" ? "عرض" : "View"}<ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-muted">—</span>}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <AnimatePresence>
        {checkout && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCheckout(null)}>
            <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }} className="glass w-full max-w-md bg-ink-2 p-6">
              <div className="flex justify-between"><h2 className="font-display text-lg font-semibold">{locale === "ar" ? "إتمام الاشتراك" : "Checkout"}</h2><button onClick={() => setCheckout(null)}><X className="h-5 w-5" /></button></div>
              <div className="mt-4 flex items-baseline justify-between rounded-xl bg-white/[0.04] p-4">
                <span>{getPlan(checkout.plan).name[locale]} · {t.pricing[checkout.interval]}</span>
                <span className="font-display text-xl font-semibold">{formatMoney(checkout.interval === "annual" ? getPlan(checkout.plan).annual : getPlan(checkout.plan).monthly, "KWD", locale)}</span>
              </div>
              <p className="label mt-5">{locale === "ar" ? "طريقة الدفع" : "Payment method"}</p>
              <div className="grid gap-2">
                {([["myfatoorah", locale === "ar" ? "كي نت، بطاقات، Apple Pay (MyFatoorah)" : "KNET, cards, Apple Pay (MyFatoorah)", p.providers.myfatoorah], ["stripe", locale === "ar" ? "بطاقات دولية، Apple Pay، Google Pay (Stripe)" : "International cards, Apple Pay, Google Pay (Stripe)", p.providers.stripe]] as const).map(([k, l, ready]) => (
                  <button key={k} onClick={() => setProvider(k)} className={cn("flex items-center justify-between rounded-xl border px-4 py-3 text-start text-sm", provider === k ? "border-violet bg-violet/10" : "border-line")}>
                    <span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-electric" />{l}</span>
                    {!ready && <Badge tone="amber">{t.common.notConfigured}</Badge>}
                  </button>
                ))}
              </div>
              <label className="label mt-5" htmlFor="coupon">{locale === "ar" ? "كود الخصم" : "Coupon code"}</label>
              <input id="coupon" dir="ltr" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className="input" maxLength={32} />
              <Button className="mt-6 w-full py-3" onClick={pay} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{locale === "ar" ? "المتابعة للدفع الآمن" : "Continue to secure payment"}</Button>
              <p className="mt-3 text-center text-[11px] text-muted">{locale === "ar" ? "لا يتم تفعيل الخطة إلا بعد تأكيد مزوّد الدفع." : "Your plan activates only after the payment provider confirms."}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <ConfirmDialog open={cancel} onClose={() => setCancel(false)} onConfirm={doCancel} danger title={locale === "ar" ? "إلغاء الاشتراك؟" : "Cancel subscription?"} body={locale === "ar" ? "يبقى اشتراكك فعالاً حتى نهاية الفترة الحالية ثم يتوقف موظفوك الأذكياء." : "You keep access until the end of the current period, then your AI employees stop answering."} confirmLabel={locale === "ar" ? "تأكيد الإلغاء" : "Confirm cancel"} />
    </>
  );
}
