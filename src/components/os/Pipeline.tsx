"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Lightbulb, Plus, Target, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Button, Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { ErrorNote, SourceTag, useApi, useMutate, useTr } from "./shared";

type Lead = {
  id: string; stage: Stage; score: number; score_reasons: { points: number; reason: string }[]; source: string; interest: string | null;
  estimated_value: number | null; next_follow_up_at: string | null; stage_changed_at: string; created_at: string;
  customer: { id: string; name: string | null; phone: string | null } | null;
};
type Stage = "new" | "contacted" | "interested" | "qualified" | "converted" | "lost";
const STAGES: [Stage, string, string][] = [["new", "New lead", "عميل جديد"], ["contacted", "Contacted", "تم التواصل"], ["interested", "Interested", "مهتم"], ["qualified", "Qualified", "مؤهّل"], ["converted", "Converted", "تم التحويل"], ["lost", "Lost", "مفقود"]];

const DEMO: Lead[] = [
  { id: "d1", stage: "new", score: 23, score_reasons: [], source: "whatsapp", interest: "Catering for 40 guests", estimated_value: null, next_follow_up_at: "2026-10-31T09:00:00Z", stage_changed_at: "2026-10-30T10:00:00Z", created_at: "2026-10-30T10:00:00Z", customer: { id: "c3", name: "Khalid Al-Otaibi (Demo)", phone: "+966 50 000 0103" } },
  { id: "d2", stage: "interested", score: 58, score_reasons: [], source: "phone", interest: "Private room, monthly team lunch", estimated_value: 450, next_follow_up_at: "2026-11-01T09:00:00Z", stage_changed_at: "2026-10-28T10:00:00Z", created_at: "2026-10-20T10:00:00Z", customer: { id: "c1", name: "Abdullah Al-Mutairi (Demo)", phone: "+965 5000 0101" } },
  { id: "d3", stage: "qualified", score: 81, score_reasons: [], source: "phone", interest: "Wedding reception dessert table", estimated_value: 1200, next_follow_up_at: null, stage_changed_at: "2026-10-29T10:00:00Z", created_at: "2026-10-15T10:00:00Z", customer: { id: "c6", name: "Hessa Al-Sabah (Demo)", phone: "+965 5000 0106" } },
  { id: "d4", stage: "converted", score: 100, score_reasons: [], source: "web_chat", interest: "Corporate breakfast boxes", estimated_value: 320, next_follow_up_at: null, stage_changed_at: "2026-10-25T10:00:00Z", created_at: "2026-10-10T10:00:00Z", customer: { id: "c5", name: "James Carter (Demo)", phone: "+965 5000 0105" } },
];

