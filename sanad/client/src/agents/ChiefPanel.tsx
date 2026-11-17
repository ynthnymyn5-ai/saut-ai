/** Chief of Staff: the daily brief, today's agenda, inbox preview and key numbers. */
import { useState } from "react";
import { RefreshCw, Send, CalendarDays, Flame, Handshake, Inbox, Volume2, BarChart3 } from "lucide-react";
import type { BriefDTO } from "@shared/types";
import { api } from "../lib/api";
import { useData, useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Empty, PRIORITY_STYLE, SectionTitle, Spinner, cx } from "../components/ui";
import { Orb } from "../components/Orb";
import { speak } from "../voice/voiceEngine";

interface Mail { id: string; from: string; subject: string; snippet: string; date: string; unread: boolean; source: string }

export function ChiefPanel() {
  const { t, lang, fmtDate, fmtMoney } = useI18n();
  const { toast, status, orbState } = useSanad();
  const [refresh, setRefresh] = useState(0);
  const [brief, , loading] = useData(() => api.get<BriefDTO>(`/api/brief?lang=${lang}${refresh ? "&refresh=1" : ""}`), [lang, refresh]);
  const [mail] = useData(() => api.get<Mail[]>("/api/inbox"));
  const [weeklyRefresh, setWeeklyRefresh] = useState(0);
  const [weekly, , weeklyLoading] = useData(
    () => api.get<{ text: string; generatedAt: string; data: { income: number; prevIncome: number; net: number; tasksDone: number; dealsWon: { name: string }[]; currency: string } }>(`/api/reports/weekly?lang=${lang}${weeklyRefresh ? "&refresh=1" : ""}`),
    [lang, weeklyRefresh],
  );
  const [speaking, setSpeaking] = useState(false);
  const d = brief?.data;
  const time = (iso: string) => fmtDate(iso, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="relative overflow-hidden p-5 lg:col-span-2">
        <div className="pointer-events-none absolute -end-16 -top-16 opacity-40">
          <Orb state={speaking ? "speaking" : loading ? "thinking" : orbState} size={220} />
        </div>
        <SectionTitle
          action={
            <div className="flex gap-1.5">
              <button
                className="btn-ghost px-2.5 py-1 text-xs"
                disabled={!brief || speaking}
                onClick={async () => {
                  setSpeaking(true);
                  await speak(brief!.text, lang, Boolean(status?.serverVoice));
                  setSpeaking(false);
                }}
                aria-label="Read aloud"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setRefresh((r) => r + 1)} aria-label={t.common.refresh}>
                <RefreshCw className={cx("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
              <button
                className="btn-ghost px-2.5 py-1 text-xs"
                onClick={async () => {
                  await api.post("/api/brief/send");
                  toast("✓", "success");
                }}
              >
                <Send className="h-3.5 w-3.5 rtl:-scale-x-100" /> <span className="hidden sm:inline">{t.chief.sendToPhone}</span>
              </button>
            </div>
          }
        >
          ☀️ {t.chief.brief}
        </SectionTitle>
        {brief ? (
          <>
            <p dir="auto" className="relative whitespace-pre-line text-[15px] leading-relaxed text-zinc-100">{brief.text}</p>
            <p className="mt-3 text-[11px] text-zinc-500">{t.chief.generated} {fmtDate(brief.generatedAt)}</p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-zinc-400"><Spinner /> {t.common.loading}</div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle>{t.chief.numbers}</SectionTitle>
        {d && (
          <div className="grid grid-cols-2 gap-3">
            {[
              [t.finance.income, fmtMoney(d.numbers.monthIncome, d.numbers.currency)],
              [t.finance.expenses, fmtMoney(d.numbers.monthExpenses, d.numbers.currency)],
              [t.finance.net, fmtMoney(d.numbers.net, d.numbers.currency)],
              [t.chief.pipelineValue, fmtMoney(d.numbers.pipelineValue, d.numbers.currency)],
              [t.chief.openTasks, d.numbers.openTasks],
              [t.chief.unread, d.numbers.unreadEmails],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-black/25 p-3">
                <p className="text-[11px] text-zinc-500">{k}</p>
                <p className="mt-0.5 text-base font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle icon={<CalendarDays className="h-4 w-4 text-violet-300" />}>{t.chief.meetings}</SectionTitle>
        <div className="space-y-2">
          {d?.meetings.map((m, i) => (
            <div key={i} className="flex gap-3 rounded-xl bg-black/20 p-2.5">
              <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-violet-200">{time(m.start)}</span>
              <div className="min-w-0">
                <p dir="auto" className="truncate text-sm">{m.title}</p>
                {m.location && <p dir="auto" className="truncate text-[11px] text-zinc-500">{m.location}</p>}
              </div>
            </div>
          ))}
          {d && !d.meetings.length && <Empty>{t.chief.noMeetings}</Empty>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={<Flame className="h-4 w-4 text-orange-300" />}>{t.chief.urgent}</SectionTitle>
        <div className="space-y-2">
          {d?.urgentTasks.map((x) => (
            <div key={x.id} className="flex items-center gap-2 rounded-xl bg-black/20 p-2.5">
              <span className={cx("chip", PRIORITY_STYLE[x.priority])}>{t.ops[x.priority as "urgent"]}</span>
              <p dir="auto" className="min-w-0 flex-1 truncate text-sm">{x.title}</p>
              {x.dueAt && <span className="text-[10px] text-zinc-500">{fmtDate(x.dueAt, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          ))}
          {d && !d.urgentTasks.length && <Empty>✓</Empty>}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle icon={<Handshake className="h-4 w-4 text-emerald-300" />}>{t.chief.followUps}</SectionTitle>
        <div className="space-y-2">
          {d?.followUps.map((f) => (
            <div key={f.id} className="rounded-xl bg-black/20 p-2.5">
              <p dir="auto" className="text-sm">{f.name} <span className="text-zinc-500">· {f.company}</span></p>
              <p dir="auto" className="text-[11px] text-zinc-400">{f.nextStep}</p>
            </div>
          ))}
          {d && !d.followUps.length && <Empty>✓</Empty>}
        </div>
      </Card>

      <Card className="p-5 lg:col-span-3">
        <SectionTitle
          icon={<BarChart3 className="h-4 w-4 text-violet-300" />}
          action={
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setWeeklyRefresh((r) => r + 1)} aria-label={t.common.refresh}>
              <RefreshCw className={cx("h-3.5 w-3.5", weeklyLoading && "animate-spin")} />
            </button>
          }
        >
          {t.chief.weekly}
        </SectionTitle>
        {weekly ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid grid-cols-2 gap-2 md:col-span-1 md:grid-cols-1">
              {[
                [t.finance.income, fmtMoney(weekly.data.income, weekly.data.currency), weekly.data.prevIncome ? `${weekly.data.income >= weekly.data.prevIncome ? "▲" : "▼"} ${Math.abs(Math.round(((weekly.data.income - weekly.data.prevIncome) / weekly.data.prevIncome) * 100))}% ${t.chief.vsLastWeek}` : ""],
                [t.finance.net, fmtMoney(weekly.data.net, weekly.data.currency), ""],
                [t.chief.tasksDone, String(weekly.data.tasksDone), ""],
                [t.chief.dealsWon, String(weekly.data.dealsWon.length), weekly.data.dealsWon.map((x) => x.name).join(", ")],
              ].map(([k, v, sub]) => (
                <div key={k} className="rounded-xl bg-black/25 p-3">
                  <p className="text-[11px] text-zinc-500">{k}</p>
                  <p className="text-base font-semibold tabular-nums">{v}</p>
                  {sub && <p className="truncate text-[10px] text-zinc-500">{sub}</p>}
                </div>
              ))}
            </div>
            <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-zinc-200 md:col-span-2">{weekly.text}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-zinc-400"><Spinner /> {t.common.loading}</div>
        )}
      </Card>

      <Card className="p-5 lg:col-span-3">
        <SectionTitle icon={<Inbox className="h-4 w-4 text-sky-300" />} action={mail?.[0]?.source === "sample" ? <span className="chip border-amber-400/30 text-amber-200">sample inbox</span> : null}>
          {t.chief.inbox}
        </SectionTitle>
        <div className="divide-y divide-white/5">
          {mail?.map((m) => (
            <div key={m.id} className="flex gap-3 py-2.5">
              <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", m.unread ? "bg-neon-purple shadow-glow" : "bg-transparent")} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p dir="auto" className="truncate text-sm font-medium">{m.from.replace(/<.*>/, "").trim()}</p>
                  <span className="shrink-0 text-[10px] text-zinc-500">{fmtDate(m.date, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</span>
                </div>
                <p dir="auto" className="truncate text-sm text-zinc-300">{m.subject}</p>
                <p dir="auto" className="truncate text-xs text-zinc-500">{m.snippet}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
