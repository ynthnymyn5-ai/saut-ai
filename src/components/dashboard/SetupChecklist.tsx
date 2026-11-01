"use client";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Rocket, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi, useTr } from "@/components/os/shared";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Status = { demo?: boolean; steps: Record<string, boolean>; done: number; total: number };
const KEY = "saut_setup_hidden";

/** "Get your AI employee live" checklist on the Overview. Ticks come from real data. */
export function SetupChecklist() {
  const tr = useTr();
  const { locale } = useI18n();
  const { data } = useApi<Status>("/api/setup");
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(KEY) === "1"); } catch { setHidden(false); } }, []);
  if (!data || data.demo || hidden || data.done === data.total) return null;

  const Arrow = locale === "ar" ? ChevronLeft : ChevronRight;
  const items: [string, string, string, string][] = [
    ["employee", tr("Create your AI employee", "أنشئ موظفك الذكي"), tr("Industry, voice, business info", "القطاع والصوت ومعلومات النشاط"), "/dashboard/employees/new"],
    ["employee_active", tr("Test it and activate", "جرّبه وفعّله"), tr("Chat with it as a customer first", "تحدّث معه كأنك عميل أولاً"), "/dashboard/employees"],
    ["knowledge", tr("Add your menu or price list", "أضف المنيو أو قائمة الأسعار"), tr("PDF, Word or text — it answers from it", "PDF أو Word أو نص، ويجيب منه"), "/dashboard/knowledge"],
    ["whatsapp", tr("Connect WhatsApp", "اربط واتساب"), tr("Let it answer your customers' chats", "ليرد على محادثات عملائك"), "/dashboard/integrations/whatsapp"],
    ["phone", tr("Connect a phone number", "اربط رقم هاتف"), tr("Let it answer calls", "ليرد على المكالمات"), "/dashboard/integrations"],
    ["business", tr("Complete your business profile", "أكمل ملف النشاط"), tr("Phone and address", "الهاتف والعنوان"), "/dashboard/settings"],
    ["voices", tr("Pick your voices", "اختر الأصوات"), tr("Arabic and English human voices", "أصوات بشرية بالعربي والإنجليزي"), "/dashboard/settings"],
  ];
  const next = items.find(([k]) => !data.steps[k]);
  const pct = Math.round((data.done / data.total) * 100);

  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass glow-border relative mb-6 overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -end-16 -top-16 h-48 w-48 rounded-full bg-violet/20 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-gradient shadow-glow"><Rocket className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">{tr("Get your AI employee live", "شغّل موظفك الذكي")}</h2>
          <p className="text-sm text-muted">{data.done} / {data.total} · {pct}%</p>
        </div>
        {next && <Link href={next[3]} className="inline-flex items-center gap-1.5 rounded-xl bg-violet px-4 py-2 text-sm font-semibold shadow-glow hover:bg-violet-soft">{tr("Next", "التالي")}: {next[1]}<Arrow className="h-4 w-4" /></Link>}
        <button type="button" onClick={() => { setHidden(true); try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } }} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white" aria-label={tr("Hide", "إخفاء")}><X className="h-4 w-4" /></button>
      </div>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"><motion.div className="h-full rounded-full bg-brand-gradient" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} /></div>
      <ul className="relative mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([k, title, sub, href]) => {
          const done = !!data.steps[k];
          return (
            <li key={k}>
              <Link href={href} className={cn("flex h-full items-start gap-3 rounded-xl border p-3 transition", done ? "border-emerald-400/20 bg-emerald-400/[0.04]" : next?.[0] === k ? "border-violet/40 bg-violet/[0.06] hover:border-violet/60" : "border-line hover:border-violet/30")}>
                <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", done ? "border-emerald-400 bg-emerald-400 text-ink" : "border-white/25")}>{done && <Check className="h-3 w-3" />}</span>
                <span className="min-w-0"><span className={cn("block text-sm font-medium", done && "text-white/60 line-through decoration-white/30")}>{title}</span><span className="block text-xs text-muted">{sub}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
