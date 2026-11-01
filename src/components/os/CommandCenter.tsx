"use client";
import { type LucideIcon, Activity, Bot, CalendarCheck, Check, CheckCircle2, Clock, ListTodo, MessagesSquare, Phone, ShieldAlert, UserPlus, X, Zap } from "lucide-react";
import Link from "next/link";
import { SoMascot, type VoiceState } from "@/components/brand/SoMascot";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { formatNumber } from "@/lib/utils";
import { DemoNoLive, ErrorNote, LiveDot, SourceTag, timeAgo, useApi, useMutate, useStatusLabel, useTr } from "./shared";

type Snapshot = {
  demo?: boolean;
  generatedAt: string;
  agents: { id: string; name: string; role: string; status: string; detail: string | null; activeCalls: number; activeConversations: number }[];
  counters: { activeAgents: number; currentCalls: number; activeConversations: number; completedTasks: number; pendingTasks: number; newLeads: number; bookedAppointments: number; escalated: number; aiUsage: { voiceMinutes: number; conversations: number; whatsappMessages: number }; timeSaved: { value: number; formula: string } };
  approvals: { id: string; agent: string; tool: string; at: string; summary: string }[];
  feed: { at: string; kind: string; agent: string; text: string; status: string; note: string | null }[];
};

const mascotState = (s: string): VoiceState => (["listening", "thinking", "speaking"].includes(s) ? (s as VoiceState) : s === "needs_attention" ? "transfer" : s === "working" ? "thinking" : "idle");

