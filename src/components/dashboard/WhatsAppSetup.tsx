"use client";
import { Check, CircleDashed, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { cn, formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

type Data = {
  demo?: boolean; env: Record<string, boolean>; webhookUrl: string; openai: boolean; connected: boolean; lastError: string | null;
  display: string | null; activeEmployee: boolean; lastInboundAt: string | null; canConnect?: boolean;
  webhookLast?: { at: string | null; outcome: string | null; field: string | null; messages: number | null } | null; subscribedApps?: string[] | null;
};

/**
 * Step-by-step WhatsApp connection guide with live checks. Every tick comes from the
 * server (env names present, integration verified by Meta, real inbound message) —
 * nothing is marked done just because the user clicked through.
 */
export function WhatsAppSetup() {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data, loading, error, reload } = useApi<Data>("/api/whatsapp/setup", { pollMs: 15000 });
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1500); };
  const envOk = data ? Object.values(data.env).every(Boolean) : false;

  const steps: { done: boolean; title: string; body: React.ReactNode }[] = data ? [
    {
      done: data.activeEmployee,
      title: tr("Activate an AI employee", "فعّل موظفاً ذكياً"),
      body: <p>{tr("The active employee answers WhatsApp messages.", "الموظف المفعّل هو الذي يرد على رسائل واتساب.")} {!data.activeEmployee && <Link className="text-electric underline" href="/dashboard/employees/new">{tr("Create one", "أنشئ موظفاً")}</Link>}</p>,
    },
    {
      // Proven by Meta itself: a verified connection or an app subscribed to the WhatsApp account means the app exists.
      done: data.connected || !!data.lastInboundAt || (data.subscribedApps?.length ?? 0) > 0,
      title: tr("Create a Meta app with WhatsApp", "أنشئ تطبيقاً في Meta مع واتساب"),
      body: <p>{tr("developers.facebook.com → My apps → Create app → “Connect with customers through WhatsApp” → link your business portfolio.", "developers.facebook.com ← تطبيقاتي ← إنشاء تطبيق ← «التواصل مع العملاء عبر واتساب» ← اربط حساب الأعمال.")} <a className="inline-flex items-center gap-1 text-electric underline" href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">{tr("Open", "فتح")}<ExternalLink className="h-3 w-3" /></a></p>,
    },
    {
      done: envOk,
      title: tr("Add the 4 settings in Vercel", "أضف الإعدادات الأربعة في Vercel"),
      body: (
        <div className="space-y-2">
          <p>{tr("Vercel → your project → Environment Variables. Copy values from Meta → WhatsApp → API Setup and App settings → Basic. Never paste them in chat.", "Vercel ← مشروعك ← Environment Variables. انسخ القيم من Meta ← WhatsApp ← API Setup ومن App settings ← Basic. لا تلصقها في أي محادثة.")}</p>
          <ul className="space-y-1.5">
            {([
              ["WHATSAPP_PHONE_NUMBER_ID", tr("Phone number ID (API Setup)", "Phone number ID من API Setup")],
              ["WHATSAPP_ACCESS_TOKEN", tr("Access token (starts EAA…)", "Access token ويبدأ بـ EAA…")],
              ["WHATSAPP_APP_SECRET", tr("App secret (App settings → Basic)", "App secret من App settings ← Basic")],
              ["WHATSAPP_VERIFY_TOKEN", tr("Any word you choose, e.g. saut-cafe-2026", "أي كلمة تختارها، مثل saut-cafe-2026")],
            ] as const).map(([k, hint]) => (
              <li key={k} className="flex flex-wrap items-center gap-2">
                {data.env[k] ? <Check className="h-4 w-4 text-emerald-300" /> : <CircleDashed className="h-4 w-4 text-muted" />}
                <code dir="ltr" className="rounded bg-black/30 px-1.5 py-0.5 text-xs">{k}</code>
                <button type="button" onClick={() => copy(k, k)} className="text-muted hover:text-white" aria-label={tr("Copy name", "نسخ الاسم")}>{copied === k ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}</button>
                <span className="text-xs text-muted">{hint}</span>
              </li>
            ))}
          </ul>
          {!envOk && <p className="text-xs text-amber-200">{tr("After saving them, Redeploy in Vercel. This page updates by itself.", "بعد حفظها اضغط Redeploy في Vercel. هذه الصفحة تتحدّث تلقائياً.")}</p>}
        </div>
      ),
    },
    {
      done: data.connected || !!data.lastInboundAt,
      title: tr("Point Meta's webhook to SAUT AI", "اربط Webhook في Meta بتطبيقك"),
      body: (
        <div className="space-y-2">
          <p>{tr("Meta → WhatsApp → Configuration → Webhook → Edit. Paste:", "Meta ← WhatsApp ← Configuration ← Webhook ← Edit. الصق:")}</p>
          <div className="flex items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/40 px-3 py-2 text-xs">{data.webhookUrl}</code>
            <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line" onClick={() => copy("url", data.webhookUrl)} aria-label={tr("Copy", "نسخ")}>{copied === "url" ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}</button></div>
          <p>{tr("Verify token: the same word you put in WHATSAPP_VERIFY_TOKEN → Verify and save. Then under Webhook fields, Subscribe to “messages”.", "Verify token: نفس الكلمة التي وضعتها في WHATSAPP_VERIFY_TOKEN ← Verify and save. ثم في Webhook fields اضغط Subscribe بجانب «messages».")}</p>
        </div>
      ),
    },
    {
      done: data.connected,
      title: tr("Verify the connection", "تحقّق من الربط"),
      body: (
        <div className="space-y-2">
          <p>{tr("SAUT AI asks Meta to confirm your number. It shows Connected only if Meta says yes.", "يطلب التطبيق من Meta تأكيد رقمك، ولا يظهر «متصل» إلا إذا أكّدت Meta.")}{data.display && <> · <span dir="ltr">+{data.display.replace(/^\+/, "")}</span></>}</p>
          {data.lastError && <p className="text-xs text-rose-300">{data.lastError}</p>}
          {data.canConnect ? (
            <Button size="sm" disabled={!envOk || busy} onClick={async () => { setBusy(true); await mutate("/api/integrations/whatsapp", "POST", {}, tr("WhatsApp check finished", "انتهى فحص واتساب")); setBusy(false); reload(); }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}{data.connected ? tr("Check again", "افحص مجدداً") : tr("Connect WhatsApp", "اربط واتساب")}
            </Button>
          ) : <p className="text-xs text-muted">{tr("Only owners and admins can connect integrations.", "فقط المالك ومدير النظام يربطون التكاملات.")}</p>}
        </div>
      ),
    },
    {
      done: !!data.lastInboundAt,
      title: tr("Send a test message", "أرسل رسالة تجربة"),
      body: <p>{data.lastInboundAt
        ? tr(`Last message received ${formatDate(data.lastInboundAt, locale)}. Open Conversations to see the reply.`, `آخر رسالة وصلت ${formatDate(data.lastInboundAt, locale)}. افتح المحادثات لترى الرد.`)
        : tr("From your phone, send “hello” to the WhatsApp number. (With Meta's test number, first add your phone under API Setup → To.)", "من جوالك أرسل «هلا» إلى رقم واتساب. (مع الرقم التجريبي من Meta أضف رقمك أولاً في API Setup ← To.)")}
        {!data.lastInboundAt && <WaDiagnostics d={data} />}
        {!data.openai && <span className="block text-xs text-amber-200">{tr("OPENAI_API_KEY is missing, so messages reach staff but the AI won't reply.", "OPENAI_API_KEY غير موجود، فالرسائل تصل للموظفين لكن الذكاء الاصطناعي لن يرد.")}</span>}</p>,
    },
  ] : [];
  const firstOpen = steps.findIndex((s) => !s.done);

  return (
    <>
      <PageHeader title={tr("Connect WhatsApp", "ربط واتساب")} subtitle={tr("About 15 minutes. Ticks update automatically from real checks.", "حوالي ١٥ دقيقة. العلامات تتحدّث تلقائياً من فحوصات حقيقية.")} demo={!!data?.demo} />
      <ErrorNote error={error} />
      {loading || !data ? <Skeleton className="h-96" /> : (
        <Card>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400/15"><MessageCircle className="h-5 w-5 text-emerald-300" /></div>
            <div className="flex-1"><p className="font-semibold">WhatsApp Business</p><p className="text-xs text-muted">{steps.filter((s) => s.done).length} / {steps.length}</p></div>
            {data.connected ? <Badge tone="green">{tr("Connected", "متصل")}</Badge> : <Badge>{tr("Not connected", "غير متصل")}</Badge>}
            <button type="button" onClick={reload} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white" aria-label={tr("Refresh", "تحديث")}><RefreshCw className="h-4 w-4" /></button>
          </div>
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className={cn("rounded-2xl border p-4 transition", s.done ? "border-emerald-400/25 bg-emerald-400/[0.04]" : i === firstOpen ? "border-violet/40 bg-violet/[0.06]" : "border-line")}>
                <div className="flex items-center gap-3">
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", s.done ? "bg-emerald-400 text-ink" : i === firstOpen ? "bg-brand-gradient" : "bg-white/10")}>{s.done ? <Check className="h-4 w-4" /> : i + 1}</span>
                  <p className="font-medium">{s.title}</p>
                </div>
                {(!s.done || i === firstOpen) && <div className="mt-2 ps-10 text-sm text-white/80">{s.body}</div>}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  );
}

/** Where messages stop, from real signals: Meta's subscription list and the last webhook delivery. */
function WaDiagnostics({ d }: { d: Data }) {
  const tr = useTr();
  const { locale } = useI18n();
  const lines: { ok: boolean; text: string }[] = [];
  if (d.subscribedApps === null || d.subscribedApps === undefined) lines.push({ ok: false, text: tr("Couldn't check which app receives this account's messages (WHATSAPP_BUSINESS_ACCOUNT_ID / token).", "ما قدرنا نتأكد أي تطبيق يستقبل رسائل الحساب (WHATSAPP_BUSINESS_ACCOUNT_ID أو الرمز).") });
  else if (d.subscribedApps.length === 0) lines.push({ ok: false, text: tr("No app is subscribed to your WhatsApp account, so Meta sends messages nowhere. Press “Connect WhatsApp” again.", "ما فيه أي تطبيق مشترك في حساب واتساب، فـ Meta ما ترسل الرسائل لأي مكان. اضغط «اربط واتساب» مرة ثانية.") });
  else lines.push({ ok: true, text: tr(`Subscribed app: ${d.subscribedApps.join(", ")}`, `التطبيق المشترك: ${d.subscribedApps.join("، ")}`) });
  const w = d.webhookLast;
  if (!w?.at) lines.push({ ok: false, text: tr("Meta hasn't sent anything to the webhook yet. If you messaged the number, the Meta app may need to be published, or the callback URL isn't saved.", "Meta ما أرسلت أي شي للـ Webhook للحين. إذا راسلت الرقم، ممكن تطبيق Meta يحتاج نشر، أو رابط الاستدعاء ما انحفظ.") });
  else {
    const when = formatDate(w.at, locale);
    const map: Record<string, [boolean, string, string]> = {
      received: [true, `Meta delivered an event (${w.field ?? "?"}, ${w.messages ?? 0} message(s)) ${when}.`, `وصل حدث من Meta (${w.field ?? "?"}، ${w.messages ?? 0} رسالة) ${when}.`],
      bad_signature: [false, `Meta reached us ${when} but the signature didn't match: WHATSAPP_APP_SECRET in Vercel isn't this app's secret.`, `Meta وصلت ${when} بس التوقيع ما تطابق: قيمة WHATSAPP_APP_SECRET في Vercel مو المفتاح السري لهذا التطبيق.`],
      no_app_secret: [false, `Meta reached us ${when} but WHATSAPP_APP_SECRET is missing.`, `Meta وصلت ${when} بس WHATSAPP_APP_SECRET ناقص.`],
      no_connected_business: [false, `A message arrived ${when} but no business is connected to that number. Press “Connect WhatsApp”.`, `وصلت رسالة ${when} بس ما فيه نشاط مربوط بهذا الرقم. اضغط «اربط واتساب».`],
    };
    const m = map[w.outcome ?? ""] ?? [false, `Last event ${when}: ${w.outcome}`, `آخر حدث ${when}: ${w.outcome}`];
    lines.push({ ok: m[0], text: locale === "ar" ? m[2] : m[1] });
  }
  return (
    <span className="mt-2 block space-y-1 rounded-xl border border-line p-3 text-xs">
      <span className="block font-semibold">{tr("Diagnostics", "تشخيص")}</span>
      {lines.map((l, i) => <span key={i} className={l.ok ? "block text-emerald-300" : "block text-amber-200"}>{l.ok ? "✓ " : "• "}{l.text}</span>)}
    </span>
  );
}