export function Pipeline({ demo }: { demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const mutate = useMutate();
  const { data, error, loading, reload } = useApi<{ leads: Lead[]; demo?: boolean }>("/api/leads");
  const leads = data?.demo ? DEMO : data?.leads ?? [];
  const [drag, setDrag] = useState<string | null>(null);
  const [sel, setSel] = useState<Lead | null>(null);
  const [lost, setLost] = useState<{ id: string; reason: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ phone: "", name: "", interest: "", value: "" });
  const [suggestion, setSuggestion] = useState<{ rules: { action: string; dueInDays: number } | null; ai: string | null } | null>(null);

  const totals = useMemo(() => Object.fromEntries(STAGES.map(([s]) => [s, leads.filter((l) => l.stage === s)])), [leads]);
  const move = async (id: string, stage: Stage, lost_reason?: string) => {
    if (stage === "lost" && !lost_reason) { setLost({ id, reason: "" }); return; }
    if (await mutate(`/api/leads/${id}`, "PATCH", { stage, lost_reason }, tr("Lead moved", "تم نقل العميل"))) reload();
  };
  const ACTIONS: Record<string, [string, string]> = {
    call_back_personally: ["Call them back personally (negative sentiment last time)", "اتصل بهم شخصياً (تجربة سلبية سابقة)"],
    send_quote: ["Send a quotation", "أرسل عرض سعر"], confirm_appointment: ["Confirm their appointment", "أكّد موعدهم"],
    re_engage: ["Re-engage: no contact for over a week", "أعد التواصل: لا تواصل منذ أكثر من أسبوع"], first_contact: ["Make first contact", "تواصل أول مرة"], check_in: ["Check in", "تابع معهم"],
  };

  return (
    <>
      <PageHeader title={tr("Sales pipeline", "مسار المبيعات")} subtitle={tr("Drag a lead to change its stage. Scores are computed from recorded interactions.", "اسحب العميل لتغيير مرحلته. التقييم محسوب من التفاعلات المسجّلة.")} demo={demo}
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{tr("Add lead", "إضافة عميل محتمل")}</Button>} />
      <ErrorNote error={error} />
      {loading ? <Skeleton className="h-96" /> : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1080px] grid-cols-6 gap-3">
            {STAGES.map(([s, en, ar]) => (
              <div key={s} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag) move(drag, s); setDrag(null); }}
                className={cn("flex min-h-[420px] flex-col rounded-2xl border border-line bg-white/[0.015] p-2.5", drag && "border-dashed border-violet/40")}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-sm font-semibold">{locale === "ar" ? ar : en}</p>
                  <span className="text-xs text-muted tabular-nums">{totals[s].length}</span>
                </div>
                <div className="space-y-2">
                  {totals[s].map((l) => (
                    <button key={l.id} draggable onDragStart={() => setDrag(l.id)} onDragEnd={() => setDrag(null)} onClick={() => { setSel(l); setSuggestion(null); }}
                      className="glass w-full cursor-grab p-3 text-start transition hover:border-violet/40 active:cursor-grabbing">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium">{l.customer?.name ?? l.customer?.phone ?? "—"}</p>
                        <span className={cn("rounded-md px-1.5 text-[11px] font-bold tabular-nums", l.score >= 70 ? "bg-emerald-400/15 text-emerald-300" : l.score >= 40 ? "bg-amber-300/15 text-amber-200" : "bg-white/5 text-muted")}>{l.score}</span>
                      </div>
                      {l.interest && <p className="mt-1 line-clamp-2 text-xs text-muted">{l.interest}</p>}
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                        <Badge>{l.source}</Badge>
                        {l.estimated_value !== null && <span className="tabular-nums">{formatMoney(Number(l.estimated_value), "KWD", locale)}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {sel && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSel(null)}>
            <motion.aside onClick={(e) => e.stopPropagation()} initial={{ x: locale === "ar" ? "-100%" : "100%" }} animate={{ x: 0 }} exit={{ x: locale === "ar" ? "-100%" : "100%" }} transition={{ type: "spring", damping: 30, stiffness: 280 }} className="h-full w-full max-w-md overflow-y-auto border-s border-line bg-ink-2 p-6">
              <div className="flex justify-between"><div><h2 className="font-display text-lg font-semibold">{sel.customer?.name ?? "—"}</h2><p className="text-sm text-muted" dir="ltr">{sel.customer?.phone}</p></div><button onClick={() => setSel(null)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <label className="label mt-6" htmlFor="lead-stage">{tr("Stage", "المرحلة")}</label>
              <select id="lead-stage" className="input" value={sel.stage} onChange={(e) => { move(sel.id, e.target.value as Stage); setSel({ ...sel, stage: e.target.value as Stage }); }}>{STAGES.map(([s, en, ar]) => <option key={s} value={s}>{locale === "ar" ? ar : en}</option>)}</select>
              <Card className="mt-4">
                <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-semibold"><Target className="h-4 w-4 text-electric" />{tr("Lead score", "تقييم العميل")} · <span className="tabular-nums">{sel.score}</span></p><SourceTag kind="rules" /></div>
                {sel.score_reasons.length > 0 && <ul className="mt-2 space-y-1 text-xs text-muted">{sel.score_reasons.map((r, i) => <li key={i} className="flex justify-between"><span>{r.reason.replace(/_/g, " ")}</span><span className="tabular-nums">{r.points > 0 ? "+" : ""}{r.points}</span></li>)}</ul>}
              </Card>
              {sel.next_follow_up_at && <p className="mt-4 text-sm">{tr("Next follow-up", "المتابعة القادمة")}: <b>{formatDate(sel.next_follow_up_at, locale)}</b></p>}
              <Button variant="outline" className="mt-4 w-full" disabled={demo} onClick={async () => { const r = await mutate(`/api/leads/${sel.id}/suggest`, "POST"); if (r) setSuggestion(r); }}><Lightbulb className="h-4 w-4" />{tr("Suggest a follow-up", "اقترح متابعة")}</Button>
              {suggestion && (
                <div className="mt-4 space-y-3">
                  {suggestion.rules && <Card className="p-4"><div className="mb-1"><SourceTag kind="rules" /></div><p className="text-sm">{(ACTIONS[suggestion.rules.action] ?? [suggestion.rules.action, suggestion.rules.action])[locale === "ar" ? 1 : 0]}</p></Card>}
                  {suggestion.ai ? <Card className="p-4"><div className="mb-1"><SourceTag kind="ai" /></div><p dir="auto" className="whitespace-pre-line text-sm">{suggestion.ai}</p></Card> : <p className="text-xs text-muted">{tr("AI suggestions need OPENAI_API_KEY and at least one recorded interaction.", "اقتراحات الذكاء الاصطناعي تتطلب OPENAI_API_KEY وتفاعلاً مسجّلاً واحداً على الأقل.")}</p>}
                </div>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {(lost || adding) && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={() => { setLost(null); setAdding(false); }}>
          <form onClick={(e) => e.stopPropagation()} className="glass w-full max-w-md space-y-3 bg-ink-2 p-6" onSubmit={async (e) => {
            e.preventDefault();
            if (lost) { await move(lost.id, "lost", lost.reason); setLost(null); return; }
            const r = await mutate("/api/leads", "POST", { phone: form.phone, name: form.name || undefined, interest: form.interest || undefined, estimated_value: form.value ? Number(form.value) : undefined }, tr("Lead added", "تمت الإضافة"));
            if (r) { setAdding(false); setForm({ phone: "", name: "", interest: "", value: "" }); reload(); }
          }}>
            <h3 className="font-display text-lg font-semibold">{lost ? tr("Why was this lead lost?", "لماذا خسرنا هذا العميل؟") : tr("Add lead", "إضافة عميل محتمل")}</h3>
            {lost ? <input id="lost-reason" required className="input" dir="auto" value={lost.reason} onChange={(e) => setLost({ ...lost, reason: e.target.value })} placeholder={tr("e.g. price, chose competitor, no reply", "مثل: السعر، اختار منافساً، لا رد")} /> : (
              <>
                <input id="lead-phone" required className="input" dir="ltr" placeholder="+965 ..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <input id="lead-name" className="input" dir="auto" placeholder={tr("Name", "الاسم")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input id="lead-interest" className="input" dir="auto" placeholder={tr("Interested in…", "مهتم بـ…")} value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })} />
                <input id="lead-value" className="input" type="number" min={0} step="0.001" placeholder={tr("Estimated value (KWD)", "القيمة التقديرية (د.ك)")} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </>
            )}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setLost(null); setAdding(false); }}>{tr("Cancel", "إلغاء")}</Button><Button type="submit">{tr("Save", "حفظ")}</Button></div>
          </form>
        </div>
      )}
    </>
  );
}
