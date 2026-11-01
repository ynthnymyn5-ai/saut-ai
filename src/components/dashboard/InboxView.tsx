"use client";
import { ArrowLeft, Bot, Inbox, MessagesSquare, Search, Send, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, statusTone } from "@/components/ui/primitives";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";

type Row = { id: string; channel: string; status: string; summary: string; sentiment: string; at: string; handledBy: string; assignedUser: string | null; unread: boolean; customer: { id: string | null; name: string | null; phone: string | null }; employee: string | null };
type Msg = { id: string; role: "customer" | "ai" | "human" | "system"; content: string; created_at: string; delivery_status: string | null };
type Detail = { conversation: Omit<Row, "unread" | "at"> & { started_at: string; whatsappWindowOpen: boolean; transferredTo: string | null }; messages: Msg[] };
type Member = { user_id: string; full_name: string | null; email: string };

const CH_AR: Record<string, string> = { phone: "مكالمة", whatsapp: "واتساب", web_chat: "دردشة الموقع", email: "بريد" };
const ST_AR: Record<string, string> = { active: "نشطة", completed: "مكتملة", transferred: "محوّلة", abandoned: "متروكة" };

export function InboxView({ canOperate }: { canOperate: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const [f, setF] = useState({ status: "", channel: "", assigned: "", unread: false });
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams(Object.entries({ status: f.status, channel: f.channel, assigned: f.assigned, unread: f.unread ? "1" : "", q: debounced }).filter(([, v]) => v) as [string, string][]);
  const list = useApi<{ conversations: Row[]; unreadCount: number; demo?: boolean }>(`/api/conversations?${params}`, { pollMs: 15000 });
  const members = useApi<{ members: Member[]; me: string }>("/api/members");
  const [sel, setSel] = useState<string | null>(null);
  const detail = useApi<Detail>(sel ? `/api/conversations/${sel}` : null, { pollMs: 10000 });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [detail.data?.messages.length]);

  const ch = (c: string) => (locale === "ar" ? CH_AR[c] ?? c : c.replace("_", " "));
  const st = (s: string) => (locale === "ar" ? ST_AR[s] ?? s : s);
  const name = (uid: string | null) => { const m = members.data?.members.find((x) => x.user_id === uid); return m ? m.full_name ?? m.email : null; };
  const c = detail.data?.conversation.id === sel ? detail.data.conversation : undefined; // never show the previous conversation while the next loads

  async function act(body: object, okMsg: string) {
    if (busy || !sel) return false;
    setBusy(true);
    try { const r = await mutate(`/api/so/live/${sel}`, "POST", body, okMsg); if (r) { detail.reload(); list.reload(); } return !!r; } finally { setBusy(false); }
  }
  async function patch(body: object, okMsg: string) {
    if (busy || !sel) return;
    setBusy(true);
    try { if (await mutate(`/api/conversations/${sel}`, "PATCH", body, okMsg)) { detail.reload(); list.reload(); } } finally { setBusy(false); }
  }

  const chip = (active: boolean) => cn("shrink-0 rounded-xl border px-3 py-1.5 text-xs", active ? "border-violet bg-violet/15" : "border-line text-muted");

  return (
    <>
      <PageHeader title={tr("Inbox", "صندوق المحادثات")} subtitle={tr("Every conversation from WhatsApp, calls and chat in one place.", "كل المحادثات من واتساب والمكالمات والدردشة في مكان واحد.")} />
      <ErrorNote error={list.error} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className={cn("space-y-3", sel && "hidden lg:block")}>
          <div className="relative"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search name, phone or summary", "ابحث بالاسم أو الرقم أو الملخص")} className="input ps-9" dir="auto" /></div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button className={chip(f.unread)} onClick={() => setF({ ...f, unread: !f.unread })}>{tr("Unread", "غير مقروءة")}{list.data?.unreadCount ? ` (${list.data.unreadCount})` : ""}</button>
            <button className={chip(f.assigned === "me")} onClick={() => setF({ ...f, assigned: f.assigned === "me" ? "" : "me" })}>{tr("Mine", "المسندة لي")}</button>
            <button className={chip(f.assigned === "unassigned")} onClick={() => setF({ ...f, assigned: f.assigned === "unassigned" ? "" : "unassigned" })}>{tr("Unassigned", "غير مسندة")}</button>
            <select aria-label={tr("Channel", "القناة")} className="input w-auto py-1.5 text-xs" value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
              <option value="">{tr("All channels", "كل القنوات")}</option>{["whatsapp", "phone", "web_chat"].map((x) => <option key={x} value={x}>{ch(x)}</option>)}
            </select>
            <select aria-label={tr("Status", "الحالة")} className="input w-auto py-1.5 text-xs" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">{tr("Any status", "كل الحالات")}</option>{["active", "transferred", "completed", "abandoned"].map((x) => <option key={x} value={x}>{st(x)}</option>)}
            </select>
          </div>
          {list.loading && !list.data ? <Skeleton className="h-96" /> : (list.data?.conversations ?? []).length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title={tr("No conversations", "لا توجد محادثات")} body={tr("Conversations from WhatsApp, calls and your website chat appear here as they happen.", "تظهر هنا محادثات واتساب والمكالمات ودردشة الموقع فور حدوثها.")} />
          ) : (
            <Card className="divide-y divide-line overflow-hidden p-0">
              {list.data!.conversations.map((r) => (
                <button key={r.id} onClick={() => setSel(r.id)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-white/[0.03]", sel === r.id && "bg-violet/[0.08]")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.unread ? "bg-electric" : "bg-transparent")} aria-label={r.unread ? tr("Unread", "غير مقروءة") : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate", r.unread ? "font-semibold" : "font-medium")} dir="auto">{r.customer.name ?? r.customer.phone ?? tr("Unknown", "غير معروف")}</p>
                      <span className="shrink-0 text-[11px] text-muted">{formatDate(r.at, locale, { dateStyle: "short", timeStyle: "short" })}</span>
                    </div>
                    <p className="truncate text-xs text-muted" dir="auto">{r.summary || "—"}</p>
                    <div className="mt-1 flex flex-wrap gap-1"><Badge>{ch(r.channel)}</Badge><Badge tone={statusTone(r.status)}>{st(r.status)}</Badge>{r.handledBy === "human" && <Badge tone="blue">{tr("Human", "موظف")}</Badge>}{r.assignedUser && <Badge tone="gray">{name(r.assignedUser) ?? tr("Assigned", "مسندة")}</Badge>}</div>
                  </div>
                </button>
              ))}
            </Card>
          )}
        </div>

        <div className={cn(!sel && "hidden lg:block")}>
          {!sel ? (
            <EmptyState icon={<MessagesSquare className="h-6 w-6" />} title={tr("Select a conversation", "اختر محادثة")} />
          ) : !c ? (detail.error ? <ErrorNote error={detail.error} /> : <Skeleton className="h-96" />) : (
            <Card className="flex h-[calc(100dvh-12rem)] min-h-[420px] flex-col p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
                <button className="lg:hidden" onClick={() => setSel(null)} aria-label={tr("Back", "رجوع")}><ArrowLeft className="h-5 w-5 rtl:rotate-180" /></button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold" dir="auto">{c.customer.name ?? tr("Unknown customer", "عميل غير معروف")} <span className="text-xs font-normal text-muted" dir="ltr">{c.customer.phone}</span></p>
                  <p className="text-xs text-muted">{ch(c.channel)} · {st(c.status)}{c.employee ? ` · ${c.employee}` : ""} · {c.handledBy === "human" ? tr("handled by staff", "يتولاها موظف") : tr("handled by AI", "يتولاها الذكاء الاصطناعي")}</p>
                </div>
                {canOperate && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={tr("Assign to", "إسناد إلى")} className="input w-auto py-1.5 text-xs" value={c.assignedUser ?? ""} disabled={busy} onChange={(e) => patch({ assigned_user: e.target.value || null }, tr("Assignment updated", "تم تحديث الإسناد"))}>
                      <option value="">{tr("Unassigned", "غير مسندة")}</option>
                      {(members.data?.members ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name ?? m.email}</option>)}
                    </select>
                    {c.handledBy === "ai" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: "join" }, tr("You took over from the AI", "توليت المحادثة بدل الذكاء الاصطناعي"))}><UserRound className="h-4 w-4" />{tr("Take over", "تولَّ المحادثة")}</Button>
                      : <Button size="sm" variant="ghost" disabled={busy} onClick={() => act({ action: "return_to_ai" }, tr("Returned to the AI", "أُعيدت للذكاء الاصطناعي"))}><Bot className="h-4 w-4" />{tr("Return to AI", "أعدها للذكاء الاصطناعي")}</Button>}
                    {c.status !== "completed" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (window.confirm(tr("Close this conversation?", "إغلاق هذه المحادثة؟"))) act({ action: "close" }, tr("Closed", "تم الإغلاق")); }}>{tr("Close", "إغلاق")}</Button>
                      : <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ status: "active" }, tr("Reopened", "أُعيد فتحها"))}>{tr("Reopen", "إعادة فتح")}</Button>}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
                {c.summary && <p className="rounded-xl bg-violet/[0.06] p-3 text-xs"><span className="font-semibold text-violet-soft">{tr("AI summary", "ملخص الذكاء الاصطناعي")}: </span>{c.summary}</p>}
                {detail.data!.messages.length === 0 && <p className="text-center text-sm text-muted">{tr("No messages recorded.", "لا توجد رسائل مسجّلة.")}</p>}
                {detail.data!.messages.map((m) => m.role === "system" ? (
                  <p key={m.id} className="text-center text-[11px] text-muted" dir="auto">{m.content}</p>
                ) : (
                  <div key={m.id} className={cn("flex", m.role === "customer" ? "justify-start" : "justify-end")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "customer" ? "bg-white/[0.06]" : m.role === "human" ? "bg-electric/25" : "bg-violet/70")}>
                      <p dir="auto" className="whitespace-pre-wrap">{m.content}</p>
                      <p className="mt-1 text-[10px] opacity-70">{m.role === "ai" ? "AI" : m.role === "human" ? tr("Staff", "موظف") : ""} {formatDate(m.created_at, locale, { dateStyle: undefined, timeStyle: "short" })}{m.delivery_status ? ` · ${m.delivery_status}` : ""}</p>
                    </div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              {canOperate && c.channel !== "phone" && (
                <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={async (e) => {
                  e.preventDefault();
                  const text = reply.trim(); if (!text) return;
                  if (await act({ action: "reply", text }, tr("Sent", "تم الإرسال"))) setReply("");
                }}>
                  <textarea aria-label={tr("Reply", "الرد")} rows={2} maxLength={4096} dir="auto" className="input flex-1 resize-none" value={reply} onChange={(e) => setReply(e.target.value)}
                    placeholder={c.channel === "whatsapp" && !c.whatsappWindowOpen ? tr("The 24-hour WhatsApp window is closed — free-text replies can't be sent.", "نافذة واتساب (٢٤ ساعة) مغلقة — لا يمكن إرسال رد نصي حر.") : tr("Type a reply… (sending takes over from the AI)", "اكتب رداً… (الإرسال يجعلك تتولى المحادثة)")}
                    disabled={busy || (c.channel === "whatsapp" && !c.whatsappWindowOpen)} />
                  <Button type="submit" disabled={busy || !reply.trim() || (c.channel === "whatsapp" && !c.whatsappWindowOpen)} aria-label={tr("Send", "إرسال")}><Send className="h-4 w-4 rtl:-scale-x-100" /></Button>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
