/** Activity log of every action Sanad took (and every approval/cancellation). */
import { useState } from "react";
import { CheckCircle2, XCircle, Clock3, Ban, Search } from "lucide-react";
import { AGENTS, agentMeta } from "@shared/agents";
import { api } from "../lib/api";
import { useData, useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Empty, Icon, cx } from "../components/ui";

interface Entry { id: number; actor: string; agentId: string | null; action: string; summary: string; status: "success" | "failed" | "pending" | "cancelled"; createdAt: string }

const STATUS = {
  success: { icon: CheckCircle2, c: "text-emerald-300" },
  failed: { icon: XCircle, c: "text-red-300" },
  pending: { icon: Clock3, c: "text-orange-300" },
  cancelled: { icon: Ban, c: "text-zinc-500" },
};

export function ActivityPage() {
  const { t, lang, fmtDate } = useI18n();
  const { pending } = useSanad();
  const [agent, setAgent] = useState("");
  const [q, setQ] = useState("");
  const [rows] = useData(() => api.get<Entry[]>(`/api/activity?${new URLSearchParams({ ...(agent ? { agent } : {}), ...(q ? { q } : {}) })}`), [agent, q]);

  const groups = new Map<string, Entry[]>();
  for (const r of rows ?? []) {
    const k = fmtDate(r.createdAt, { weekday: "long", day: "numeric", month: "long" });
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:px-8 md:pt-10">
      <h1 className="text-xl font-semibold">{t.activity.title}</h1>
      <p className="mb-4 text-sm text-zinc-400">{t.activity.subtitle}</p>
      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-neon-orange/30 bg-neon-orange/10 p-3 text-sm text-orange-100">
          ⚠️ {pending.length} × {t.activity.statuses.pending}
        </div>
      )}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input dir="auto" className="input ps-9" placeholder={t.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input sm:w-48" value={agent} onChange={(e) => setAgent(e.target.value)}>
          <option value="">{t.common.all}</option>
          {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name[lang]}</option>)}
        </select>
      </div>

      {[...groups.entries()].map(([day, list]) => (
        <div key={day} className="mb-5">
          <p className="label mb-2">{day}</p>
          <Card className="divide-y divide-white/5">
            {list.map((r) => {
              const S = STATUS[r.status] ?? STATUS.success;
              const a = r.agentId ? agentMeta(r.agentId) : null;
              return (
                <div key={r.id} className="flex items-start gap-3 p-3">
                  <S.icon className={cx("mt-0.5 h-4 w-4 shrink-0", S.c)} aria-label={t.activity.statuses[r.status]} />
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-sm">{r.summary}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                      {a && (
                        <span className="inline-flex items-center gap-1" style={{ color: a.color }}>
                          <Icon name={a.icon} className="h-3 w-3" /> {a.name[lang]}
                        </span>
                      )}
                      <span className="font-mono">{r.action}</span>
                      <span>{r.actor === "user" ? t.chat.you : r.actor}</span>
                      <span>{fmtDate(r.createdAt, { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                  <span className={cx("shrink-0 text-[10px]", S.c)}>{t.activity.statuses[r.status]}</span>
                </div>
              );
            })}
          </Card>
        </div>
      ))}
      {rows && !rows.length && <Empty>{t.common.empty}</Empty>}
    </div>
  );
}
