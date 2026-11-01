"use client";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";

type Settings = { demo?: boolean; configured: boolean; status?: string; verifiedAt?: string | null; domain?: string; greeting_ar?: string; greeting_en?: string; color?: string; title?: string; snippetAr?: string; snippetEn?: string; previewUrl?: string };

export function WidgetSetup({ demo, canEdit }: { demo: boolean; canEdit: boolean }) {
  const tr = useTr();
  const mutate = useMutate();
  const { data, loading, error, reload } = useApi<Settings>("/api/widget/settings", { pollMs: 15000 });
  const [f, setF] = useState({ domain: "", title: "", greeting_ar: "", greeting_en: "", color: "#8B5CF6" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [lang, setLang] = useState<"ar" | "en">("ar");
  useEffect(() => { if (data?.configured) setF({ domain: data.domain ?? "", title: data.title ?? "", greeting_ar: data.greeting_ar ?? "", greeting_en: data.greeting_en ?? "", color: data.color ?? "#8B5CF6" }); }, [data?.configured, data?.domain]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(rotate = false) {
    if (busy) return;
    if (rotate && !window.confirm(tr("Create a new key? The old snippet stops working until you replace it on your site.", "إنشاء مفتاح جديد؟ سيتوقف الكود القديم حتى تستبدله في موقعك."))) return;
    setBusy(true);
    try { if (await mutate("/api/widget/settings", "POST", { ...f, rotate_key: rotate }, tr("Saved", "تم الحفظ"))) reload(); } finally { setBusy(false); }
  }
  const snippet = lang === "ar" ? data?.snippetAr : data?.snippetEn;
  const connected = data?.status === "connected" && !!data?.verifiedAt;

  return (
    <>
      <PageHeader title={tr("Website chat widget", "ودجت الدردشة للموقع")} subtitle={tr("Put your AI employee on your website. Visitors chat with it; you see every conversation in the inbox and can reply yourself.", "ضع موظفك الذكي في موقعك. يتحدث معه الزوار، وترى كل محادثة في صندوق المحادثات ويمكنك الرد بنفسك.")} demo={demo} />
      <Link href="/dashboard/integrations" className="mb-4 inline-block text-sm text-violet-soft hover:text-white">← {tr("All integrations", "كل التكاملات")}</Link>
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-64" /> : demo || data?.demo ? (
        <Card><p className="text-sm text-amber-200">{tr("Demo mode: the widget needs a real account.", "وضع تجريبي: الودجت يحتاج حساباً حقيقياً.")}</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Globe className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("1. Settings", "١. الإعدادات")}</h2></div>
              {data?.configured && (connected ? <Badge tone="green">{tr("Live on your site", "يعمل على موقعك")}</Badge> : <Badge tone="amber">{tr("Waiting for first load", "بانتظار أول تشغيل")}</Badge>)}
            </div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div><label className="label" htmlFor="w-domain">{tr("Your website domain", "نطاق موقعك")}</label><input id="w-domain" required dir="ltr" className="input" placeholder="example.com" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} disabled={!canEdit} />
                <p className="mt-1 text-xs text-muted">{tr("The widget only works on this domain and its subdomains.", "يعمل الودجت فقط على هذا النطاق ونطاقاته الفرعية.")}</p></div>
              <div><label className="label" htmlFor="w-title">{tr("Title shown in the chat", "العنوان في نافذة الدردشة")}</label><input id="w-title" maxLength={60} dir="auto" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={!canEdit} /></div>
              <div><label className="label" htmlFor="w-gar">{tr("Greeting (Arabic)", "رسالة الترحيب (عربي)")}</label><input id="w-gar" maxLength={300} dir="rtl" className="input" value={f.greeting_ar} onChange={(e) => setF({ ...f, greeting_ar: e.target.value })} disabled={!canEdit} /></div>
              <div><label className="label" htmlFor="w-gen">{tr("Greeting (English)", "رسالة الترحيب (إنجليزي)")}</label><input id="w-gen" maxLength={300} dir="ltr" className="input" value={f.greeting_en} onChange={(e) => setF({ ...f, greeting_en: e.target.value })} disabled={!canEdit} /></div>
              <div className="flex items-center gap-3"><label className="label m-0" htmlFor="w-color">{tr("Colour", "اللون")}</label><input id="w-color" type="color" className="h-9 w-14 cursor-pointer rounded border border-line bg-transparent" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} disabled={!canEdit} /></div>
              {canEdit && <div className="flex flex-wrap gap-2 pt-2"><Button type="submit" disabled={busy}>{data?.configured ? tr("Save", "حفظ") : tr("Create widget", "إنشاء الودجت")}</Button>
                {data?.configured && <Button type="button" variant="ghost" disabled={busy} onClick={() => save(true)}>{tr("New key", "مفتاح جديد")}</Button>}</div>}
            </form>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">{tr("2. Add it to your website", "٢. أضفه إلى موقعك")}</h2>
            {!data?.configured ? <p className="text-sm text-muted">{tr("Save the settings first — the code appears here.", "احفظ الإعدادات أولاً — سيظهر الكود هنا.")}</p> : (
              <>
                <p className="text-sm text-muted">{tr("Paste this line before </body> on every page (or in your site builder's “custom code” box).", "الصق هذا السطر قبل ‎</body>‎ في كل صفحة (أو في خانة «كود مخصص» في منصة موقعك).")}</p>
                <div className="mt-3 flex gap-1.5">{(["ar", "en"] as const).map((l) => <button key={l} type="button" onClick={() => setLang(l)} className={`rounded-lg border px-2.5 py-1 text-xs ${lang === l ? "border-violet bg-violet/15" : "border-line text-muted"}`}>{l === "ar" ? "عربي" : "English"}</button>)}</div>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-line bg-black/40 p-3 text-xs" dir="ltr"><code>{snippet}</code></pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(snippet ?? ""); setCopied(lang); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard blocked */ } }}>{copied === lang ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied === lang ? tr("Copied", "تم النسخ") : tr("Copy code", "نسخ الكود")}</Button>
                  <a href={`${data.previewUrl}?lang=${lang}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold hover:border-violet/50"><ExternalLink className="h-4 w-4" />{tr("Open a test chat", "افتح دردشة تجريبية")}</a>
                </div>
                <p className="mt-4 text-xs text-muted">{connected ? tr("Your widget has loaded on your site. New chats appear in Conversations.", "تم تشغيل الودجت على موقعك. تظهر المحادثات الجديدة في صفحة المحادثات.") : tr("Status changes to “Live on your site” automatically the first time the widget opens on your domain. The test chat here is real: messages go to your inbox and use your AI quota.", "تتغير الحالة إلى «يعمل على موقعك» تلقائياً أول مرة يُفتح فيها الودجت على نطاقك. الدردشة التجريبية هنا حقيقية: تصل الرسائل لصندوق المحادثات وتُحسب من استخدامك.")}</p>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
