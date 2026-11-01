"use client";
import { Brain, Send } from "lucide-react";
import { useState } from "react";
import { Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate, formatMoney, formatNumber } from "@/lib/utils";
import { ErrorNote, SourceTag, useApi, useMutate, useTr } from "./shared";

type M = {
  calls: { total: number; answered: number; missed: number; talk_minutes: number; avg_call_seconds: number };
  conversations: { total: number; by_channel: Record<string, number>; escalated: number; negative: number };
  top_intents: [string, number][];
  appointments: { created: number; by_status: Record<string, number> };
  leads: { new: number; converted: number; lost: number; conversion_rate: number | null; lost_reasons: Record<string, number> };
  customers: { new: number; returning: number };
  revenue: { source: string; converted_value?: number; reason?: string };
  agents: { id: string; name: string; role: string; conversations: number; calls: number; escalations: number; appointments_booked: number; tool_success_rate: number | null; denied_actions: number }[];
};
type Est = { time_saved_hours: { value: number; formula: string } };
type Resp = { demo?: boolean; current: M; previous: M; estimated: Est; reports: { id: string; question: string; interpretation: string | null; created_at: string }[] };
type Answer = { measured: { current: M; previous: M }; estimated: Est; interpretation: string | null; aiAvailable: boolean };

const QUESTIONS: [string, string][] = [
  ["Why did my sales decrease this month?", "ليش انخفضت مبيعاتي هذا الشهر؟"],
  ["Which services are most requested?", "ما الخدمات الأكثر طلباً؟"],
  ["How many customers did we lose?", "كم عميل خسرنا؟"],
  ["Which AI employee performs best?", "أي موظف ذكي أداؤه الأفضل؟"],
  ["How much time did AI save my team?", "كم وقت وفّر الذكاء الاصطناعي لفريقي؟"],
];

function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (!prev) return <span className="text-[11px] text-muted">—</span>;
  const d = Math.round(((cur - prev) / prev) * 100);
  const good = invert ? d < 0 : d > 0;
  return <span className={cn("text-[11px] tabular-nums", d === 0 ? "text-muted" : good ? "text-emerald-300" : "text-rose-300")}>{d > 0 ? "+" : ""}{d}%</span>;
}

