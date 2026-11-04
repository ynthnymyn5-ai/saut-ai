"use client";
import { LifeBuoy, Mail } from "lucide-react";
import { useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { CONTACT_EMAIL } from "@/lib/contact";

export function SupportForm({ demo }: { demo: boolean }) {
  const { t, locale } = useI18n();
  const ar = locale === "ar";
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    const res = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast({ kind: "error", title: data?.error?.message ?? "Failed" });
    form.reset();
    toast({ kind: data.demo ? "info" : "success", title: data.demo ? (ar ? "وضع تجريبي — لم تُرسل التذكرة" : "Demo mode — ticket not sent") : (ar ? "تم إرسال التذكرة" : "Ticket submitted") });
  }

  return (
    <>
      <PageHeader title={t.dash.nav.support} demo={demo} />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div><label className="label" htmlFor="subject">{ar ? "الموضوع" : "Subject"}</label><input id="subject" name="subject" required minLength={3} maxLength={200} dir="auto" className="input" /></div>
            <div><label className="label" htmlFor="priority">{ar ? "الأولوية" : "Priority"}</label>
              <select id="priority" name="priority" className="input" defaultValue="normal">{["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
            <div><label className="label" htmlFor="body">{ar ? "التفاصيل" : "Details"}</label><textarea id="body" name="body" required minLength={10} maxLength={10000} rows={6} dir="auto" className="input" /></div>
            <Button type="submit" disabled={busy}>{busy ? t.common.loading : ar ? "إرسال" : "Submit ticket"}</Button>
          </form>
        </Card>
        <Card className="flex flex-col items-start gap-3">
          <LifeBuoy className="h-6 w-6 text-electric" />
          <h2 className="font-semibold">{ar ? "نحن هنا للمساعدة" : "We're here to help"}</h2>
          <p className="text-sm text-muted">{ar ? "نرد عادة خلال يوم عمل واحد (الأحد–الخميس، توقيت الكويت). خطط الأعمال والاحترافي تحصل على أولوية." : "We usually reply within one business day (Sun–Thu, Kuwait time). Business and Pro plans get priority."}</p>
          <a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" className="inline-flex items-center gap-2 text-sm text-violet-soft hover:text-white"><Mail className="h-4 w-4" />{CONTACT_EMAIL}</a>
        </Card>
      </div>
    </>
  );
}
