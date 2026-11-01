"use client";
import { motion } from "framer-motion";
import { Bot, CalendarCheck, Clock, MessagesSquare, Phone, PhoneIncoming, PhoneMissed, Plus } from "lucide-react";
import Link from "next/link";
import { SoMascot } from "@/components/brand/SoMascot";
import { DailyChart, MonthlyChart } from "@/components/dashboard/Charts";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, statusTone } from "@/components/ui/primitives";
import type { DemoEmployee } from "@/lib/demo-data";
import { useI18n } from "@/lib/i18n/client";
import { formatDate, formatNumber } from "@/lib/utils";

export type Conv = { id: string; customer: string; employee: string; channel: string; status: string; at: string; summary: string; sentiment: string; duration: number };

export function Overview(p: {
  demo: boolean;
  stats: { totalCalls: number; answered: number; missed: number; aiConversations: number; appointments: number; hoursSaved: number };
  daily: { day: string; calls: number; chats: number }[];
  monthly: { month: string; calls: number; chats: number }[];
  recent: Conv[];
  employees: DemoEmployee[];
}) {
  const { t, locale } = useI18n();
  const s = t.dash.stats;
  const cards = [
    [s.total, p.stats.totalCalls, Phone, "text-violet-soft"],
    [s.answered, p.stats.answered, PhoneIncoming, "text-emerald-300"],
    [s.missed, p.stats.missed, PhoneMissed, "text-rose-300"],
    [s.ai, p.stats.aiConversations, MessagesSquare, "text-electric"],
    [s.appointments, p.stats.appointments, CalendarCheck, "text-amber-300"],
    [s.saved, `${formatNumber(p.stats.hoursSaved, locale)} ${s.hours}`, Clock, "text-violet-soft"],
  ] as const;

  return (
    <>
      <PageHeader
        title={t.dash.nav.overview}
        subtitle={locale === "ar" ? "آخر ٣٠ يوماً" : "Last 30 days"}
        demo={p.demo}
        actions={<ButtonLink href="/dashboard/employees/new" size="lg"><Plus className="h-4 w-4" />{t.dash.create}</ButtonLink>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, I, color], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="group transition hover:border-violet/30">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted">{label}</p>
                <I className={`h-5 w-5 ${color}`} />
              </div>
              <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{typeof value === "number" ? formatNumber(value, locale) : value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card><h2 className="mb-4 font-semibold">{t.dash.daily}</h2><DailyChart data={p.daily} /></Card>
        <Card>
          <h2 className="mb-4 font-semibold">{t.dash.monthly}</h2>
          {p.monthly.length ? <MonthlyChart data={p.monthly} /> : <EmptyState icon={<Clock className="h-6 w-6" />} title={t.dash.empty} body={locale === "ar" ? "ستظهر الأرقام الشهرية بعد أول شهر." : "Monthly totals appear after your first month."} />}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card className="p-0">
          <div className="flex items-center justify-between p-5 pb-3"><h2 className="font-semibold">{t.dash.recent}</h2><Link href="/dashboard/conversations" className="text-xs text-violet-soft hover:text-white">{t.dash.viewAll}</Link></div>
          {p.recent.length === 0 ? <div className="p-5 pt-0"><EmptyState icon={<MessagesSquare className="h-6 w-6" />} title={t.dash.empty} /></div> : (
            <ul className="divide-y divide-line">
              {p.recent.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 text-xs font-semibold">{c.customer.slice(0, 1)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{c.customer}</span><Badge tone={statusTone(c.status)}>{c.status}</Badge><span className="text-[11px] text-muted">{c.channel} · {c.employee}</span></div>
                    <p className="mt-0.5 truncate text-sm text-muted">{c.summary}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">{formatDate(c.at, locale, { dateStyle: undefined, timeStyle: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">{t.dash.activity}</h2>
          {p.employees.length === 0 ? (
            <EmptyState icon={<Bot className="h-6 w-6" />} title={t.dash.empty} action={<ButtonLink href="/dashboard/employees/new" size="sm">{t.dash.create}</ButtonLink>} />
          ) : (
            <ul className="space-y-3">
              {p.employees.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3">
                  <SoMascot size={44} hue={e.hue} state={e.status === "active" ? "listening" : "idle"} />
                  <div className="flex-1"><p className="text-sm font-semibold">{e.name}</p><p className="text-xs text-muted">{e.callsToday} {t.dash.callsToday}</p></div>
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
