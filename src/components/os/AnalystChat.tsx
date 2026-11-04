"use client";
import { ArrowUp, Calculator, Loader2, RotateCcw } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { SourceTag, useTr } from "./shared";

type Msg = { role: "user" | "assistant"; content: string; followups?: string[]; periods?: { from: string; to: string }[]; error?: boolean };

const STARTERS: [string, string][] = [
  ["How were my sales this month compared with last month?", "كيف مبيعاتي هذا الشهر مقارنة بالشهر الماضي؟"],
  ["What are my best and worst selling products in the last 30 days?", "شنو أكثر وأقل المنتجات مبيعاً آخر 30 يوم؟"],
  ["Who are my top 10 customers by spend?", "منو أفضل 10 عملاء حسب المبلغ؟"],
  ["Which day of the week and hour are busiest?", "أي يوم بالأسبوع وأي ساعة أكثر زحمة؟"],
  ["How many of my buyers are returning customers?", "كم نسبة العملاء اللي يرجعون يشترون؟"],
  ["How did my AI employees perform this week?", "كيف أداء موظفيني الأذكياء هذا الأسبوع؟"],
];

/** Renders the analyst's light formatting: **bold** and "- " bullets. Text only — no HTML injection. */
function Rich({ text }: { text: string }) {
  const bold = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  return (
    <div className="space-y-1.5 text-sm leading-7">
      {text.split("\n").filter((l) => l.trim()).map((l, i) => {
        const m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l);
        return m ? <div key={i} className="flex gap-2 ps-1"><span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet" /><span>{bold(m[1])}</span></div> : <p key={i}>{bold(l)}</p>;
      })}
    </div>
  );
}

export function AnalystChat({ demo }: { demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (question.length < 2 || busy) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })).slice(-8);
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setText(""); setBusy(true);
    try {
      const r = await fetch("/api/analyst", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: question, locale, history }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = j?.error?.code;
        const msg = code === "provider_not_configured" ? tr("The AI provider isn't connected yet (OpenAI key).", "مزوّد الذكاء الاصطناعي غير متصل بعد (مفتاح OpenAI).")
          : code === "provider_error" ? tr("The AI provider refused the request — usually no OpenAI credit. Nothing was calculated.", "مزوّد الذكاء الاصطناعي رفض الطلب، غالباً بسبب رصيد OpenAI. ما انحسب شي.")
          : code === "rate_limited" ? tr("Too many questions in a minute. Wait a moment.", "أسئلة كثيرة خلال دقيقة. انتظر شوي.")
          : code === "forbidden" ? tr("Only owners, admins and managers can use the analyst.", "المحلل متاح للمالك والمدير فقط.")
          : j?.error?.message ?? tr("Something went wrong", "حدث خطأ");
        setMsgs((m) => [...m, { role: "assistant", content: msg, error: true }]);
      } else if (j.demo && !j.answer) {
        setMsgs((m) => [...m, { role: "assistant", content: tr("Demo mode: there is no real business data to analyse.", "وضع تجريبي: ما فيه بيانات حقيقية للتحليل."), error: true }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: j.answer || tr("No answer.", "ما فيه جواب."), followups: j.followups, periods: j.periods }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: tr("Network error. Try again.", "مشكلة اتصال. جرّب مرة ثانية."), error: true }]);
    } finally { setBusy(false); }
  }

  const uniq = (p?: { from: string; to: string }[]) => [...new Map((p ?? []).map((x) => [`${x.from}_${x.to}`, x])).values()];

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        demo={demo}
        title={tr("AI Analyst", "المحلل الذكي")}
        subtitle={tr("Ask about your sales, products, customers and team. Numbers are calculated from your own data.", "اسأل عن مبيعاتك ومنتجاتك وعملاءك وفريقك. الأرقام محسوبة من بياناتك الفعلية.")}
        actions={msgs.length ? <button onClick={() => setMsgs([])} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs text-muted hover:text-white"><RotateCcw className="h-3.5 w-3.5" />{tr("New chat", "محادثة جديدة")}</button> : undefined}
      />

      {!msgs.length && (
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet/15 text-violet"><Calculator className="h-5 w-5" /></span>
            <div>
              <p className="font-semibold">{tr("What would you like to know?", "شنو تبي تعرف؟")}</p>
              <p className="text-xs text-muted">{tr("Read-only. Sales mean revenue, not profit: costs aren't recorded in SAUT AI.", "للقراءة فقط. المبيعات تعني الإيراد مو الربح، لأن التكاليف ما تنسجل في SAUT AI.")}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {STARTERS.map(([en, ar]) => (
              <button key={en} onClick={() => ask(tr(en, ar))} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2.5 text-start text-sm text-white/80 transition hover:border-violet/40 hover:bg-violet/10">{tr(en, ar)}</button>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {msgs.map((m, i) => m.role === "user" ? (
          <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-ee-md bg-violet px-4 py-2.5 text-sm">{m.content}</div></div>
        ) : (
          <Card key={i} className={cn("p-4", m.error && "border-amber-400/30 bg-amber-500/5")}>
            {m.error ? <p className="text-sm text-amber-200">{m.content}</p> : <Rich text={m.content} />}
            {!m.error && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[11px] text-muted">
                <SourceTag kind="measured" />
                {uniq(m.periods).map((p) => <span key={p.from + p.to} className="tabular-nums" dir="ltr">{p.from === p.to ? p.from : `${p.from} → ${p.to}`}</span>)}
              </div>
            )}
            {!!m.followups?.length && i === msgs.length - 1 && !busy && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.followups.map((f) => <button key={f} onClick={() => ask(f)} className="rounded-full border border-line px-3 py-1.5 text-xs text-white/75 hover:border-violet/40 hover:text-white">{f}</button>)}
              </div>
            )}
          </Card>
        ))}
        {busy && <Card className="flex items-center gap-2 p-4 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />{tr("Calculating from your data…", "أحسب من بياناتك…")}</Card>}
        <div ref={end} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(text); }} className="sticky bottom-20 mt-4 flex items-end gap-2 rounded-2xl border border-line bg-ink-2 p-2 lg:bottom-4">
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={1000}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
          placeholder={tr("e.g. How much did I sell last week?", "مثلاً: كم بعت الأسبوع الماضي؟")}
          aria-label={tr("Your question", "سؤالك")}
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted"
        />
        <button type="submit" disabled={busy || text.trim().length < 2} aria-label={tr("Ask", "اسأل")} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet disabled:opacity-40"><ArrowUp className="h-5 w-5" /></button>
      </form>
    </div>
  );
}