export function Intelligence({ demo }: { demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data, error, loading } = useApi<Resp>("/api/bi/reports");
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState("this_month");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const ask = async (question: string) => {
    setAsking(true); setQ(question);
    const r = await mutate("/api/bi/ask", "POST", { question, period, locale });
    setAsking(false);
    if (r) setAnswer(r);
  };

  if (data?.demo || demo) return (
    <>
      <PageHeader title={tr("SO Business Intelligence", "ذكاء الأعمال من سو")} demo />
      <EmptyState icon={<Brain className="h-6 w-6" />} title={tr("Reports are built from your real data", "التقارير تُبنى من بياناتك الحقيقية")} body={tr("Connect Supabase to analyse calls, conversations, leads and appointments. SO never fabricates statistics, so demo mode shows no figures here.", "اربط Supabase لتحليل المكالمات والمحادثات والعملاء والمواعيد. سو لا يختلق أرقاماً، لذلك لا تظهر أرقام في الوضع التجريبي.")} />
    </>
  );

  const c = data?.current, p = data?.previous;
  const kpis: [string, number, number, boolean][] = c && p ? [
    [tr("Calls", "المكالمات"), c.calls.total, p.calls.total, false],
    [tr("Missed calls", "المكالمات الفائتة"), c.calls.missed, p.calls.missed, true],
    [tr("Conversations", "المحادثات"), c.conversations.total, p.conversations.total, false],
    [tr("Appointments", "المواعيد"), c.appointments.created, p.appointments.created, false],
    [tr("New leads", "عملاء محتملون جدد"), c.leads.new, p.leads.new, false],
    [tr("Converted leads", "عملاء تم تحويلهم"), c.leads.converted, p.leads.converted, false],
    [tr("Lost leads", "عملاء مفقودون"), c.leads.lost, p.leads.lost, true],
    [tr("Returning customers", "عملاء عائدون"), c.customers.returning, p.customers.returning, false],
  ] : [];

  return (
    <>
      <PageHeader title={tr("SO Business Intelligence", "ذكاء الأعمال من سو")} subtitle={tr("This month vs. the same number of days before it", "هذا الشهر مقارنة بنفس عدد الأيام قبله")} />
      <ErrorNote error={error} />

      <Card className="mb-6">
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim().length > 2) ask(q); }} className="flex flex-col gap-2 sm:flex-row">
          <input id="bi-q" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Ask SO about your business…", "اسأل سو عن عملك…")} className="input flex-1" maxLength={500} />
          <select aria-label="period" className="input sm:w-44" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {[["this_month", "This month", "هذا الشهر"], ["last_month", "Last month", "الشهر الماضي"], ["last_7_days", "Last 7 days", "آخر ٧ أيام"], ["last_30_days", "Last 30 days", "آخر ٣٠ يوماً"]].map(([v, en, ar]) => <option key={v} value={v}>{locale === "ar" ? ar : en}</option>)}
          </select>
          <button type="submit" disabled={asking} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet px-4 py-2.5 text-sm font-semibold shadow-glow disabled:opacity-50"><Send className="h-4 w-4 rtl:-scale-x-100" />{asking ? tr("Analysing…", "يحلّل…") : tr("Ask", "اسأل")}</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">{QUESTIONS.map(([en, ar]) => <button key={en} type="button" onClick={() => ask(locale === "ar" ? ar : en)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-violet/50 hover:text-white">{locale === "ar" ? ar : en}</button>)}</div>
        {answer && (
          <div className="mt-5 space-y-3 border-t border-line pt-5">
            <div className="rounded-xl border border-violet/30 bg-violet/[0.05] p-4">
              <div className="mb-2"><SourceTag kind="ai" /></div>
              {answer.interpretation ? <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed">{answer.interpretation}</p> : <p className="text-sm text-muted">{tr("AI interpretation is unavailable (OPENAI_API_KEY not set). The measured figures below are complete.", "التفسير بالذكاء الاصطناعي غير متاح (OPENAI_API_KEY غير مُعد). الأرقام المقاسة أدناه كاملة.")}</p>}
            </div>
            <p className="text-xs text-muted">{tr("The interpretation may only use the measured and estimated figures shown on this page. Causes are hypotheses.", "التفسير يستخدم فقط الأرقام المقاسة والتقديرية الظاهرة في هذه الصفحة. الأسباب فرضيات.")}</p>
          </div>
        )}
      </Card>

      {loading || !c || !p ? <Skeleton className="h-64" /> : (
        <>
          <div className="mb-2 flex items-center gap-2"><h2 className="text-sm font-semibold">{tr("Key numbers", "الأرقام الرئيسية")}</h2><SourceTag kind="measured" /></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(([l, cur, prev, inv]) => (
              <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><div className="mt-2 flex items-baseline gap-2"><span className="font-display text-2xl font-semibold tabular-nums">{formatNumber(cur, locale)}</span><Delta cur={cur} prev={prev} invert={inv} /></div></Card>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{tr("Revenue", "الإيرادات")}</h3><SourceTag kind="measured" /></div>
              {c.revenue.source === "crm_deal_values" ? <><p className="font-display text-2xl font-semibold tabular-nums">{formatMoney(c.revenue.converted_value ?? 0, "KWD", locale)}</p><p className="mt-1 text-xs text-muted">{tr("Sum of deal values on converted leads in the CRM.", "مجموع قيم الصفقات للعملاء المحوّلين في نظام العملاء.")}</p></>
                : <p className="text-sm text-muted">{tr("Not available: connect a sales/POS integration or record deal values on converted leads.", "غير متاح: اربط نظام مبيعات/نقاط بيع أو سجّل قيمة الصفقة للعملاء المحوّلين.")}</p>}
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{tr("Time saved", "الوقت الموفَّر")}</h3><SourceTag kind="estimated" /></div>
              <p className="font-display text-2xl font-semibold tabular-nums">{formatNumber(data!.estimated.time_saved_hours.value, locale)} {tr("hrs", "ساعة")}</p>
              <p className="mt-1 text-[11px] text-muted" dir="ltr">{data!.estimated.time_saved_hours.formula}</p>
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{tr("Most requested", "الأكثر طلباً")}</h3><SourceTag kind="measured" /></div>
              {c.top_intents.length === 0 ? <p className="text-sm text-muted">{tr("No classified conversations yet.", "لا توجد محادثات مصنّفة بعد.")}</p> : (
                <ul className="space-y-2">{c.top_intents.slice(0, 5).map(([k, v]) => { const max = c.top_intents[0][1]; return (
                  <li key={k}><div className="mb-1 flex justify-between text-sm"><span>{k.replace(/_/g, " ")}</span><span className="tabular-nums text-muted">{v}</span></div><div className="h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${(v / max) * 100}%` }} /></div></li>); })}</ul>
              )}
            </Card>
          </div>

          <Card className="mt-4 overflow-x-auto p-0">
            <div className="flex items-center gap-2 p-5 pb-3"><h3 className="font-semibold">{tr("AI employee performance", "أداء الموظفين الأذكياء")}</h3><SourceTag kind="measured" /></div>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-y border-line text-xs text-muted"><tr>{[tr("Employee", "الموظف"), tr("Conversations", "محادثات"), tr("Calls", "مكالمات"), tr("Bookings", "حجوزات"), tr("Escalations", "تصعيدات"), tr("Action success", "نجاح الإجراءات"), tr("Blocked actions", "إجراءات محظورة")].map((h) => <th key={h} className="px-4 py-2.5 text-start font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line tabular-nums">{c.agents.map((a) => (
                <tr key={a.id}><td className="px-4 py-2.5 font-medium">{a.name} <span className="text-xs text-muted">· {a.role}</span></td><td className="px-4 py-2.5">{a.conversations}</td><td className="px-4 py-2.5">{a.calls}</td><td className="px-4 py-2.5">{a.appointments_booked}</td><td className="px-4 py-2.5">{a.escalations}</td><td className="px-4 py-2.5">{a.tool_success_rate === null ? "—" : `${a.tool_success_rate}%`}</td><td className="px-4 py-2.5">{a.denied_actions}</td></tr>
              ))}</tbody>
            </table>
          </Card>

          {data!.reports.length > 0 && (
            <Card className="mt-4">
              <h3 className="mb-3 font-semibold">{tr("Previous questions", "أسئلة سابقة")}</h3>
              <ul className="space-y-2">{data!.reports.map((r) => (
                <li key={r.id}><details className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm">{r.question} <span className="text-xs text-muted">· {formatDate(r.created_at, locale)}</span></summary>{r.interpretation ? <p dir="auto" className="mt-2 whitespace-pre-line text-sm text-white/85">{r.interpretation}</p> : <p className="mt-2 text-xs text-muted">{tr("No AI interpretation stored.", "لا يوجد تفسير محفوظ.")}</p>}</details></li>
              ))}</ul>
            </Card>
          )}
        </>
      )}
    </>
  );
}
