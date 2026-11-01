"use client";
import { Headphones, MessageCircle, Phone, PhoneForwarded, Send, UserCheck, XCircle, ListPlus, Bot, Globe } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDuration } from "@/lib/utils";
import { DemoNoLive, ErrorNote, LiveDot, timeAgo, useApi, useMutate, useStatusLabel, useTr } from "./shared";

type Item = {
  id: string; channel: string; status: string; handledBy: "ai" | "human"; assignedToMe: boolean; escalated: boolean; task: string | null; intent: string | null;
  startedAt: string; lastActivityAt: string;
  call: { status: string; startedAt: string; canTakeOver: boolean } | null;
  agent: { name: string; status: string } | null;
  customer: { id: string; name: string | null; phone: string | null; tags: string[] } | null;
  transcript: { role: string; content: string; at: string }[];
};
type Live = { demo?: boolean; items: Item[]; health: Record<string, { configured: boolean }>; generatedAt: string };

const CH = { phone: Phone, whatsapp: MessageCircle, web_chat: Globe } as Record<string, typeof Phone>;

export function LiveOps({ canAct }: { canAct: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const label = useStatusLabel();
  const mutate = useMutate();
  const { data, error, loading, reload } = useApi<Live>("/api/so/live", { pollMs: 4000 });
  const [selId, setSelId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [takeoverPhone, setTakeoverPhone] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [task, setTask] = useState("");

  if (data?.demo) return (<><PageHeader title={tr("Live Operations", "العمليات المباشرة")} demo /><DemoNoLive what={tr("Live Operations", "العمليات المباشرة")} /></>);
  const items = data?.items ?? [];
  const sel = items.find((i) => i.id === selId) ?? items[0] ?? null;
  const act = async (body: Record<string, unknown>, msg: string) => { if (sel && (await mutate(`/api/so/live/${sel.id}`, "POST", body, msg))) reload(); };

  return (
    <>
      <PageHeader title={tr("Live Operations", "العمليات المباشرة")} subtitle={tr("Real conversations happening now. Refreshes every few seconds.", "المحادثات الحقيقية الجارية الآن. تتحدّث كل بضع ثوانٍ.")} />
      <ErrorNote error={error} />
      {data && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(["twilio", "whatsapp", "openai"] as const).map((k) => (
            <Badge key={k} tone={data.health[k]?.configured ? "green" : "amber"}>{k === "twilio" ? tr("Telephony", "الاتصالات") : k === "whatsapp" ? "WhatsApp" : tr("AI", "الذكاء الاصطناعي")}: {data.health[k]?.configured ? tr("configured", "مُعد") : tr("not configured", "غير مُعد")}</Badge>
          ))}
        </div>
      )}
      {loading && !data ? <Skeleton className="h-80" /> : items.length === 0 ? (
        <EmptyState icon={<Headphones className="h-6 w-6" />} title={tr("No live conversations right now", "لا توجد محادثات مباشرة الآن")} body={tr("Calls and chats from the last 30 minutes and open escalations appear here.", "تظهر هنا المكالمات والمحادثات خلال آخر ٣٠ دقيقة والتصعيدات المفتوحة.")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <ul className="space-y-2">
            {items.map((i) => {
              const I = CH[i.channel] ?? MessageCircle;
              return (
                <li key={i.id}>
                  <button onClick={() => setSelId(i.id)} className={cn("glass w-full p-3 text-start transition", sel?.id === i.id ? "border-violet/50 bg-violet/[0.06]" : "hover:border-violet/30")}>
                    <div className="flex items-center gap-2">
                      <I className="h-4 w-4 text-electric" />
                      <span className="flex-1 truncate text-sm font-semibold">{i.customer?.name ?? i.customer?.phone ?? tr("Unknown customer", "عميل غير معروف")}</span>
                      {i.escalated && <Badge tone="red">{tr("Escalated", "مصعّد")}</Badge>}
                      {i.handledBy === "human" && <Badge tone="blue">{tr("Human", "موظف")}</Badge>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                      {i.agent && <><LiveDot status={i.agent.status} />{i.agent.name}</>}
                      <span className="ms-auto tabular-nums">{i.call ? formatDuration(Math.round((Date.now() - new Date(i.call.startedAt).getTime()) / 1000)) : timeAgo(i.lastActivityAt, locale)}</span>
                    </div>
                    {i.task && <p className="mt-1 truncate text-xs text-white/70">{i.task}</p>}
                  </button>
                </li>
              );
            })}
          </ul>

          {sel && (
            <Card className="flex min-h-[460px] flex-col p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{sel.customer?.name ?? tr("Unknown customer", "عميل غير معروف")}</p>
                  <p className="text-xs text-muted" dir="ltr">{sel.customer?.phone ?? ""}</p>
                </div>
                <div className="text-end text-xs text-muted">
                  <p className="flex items-center justify-end gap-1.5"><Bot className="h-3.5 w-3.5" />{sel.agent?.name ?? "—"} · {sel.agent ? label(sel.agent.status) : ""}</p>
                  <p>{tr("Current task", "المهمة الحالية")}: {sel.task ?? sel.intent ?? "—"}</p>
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {sel.transcript.length === 0 ? <p className="text-sm text-muted">{tr("No transcript yet.", "لا يوجد نص بعد.")}</p> : sel.transcript.map((m, k) => (
                  <div key={k} className={cn("flex", m.role === "customer" ? "justify-start" : "justify-end")}>
                    <p dir="auto" className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "customer" ? "bg-white/[0.06]" : m.role === "human" ? "bg-electric/25" : "bg-violet/70")}>{m.content}</p>
                  </div>
                ))}
              </div>
              {canAct ? (
                <div className="space-y-3 border-t border-line p-4">
                  <div className="flex flex-wrap gap-2">
                    {sel.handledBy === "ai"
                      ? <Button size="sm" variant="outline" onClick={() => act({ action: "join" }, tr("You joined", "انضممت"))}><UserCheck className="h-3.5 w-3.5" />{tr("Join conversation", "الانضمام")}</Button>
                      : <Button size="sm" variant="outline" onClick={() => act({ action: "return_to_ai" }, tr("Returned to AI", "أعيدت للذكاء الاصطناعي"))}><Bot className="h-3.5 w-3.5" />{tr("Return to AI", "إعادة للذكاء الاصطناعي")}</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setConfirmClose(true)}><XCircle className="h-3.5 w-3.5" />{tr("Close case", "إغلاق الحالة")}</Button>
                  </div>
                  {sel.channel !== "phone" ? (
                    <form onSubmit={(e) => { e.preventDefault(); if (reply.trim()) act({ action: "reply", text: reply }, tr("Sent", "تم الإرسال")).then(() => setReply("")); }} className="flex gap-2">
                      <input id="live-reply" dir="auto" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tr("Reply as a team member…", "الرد كموظف…")} className="input" maxLength={4096} />
                      <Button type="submit" aria-label={tr("Send", "إرسال")}><Send className="h-4 w-4 rtl:-scale-x-100" /></Button>
                    </form>
                  ) : sel.call?.canTakeOver ? (
                    <form onSubmit={(e) => { e.preventDefault(); act({ action: "take_over_call", phone: takeoverPhone.replace(/\s/g, "") }, tr("Call redirected to you", "تم تحويل المكالمة إليك")); }} className="flex gap-2">
                      <input id="takeover" dir="ltr" value={takeoverPhone} onChange={(e) => setTakeoverPhone(e.target.value)} placeholder="+965 ..." className="input" />
                      <Button type="submit" disabled={!/^\+[0-9 ]{8,18}$/.test(takeoverPhone)}><PhoneForwarded className="h-4 w-4" />{tr("Take over call", "استلام المكالمة")}</Button>
                    </form>
                  ) : <p className="text-xs text-muted">{tr("This call has ended or can't be transferred.", "انتهت هذه المكالمة أو لا يمكن تحويلها.")}</p>}
                  <form onSubmit={(e) => { e.preventDefault(); if (task.trim().length > 1) act({ action: "assign_task", title: task }, tr("Task assigned", "تم إسناد المهمة")).then(() => setTask("")); }} className="flex gap-2">
                    <input id="live-task" dir="auto" value={task} onChange={(e) => setTask(e.target.value)} placeholder={tr("Follow-up task, e.g. send quotation", "مهمة متابعة، مثل إرسال عرض سعر")} className="input" maxLength={200} />
                    <Button type="submit" variant="outline"><ListPlus className="h-4 w-4" /></Button>
                  </form>
                </div>
              ) : <p className="border-t border-line p-4 text-xs text-muted">{tr("View only. Ask an owner to give you the Agent role to act on conversations.", "عرض فقط. اطلب من المالك صلاحية الموظف للتعامل مع المحادثات.")}</p>}
            </Card>
          )}
        </div>
      )}
      <ConfirmDialog open={confirmClose} onClose={() => setConfirmClose(false)} onConfirm={() => act({ action: "close" }, tr("Case closed", "أُغلقت الحالة"))} title={tr("Close this case?", "إغلاق هذه الحالة؟")} body={tr("The conversation is marked completed and its open tasks are closed.", "تُعلَّم المحادثة كمكتملة وتُغلق مهامها المفتوحة.")} />
    </>
  );
}
