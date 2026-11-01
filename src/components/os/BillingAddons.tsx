"use client";
import { Building2, Mic, MessageCircle, UserPlus } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatMoney } from "@/lib/utils";
import { useApi, useMutate, useTr } from "./shared";

type Resp = {
  demo?: boolean;
  usage: { voiceMinutes: { used: number; limit: number }; conversations: { used: number; limit: number }; whatsappMessages: { used: number; limit: number }; employees: { used: number; limit: number } };
  addons: { id: string; kind: string; quantity: number; unit_price: number; status: string; period_end: string | null }[];
  prices: { extra_employee?: number; voice_minutes_500?: number; messages_2000?: number };
};

/** Usage-based extras. Purchases stay "pending" until the payment provider confirms. */
export function BillingAddons({ providers }: { providers: { stripe: boolean; myfatoorah: boolean } }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data } = useApi<Resp>("/api/billing/addons");
  const [packs, setPacks] = useState<Record<string, number>>({ extra_employee: 1, voice_minutes: 1, messages: 1 });
  const [provider, setProvider] = useState<"myfatoorah" | "stripe">(providers.myfatoorah || !providers.stripe ? "myfatoorah" : "stripe");
  const items = [
    ["extra_employee", UserPlus, tr("Extra AI employee", "موظف ذكي إضافي"), tr("+1 employee this month", "+١ موظف هذا الشهر"), data?.prices.extra_employee],
    ["voice_minutes", Mic, tr("Voice minutes", "دقائق صوتية"), tr("+500 minutes per pack", "+٥٠٠ دقيقة لكل باقة"), data?.prices.voice_minutes_500],
    ["messages", MessageCircle, tr("Messaging allowance", "رصيد الرسائل"), tr("+2,000 WhatsApp messages per pack", "+٢٠٠٠ رسالة واتساب لكل باقة"), data?.prices.messages_2000],
  ] as const;

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-display text-xl font-semibold">{tr("Add-ons", "الإضافات")}</h2>
      <p className="mb-4 text-sm text-muted">{tr("Top up for the current month. Limits rise only after your payment is confirmed by the provider.", "زِد رصيدك لهذا الشهر. ترتفع الحدود فقط بعد تأكيد مزوّد الدفع.")}</p>
      {data?.demo ? <p className="text-sm text-muted">{tr("Demo mode: add-ons can't be purchased.", "وضع تجريبي: لا يمكن شراء الإضافات.")}</p> : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {(["myfatoorah", "stripe"] as const).map((p) => (
              <button key={p} onClick={() => setProvider(p)} className={cn("rounded-xl border px-3 py-1.5 text-xs font-semibold", provider === p ? "border-violet bg-violet/15" : "border-line text-muted")}>
                {p === "myfatoorah" ? "KNET / MyFatoorah" : "Card / Stripe"}{!providers[p] && ` · ${tr("not configured", "غير مُعد")}`}
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {items.map(([k, I, name, desc, price]) => (
              <Card key={k} className="flex flex-col">
                <I className="h-5 w-5 text-electric" />
                <p className="mt-3 font-semibold">{name}</p>
                <p className="text-xs text-muted">{desc}</p>
                <p className="mt-3 font-display text-xl font-semibold tabular-nums">{price ? formatMoney(price, "KWD", locale) : "—"}<span className="text-xs font-normal text-muted"> / {tr("pack", "باقة")}</span></p>
                <div className="mt-3 flex items-center gap-2">
                  <input aria-label={tr("Packs", "عدد الباقات")} type="number" min={1} max={20} value={packs[k]} onChange={(e) => setPacks({ ...packs, [k]: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className="input w-20" />
                  <Button size="sm" disabled={!price} onClick={async () => { const r = await mutate("/api/billing/addons", "POST", { kind: k, packs: packs[k], provider }); if (r?.url) window.location.href = r.url; }}>{tr("Buy", "شراء")}</Button>
                </div>
              </Card>
            ))}
          </div>
          {!!data?.addons.length && (
            <ul className="mt-4 space-y-1.5">{data.addons.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm"><Badge tone={a.status === "active" ? "green" : a.status === "pending" ? "amber" : "gray"}>{a.status}</Badge>{a.kind.replace("_", " ")} · <span className="tabular-nums">{a.quantity.toLocaleString()}</span></li>
            ))}</ul>
          )}
        </>
      )}
      <Card className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Building2 className="h-6 w-6 text-violet-soft" />
        <div className="flex-1"><p className="font-semibold">{tr("Enterprise", "المؤسسات")}</p><p className="text-sm text-muted">{tr("Many branches, custom AI employees and integrations, SLA and security review. Priced by agreement.", "فروع متعددة، موظفون وتكاملات مخصصة، اتفاقية مستوى خدمة ومراجعة أمنية. السعر حسب الاتفاق.")}</p></div>
        <p className="text-sm">{tr("Contact", "تواصل")}: <span className="select-all font-mono text-electric">sales@saut.ai</span></p>
      </Card>
    </section>
  );
}
