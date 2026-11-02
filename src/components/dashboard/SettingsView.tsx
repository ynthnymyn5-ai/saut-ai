"use client";
import { ShieldCheck } from "lucide-react";
import { ActivityLogCard, DeleteAccountCard, DeliveriesCard, WeeklyReportCard, OrganizationCard, ProfileCard, TeamCard } from "@/components/settings/AccountSettings";
import { VoicesCard } from "@/components/settings/VoicesCard";
import { useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";

export function SettingsView({ demo, privacy, canManage = false }: { demo: boolean; privacy: { recordingEnabled: boolean; consentMessage: string; retentionDays: number }; team?: unknown; canManage?: boolean }) {
  const { t, locale } = useI18n();
  const ar = locale === "ar";
  const toast = useToast();
  const [p, setP] = useState(privacy);

  async function save() {
    const res = await fetch("/api/settings/privacy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast({ kind: "error", title: data?.error?.message ?? "Failed" });
    toast({ kind: data.demo ? "info" : "success", title: data.demo ? (ar ? "وضع تجريبي — لم يُحفظ" : "Demo mode — not saved") : (ar ? "تم الحفظ" : "Saved") });
  }

  return (
    <>
      <PageHeader title={t.dash.nav.settings} demo={demo} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileCard />
        <OrganizationCard />
        <Card>
          <div className="mb-5 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-electric" /><h2 className="font-semibold">{ar ? "الخصوصية وتسجيل المكالمات" : "Privacy & call recording"}</h2></div>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line p-4">
            <div><p className="text-sm font-medium">{ar ? "تسجيل المكالمات" : "Record calls"}</p><p className="text-xs text-muted">{ar ? "مقفل افتراضياً. يسمع المتصل رسالة الموافقة قبل التسجيل." : "Off by default. Callers hear the consent message before recording starts."}</p></div>
            <input type="checkbox" checked={p.recordingEnabled} onChange={(e) => setP({ ...p, recordingEnabled: e.target.checked })} className="h-5 w-5 accent-violet" />
          </label>
          <div className="mt-4"><label className="label" htmlFor="consent">{ar ? "رسالة الموافقة" : "Consent message"}</label><textarea id="consent" dir="auto" rows={2} maxLength={500} value={p.consentMessage} onChange={(e) => setP({ ...p, consentMessage: e.target.value })} className="input" /></div>
          <div className="mt-4"><label className="label" htmlFor="ret">{ar ? "مدة الاحتفاظ بالبيانات (بالأيام)" : "Data retention (days)"}</label><input id="ret" type="number" min={1} max={3650} value={p.retentionDays} onChange={(e) => setP({ ...p, retentionDays: Number(e.target.value) })} className="input" /><p className="mt-1 text-xs text-muted">{ar ? "تُحذف المحادثات والتسجيلات تلقائياً بعد هذه المدة." : "Conversations and recordings are deleted automatically after this period."}</p></div>
          <Button className="mt-5" onClick={save}>{t.common.save}</Button>
        </Card>
        <TeamCard />
        <VoicesCard />
        {canManage && !demo && <WeeklyReportCard />}
        {canManage && !demo && <DeliveriesCard />}
        {canManage && !demo && <ActivityLogCard />}
        <DeleteAccountCard demo={demo} />
      </div>
    </>
  );
}