export function CommandCenter({ canApprove }: { canApprove: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const label = useStatusLabel();
  const mutate = useMutate();
  const { data, error, loading, reload } = useApi<Snapshot>("/api/so/command", { pollMs: 5000 });

  if (data?.demo) return (<><PageHeader title={tr("SO Command Center", "مركز قيادة سو")} demo /><DemoNoLive what={tr("The Command Center", "مركز القيادة")} /></>);

  const c = data?.counters;
  const tiles: [string, number, LucideIcon][] = c ? [
    [tr("Active AI employees", "الموظفون النشطون"), c.activeAgents, Bot],
    [tr("Current calls", "مكالمات جارية"), c.currentCalls, Phone],
    [tr("Active conversations", "محادثات نشطة"), c.activeConversations, MessagesSquare],
    [tr("Tasks completed today", "مهام منجزة اليوم"), c.completedTasks, CheckCircle2],
    [tr("Pending tasks", "مهام معلّقة"), c.pendingTasks, ListTodo],
    [tr("New leads today", "عملاء محتملون اليوم"), c.newLeads, UserPlus],
    [tr("Appointments booked today", "مواعيد محجوزة اليوم"), c.bookedAppointments, CalendarCheck],
    [tr("Escalated today", "تصعيدات اليوم"), c.escalated, ShieldAlert],
  ] : [];

  return (
    <>
      <PageHeader
        title={tr("SO Command Center", "مركز قيادة سو")}
        subtitle={data ? `${tr("Live from your systems · updated", "مباشر من أنظمتك · آخر تحديث")} ${timeAgo(data.generatedAt, locale)}` : undefined}
        actions={<Link href="/dashboard/live" className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:border-violet/50"><Activity className="h-4 w-4" />{tr("Live operations", "العمليات المباشرة")}</Link>}
      />
      <ErrorNote error={error} />

      {loading && !data ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div> : c && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {tiles.map(([l, v, I]) => (
            <Card key={l} className="p-4">
              <div className="flex items-start justify-between gap-2"><p className="text-xs text-muted">{l}</p><I className="h-4 w-4 shrink-0 text-violet-soft" /></div>
              <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{formatNumber(v, locale)}</p>
            </Card>
          ))}
        </div>
      )}

      {c && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center justify-between"><p className="text-xs text-muted">{tr("AI usage this month", "استخدام الذكاء الاصطناعي هذا الشهر")}</p><SourceTag kind="measured" /></div>
            <p className="mt-2 text-sm tabular-nums">{formatNumber(c.aiUsage.voiceMinutes, locale)} {tr("voice min", "دقيقة صوت")} · {formatNumber(c.aiUsage.conversations, locale)} {tr("conversations", "محادثة")} · {formatNumber(c.aiUsage.whatsappMessages, locale)} {tr("WhatsApp", "واتساب")}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between"><p className="text-xs text-muted">{tr("Estimated time saved this month", "الوقت الموفَّر تقديرياً هذا الشهر")}</p><SourceTag kind="estimated" /></div>
            <p className="mt-2 font-display text-xl font-semibold tabular-nums">{formatNumber(c.timeSaved.value, locale)} {tr("hours", "ساعة")}</p>
            <p className="mt-1 text-[11px] text-muted" dir="ltr">{c.timeSaved.formula}</p>
          </Card>
        </div>
      )}

      {data && (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <Card>
              <h2 className="mb-4 flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-electric" />{tr("AI workforce", "فريق الذكاء الاصطناعي")}</h2>
              {data.agents.length === 0 ? <EmptyState icon={<Bot className="h-6 w-6" />} title={tr("No AI employees yet", "لا يوجد موظفون أذكياء بعد")} action={<Link href="/dashboard/templates" className="text-sm text-violet-soft">{tr("Start from a template", "ابدأ من قالب")}</Link>} /> : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {data.agents.map((a) => (
                    <li key={a.id}>
                      <Link href={`/dashboard/employees/${a.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-3 transition hover:border-violet/40">
                        <SoMascot size={42} state={mascotState(a.status)} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{a.name}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted"><LiveDot status={a.status} />{label(a.status)}{a.detail ? ` · ${a.detail}` : ""}</p>
                        </div>
                        <span className="flex flex-col items-end gap-0.5 text-[11px] text-muted tabular-nums">{a.activeCalls ? <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{a.activeCalls}</span> : null}{a.activeConversations ? <span className="flex items-center gap-1"><MessagesSquare className="h-3 w-3" />{a.activeConversations}</span> : null}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] text-muted">{tr("Statuses come from backend events (calls, messages, tool runs). Anything older than 2 minutes falls back to Online or Offline.", "الحالات مصدرها أحداث الخادم (مكالمات، رسائل، تنفيذ أدوات). أي حالة أقدم من دقيقتين ترجع إلى متصل أو غير متصل.")}</p>
            </Card>

            <Card id="approvals">
              <h2 className="mb-4 flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4 text-amber-300" />{tr("Waiting for your approval", "بانتظار موافقتك")} {data.approvals.length > 0 && <Badge tone="amber">{data.approvals.length}</Badge>}</h2>
              {data.approvals.length === 0 ? <p className="text-sm text-muted">{tr("Nothing to approve. Sensitive actions (like cancellations) will appear here before they run.", "لا شيء بانتظار الموافقة. الإجراءات الحساسة (مثل الإلغاء) تظهر هنا قبل تنفيذها.")}</p> : (
                <ul className="space-y-2">
                  {data.approvals.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3">
                      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{a.tool.replace(/_/g, " ")} <span className="font-normal text-muted">· {a.agent}</span></p><p className="truncate text-xs text-muted">{a.summary}</p></div>
                      {canApprove ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={async () => { if (await mutate(`/api/so/executions/${a.id}`, "POST", { approve: false }, tr("Rejected", "تم الرفض"))) reload(); }}><X className="h-3.5 w-3.5" />{tr("Reject", "رفض")}</Button>
                          <Button size="sm" onClick={async () => { const r = await mutate(`/api/so/executions/${a.id}`, "POST", { approve: true }); if (r) reload(); }}><Check className="h-3.5 w-3.5" />{tr("Approve & run", "موافقة وتنفيذ")}</Button>
                        </div>
                      ) : <Badge>{tr("Owner/admin approval", "يتطلب مالك/مدير")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="p-0">
            <h2 className="flex items-center gap-2 p-5 pb-3 font-semibold"><Zap className="h-4 w-4 text-violet-soft" />{tr("Activity feed", "سجل النشاط")}</h2>
            {data.feed.length === 0 ? <div className="p-5 pt-0"><EmptyState icon={<Clock className="h-6 w-6" />} title={tr("No activity yet", "لا يوجد نشاط بعد")} body={tr("Calls, messages and AI actions appear here as they happen.", "تظهر المكالمات والرسائل وإجراءات الذكاء الاصطناعي هنا عند حدوثها.")} /></div> : (
              <ol className="max-h-[640px] divide-y divide-line overflow-y-auto">
                {data.feed.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 px-5 py-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.status === "failed" || f.status === "denied" ? "bg-rose-400" : f.status === "pending_confirmation" ? "bg-amber-300" : f.kind === "conversation" ? "bg-electric" : "bg-emerald-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm"><span className="font-medium">{f.agent}</span> <span className="text-muted">{f.kind === "action" ? f.text.replace(/_/g, " ") : f.text}</span></p>
                      {f.note && <p className="truncate text-xs text-rose-300">{f.note}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">{timeAgo(f.at, locale)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
