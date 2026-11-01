"use client";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Code2, Database, Globe, KeyRound, Mail, MessageCircle, Phone, Webhook, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";

export type IntegrationRow = { key: string; status: "connected" | "disconnected" | "pending" | "error"; serverReady: boolean; missing: string[]; lastError?: string | null };

const META = {
  whatsapp: { icon: MessageCircle, en: ["WhatsApp Business", "Send confirmations and answer chats on your WhatsApp number."], ar: ["واتساب للأعمال", "إرسال التأكيدات والرد على المحادثات من رقمك."] },
  telephony: { icon: Phone, en: ["Phone numbers", "Twilio or a regional carrier for incoming calls and routing."], ar: ["أرقام الهاتف", "Twilio أو مزوّد محلي لاستقبال المكالمات وتوجيهها."] },
  google_calendar: { icon: CalendarDays, en: ["Google Calendar", "Book appointments directly into your calendar."], ar: ["تقويم Google", "حجز المواعيد مباشرة في تقويمك."] },
  crm: { icon: Database, en: ["CRM platforms", "Sync customers with HubSpot, Salesforce or Zoho."], ar: ["أنظمة CRM", "مزامنة العملاء مع HubSpot أو Salesforce أو Zoho."] },
  web_widget: { icon: Globe, en: ["Website chat widget", "Add your AI employee to your website."], ar: ["ودجت الموقع", "أضف موظفك الذكي إلى موقعك."] },
  email: { icon: Mail, en: ["Email", "Send summaries and confirmations by email."], ar: ["البريد الإلكتروني", "إرسال الملخصات والتأكيدات بالبريد."] },
  webhooks: { icon: Webhook, en: ["Webhooks", "Receive events when calls end or bookings are made."], ar: ["Webhooks", "استقبل الأحداث عند انتهاء المكالمات أو الحجوزات."] },
  api: { icon: KeyRound, en: ["API access", "Build on SAUT AI with your own API keys."], ar: ["الوصول عبر API", "ابنِ على SAUT AI بمفاتيح API خاصة بك."] },
} as const;

export function IntegrationsView({ rows, demo }: { rows: IntegrationRow[]; demo: boolean }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState<IntegrationRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect(row: IntegrationRow, form: FormData) {
    setBusy(true);
    const res = await fetch(`/api/integrations/${row.key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (data.redirect) { window.location.href = data.redirect; return; }
    if (!res.ok) return toast({ kind: "error", title: locale === "ar" ? "فشل الربط" : "Connection failed", body: data?.error?.message });
    toast({ kind: data.status === "connected" ? "success" : "info", title: data.message });
    setOpen(null);
  }

  return (
    <>
      <PageHeader title={t.dash.nav.integrations} subtitle={locale === "ar" ? "تظهر الحالة «متصل» فقط بعد نجاح المصادقة." : "Shown as connected only after successful authentication."} demo={demo} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((r) => {
          const m = META[r.key as keyof typeof META];
          const I = m.icon;
          const [name, desc] = m[locale];
          return (
            <div key={r.key} className="glass flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/5"><I className="h-5 w-5 text-electric" /></div>
                {r.status === "connected" ? <Badge tone="green">{t.common.connected}</Badge> : r.status === "error" ? <Badge tone="red">error</Badge> : !r.serverReady ? <Badge tone="amber">{t.common.notConfigured}</Badge> : <Badge>{locale === "ar" ? "غير متصل" : "Not connected"}</Badge>}
              </div>
              <h3 className="mt-4 font-semibold">{name}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{desc}</p>
              {r.key === "whatsapp"
                ? <Link href="/dashboard/integrations/whatsapp" className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white hover:border-violet/50">{r.status === "connected" ? t.common.configure : (locale === "ar" ? "ابدأ الربط خطوة بخطوة" : "Step-by-step setup")}</Link>
                : <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(r)}>{r.status === "connected" ? t.common.configure : t.common.connect}</Button>}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(null)}>
            <motion.form onSubmit={(e) => { e.preventDefault(); connect(open, new FormData(e.currentTarget)); }} onClick={(e) => e.stopPropagation()} initial={{ y: 20 }} animate={{ y: 0 }} className="glass w-full max-w-lg bg-ink-2 p-6">
              <div className="flex justify-between"><h2 className="font-display text-lg font-semibold">{META[open.key as keyof typeof META][locale][0]}</h2><button type="button" onClick={() => setOpen(null)}><X className="h-5 w-5" /></button></div>
              {!open.serverReady && (
                <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-amber-100">
                  <p className="font-semibold">{locale === "ar" ? "متغيرات البيئة المطلوبة على الخادم:" : "Server environment variables required:"}</p>
                  <code className="mt-1 block font-mono text-[11px]" dir="ltr">{open.missing.join("\n")}</code>
                </div>
              )}
              <ConfigFields k={open.key} />
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(null)}>{t.common.cancel}</Button>
                <Button type="submit" disabled={busy || demo}>{busy ? t.common.loading : t.common.connect}</Button>
              </div>
              {demo && <p className="mt-3 text-end text-[11px] text-amber-200">{locale === "ar" ? "الربط معطّل في الوضع التجريبي." : "Connecting is disabled in demo mode."}</p>}
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ConfigFields({ k }: { k: string }) {
  const { locale } = useI18n();
  const f = (name: string, label: string, ph = "", type = "text") => (
    <div key={name}><label className="label" htmlFor={name}>{label}</label><input id={name} name={name} type={type} placeholder={ph} dir="ltr" className="input" /></div>
  );
  const fields: Record<string, React.ReactNode[]> = {
    whatsapp: [f("display_phone", locale === "ar" ? "رقم واتساب للأعمال" : "WhatsApp Business number", "+965 ...")],
    telephony: [f("phone_number", locale === "ar" ? "الرقم المراد ربطه" : "Number to connect", "+965 ..."), f("employee_id", locale === "ar" ? "معرّف الموظف الذكي" : "AI employee ID")],
    google_calendar: [<p key="g" className="text-sm text-muted">{locale === "ar" ? "سيتم تحويلك إلى Google لمنح الإذن." : "You'll be redirected to Google to grant access."}</p>],
    crm: [f("crm", "CRM", "hubspot | salesforce | zoho"), f("api_token", "API token", "", "password")],
    web_widget: [f("domain", locale === "ar" ? "نطاق موقعك" : "Your website domain", "example.com")],
    email: [f("reply_to", "Reply-to", "hello@example.com", "email")],
    webhooks: [f("url", "Endpoint URL", "https://example.com/hooks/saut")],
    api: [f("key_name", locale === "ar" ? "اسم المفتاح" : "Key name", "Production")],
  };
  return <div className="mt-5 space-y-4">{fields[k]}</div>;
}
