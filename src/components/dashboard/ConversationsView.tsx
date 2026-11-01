"use client";
import { AnimatePresence, motion } from "framer-motion";
import { MessagesSquare, Phone, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, PageHeader, statusTone } from "@/components/ui/primitives";
import type { Conv } from "@/components/dashboard/Overview";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate, formatDuration } from "@/lib/utils";

export function ConversationsView({ items, transcript, demo, kind }: { items: Conv[]; transcript: { role: string; text: string }[]; demo: boolean; kind: "calls" | "conversations" }) {
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [sel, setSel] = useState<Conv | null>(null);
  const statuses = useMemo(() => ["all", ...new Set(items.map((i) => i.status))], [items]);
  const rows = items.filter((i) => (status === "all" || i.status === status) && `${i.customer} ${i.summary} ${i.employee}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title={kind === "calls" ? t.dash.nav.calls : t.dash.nav.conversations} demo={demo} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.common.search} className="input ps-9" /></div>
        <div className="flex gap-1.5 overflow-x-auto">{statuses.map((s) => <button key={s} onClick={() => setStatus(s)} className={cn("shrink-0 rounded-xl border px-3 py-2 text-xs", status === s ? "border-violet bg-violet/15" : "border-line text-muted")}>{s === "all" ? t.common.all : s}</button>)}</div>
      </div>
      {rows.length === 0 ? <EmptyState icon={kind === "calls" ? <Phone className="h-6 w-6" /> : <MessagesSquare className="h-6 w-6" />} title={t.dash.empty} body={kind === "calls" ? (locale === "ar" ? "ستظهر المكالمات هنا بعد ربط رقم هاتف." : "Calls appear here once a phone number is connected.") : undefined} /> : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr>
                {[locale === "ar" ? "العميل" : "Customer", locale === "ar" ? "الموظف" : "Employee", locale === "ar" ? "القناة" : "Channel", t.common.status, locale === "ar" ? "الملخص" : "Summary", locale === "ar" ? "الوقت" : "Time"].map((h) => <th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setSel(r)} className="cursor-pointer transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium">{r.customer}</td>
                    <td className="px-4 py-3 text-muted">{r.employee}</td>
                    <td className="px-4 py-3"><Badge>{r.channel}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={statusTone(r.status)}>{r.status}</Badge></td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted">{r.summary}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDate(r.at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {sel && (
          <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSel(null)}>
            <motion.aside onClick={(e) => e.stopPropagation()} initial={{ x: locale === "ar" ? "-100%" : "100%" }} animate={{ x: 0 }} exit={{ x: locale === "ar" ? "-100%" : "100%" }} transition={{ type: "spring", damping: 30, stiffness: 280 }}
              className="h-full w-full max-w-md overflow-y-auto border-s border-line bg-ink-2 p-6">
              <div className="flex items-start justify-between"><div><h2 className="font-display text-lg font-semibold">{sel.customer}</h2><p className="text-xs text-muted">{formatDate(sel.at, locale)} · {sel.employee}</p></div><button onClick={() => setSel(null)} aria-label="Close"><X className="h-5 w-5" /></button></div>
              <div className="mt-4 flex flex-wrap gap-1.5"><Badge tone={statusTone(sel.status)}>{sel.status}</Badge><Badge>{sel.channel}</Badge><Badge tone={sel.sentiment === "positive" ? "green" : sel.sentiment === "negative" ? "red" : "gray"}>{sel.sentiment}</Badge>{sel.duration > 0 && <Badge tone="blue">{formatDuration(sel.duration)}</Badge>}</div>
              <Card className="mt-5 bg-violet/[0.06]"><p className="text-xs font-semibold uppercase tracking-wide text-violet-soft">{locale === "ar" ? "ملخص الذكاء الاصطناعي" : "AI summary"}</p><p className="mt-2 text-sm">{sel.summary}</p></Card>
              <h3 className="mb-3 mt-6 text-sm font-semibold">{locale === "ar" ? "النص الكامل" : "Transcript"}</h3>
              {transcript.length ? (
                <div className="space-y-2.5">{transcript.map((m, i) => (
                  <div key={i} className={cn("flex", m.role === "customer" ? "justify-start" : "justify-end")}>
                    <p dir="auto" className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.role === "customer" ? "bg-white/[0.06]" : "bg-violet/80")}>{m.text}</p>
                  </div>))}
                  {demo && <p className="pt-2 text-center text-[11px] text-amber-200">{t.dash.demoBadge}</p>}
                </div>
              ) : <p className="text-sm text-muted">{locale === "ar" ? "يتم تحميل النص من سجل الرسائل." : "Transcript loads from the message log."}</p>}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
