/** Sales: CRM-style pipeline table (name, stage, value, next step, follow-up). */
import { useMemo, useState } from "react";
import { Plus, Trash2, AlertCircle, MailPlus } from "lucide-react";
import type { PendingActionDTO } from "@shared/types";
import { api } from "../lib/api";
import { useData, useSanad } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Field, Modal, STAGE_STYLE, cx, fromLocalInput, toLocalInput, Empty } from "../components/ui";
import { useConfirm } from "../components/ConfirmModal";

interface Lead {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";
  value: string;
  currency: string;
  nextStep: string | null;
  followUpAt: string | null;
  notes: string | null;
}

const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

export function SalesPanel() {
  const { t, lang, fmtDate, fmtMoney } = useI18n();
  const { bump, addPending, toast } = useSanad();
  const [drafting, setDrafting] = useState(false);
  const ask = useConfirm();
  const [leads, reload] = useData(() => api.get<Lead[]>("/api/leads"));
  const [filter, setFilter] = useState<string>("open");
  const [editing, setEditing] = useState<Partial<Lead> | null>(null);

  const byStage = useMemo(() => {
    const m: Record<string, { n: number; v: number }> = {};
    for (const s of STAGES) m[s] = { n: 0, v: 0 };
    for (const l of leads ?? []) {
      m[l.stage].n++;
      m[l.stage].v += Number(l.value);
    }
    return m;
  }, [leads]);

  const shown = (leads ?? []).filter((l) => (filter === "open" ? !["won", "lost"].includes(l.stage) : filter === "all" ? true : l.stage === filter));
  const isDue = (l: Lead) => l.followUpAt && !["won", "lost"].includes(l.stage) && new Date(l.followUpAt).getTime() < Date.now() + 86400000;

  const update = async (id: number, patch: Partial<Lead>) => {
    await api.patch(`/api/leads/${id}`, patch);
    reload();
    bump();
  };
  const save = async () => {
    if (!editing?.name) return;
    const body = { name: editing.name, company: editing.company ?? null, email: editing.email ?? null, phone: editing.phone ?? null, stage: editing.stage ?? "new", value: Number(editing.value ?? 0), nextStep: editing.nextStep ?? null, followUpAt: editing.followUpAt ?? null, notes: editing.notes ?? null };
    if (editing.id) await api.patch(`/api/leads/${editing.id}`, body);
    else await api.post("/api/leads", body);
    setEditing(null);
    reload();
    bump();
  };
  const remove = async (l: Lead) => {
    if (!(await ask({ body: l.name }))) return;
    await api.del(`/api/leads/${l.id}`);
    setEditing(null);
    reload();
  };

  return (
    <div className="space-y-4">
      {/* pipeline summary */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAGES.map((s) => (
          <button key={s} onClick={() => setFilter(filter === s ? "open" : s)} className={cx("glass rounded-xl p-3 text-start transition", filter === s && "border-neon-purple/60")}>
            <span className={cx("chip", STAGE_STYLE[s])}>{t.sales.stages[s]}</span>
            <p className="mt-2 text-lg font-semibold">{byStage[s].n}</p>
            <p className="text-[11px] text-zinc-500">{fmtMoney(byStage[s].v)}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-white/5 p-1 text-xs">
          {["open", "all"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cx("rounded-lg px-3 py-1", filter === f ? "bg-white/10 text-white" : "text-zinc-400")}>
              {f === "open" ? t.sales.pipeline : t.common.all}
            </button>
          ))}
        </div>
        <button
          className="btn-ghost ms-auto"
          disabled={drafting}
          onClick={async () => {
            setDrafting(true);
            try {
              const r = await api.post<{ pending: PendingActionDTO[] }>("/api/sales/followups", { lang });
              if (r.pending.length) addPending(r.pending);
              else toast(t.sales.noneDue);
              reload();
            } finally {
              setDrafting(false);
            }
          }}
        >
          <MailPlus className="h-4 w-4" /> {t.sales.draftFollowUps}
        </button>
        <button className="btn-primary" onClick={() => setEditing({ stage: "new" })}>
          <Plus className="h-4 w-4" /> {t.sales.newLead}
        </button>
      </div>

      {/* desktop table */}
      <Card className="hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-start text-xs text-zinc-400">
            <tr>
              {[t.sales.name, t.sales.stage, t.sales.value, t.sales.nextStep, t.sales.followUp].map((h) => (
                <th key={h} className="px-4 py-2.5 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => setEditing(l)}>
                <td className="px-4 py-3">
                  <p dir="auto" className="font-medium">{l.name}</p>
                  <p dir="auto" className="text-xs text-zinc-500">{l.company}</p>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <select value={l.stage} onChange={(e) => update(l.id, { stage: e.target.value as Lead["stage"] })} className={cx("chip cursor-pointer bg-transparent py-1 outline-none", STAGE_STYLE[l.stage])}>
                    {STAGES.map((s) => (
                      <option key={s} value={s} className="bg-ink-900 text-zinc-100">{t.sales.stages[s]}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 tabular-nums">{fmtMoney(Number(l.value), l.currency)}</td>
                <td dir="auto" className="max-w-[260px] px-4 py-3 text-zinc-300">{l.nextStep}</td>
                <td className={cx("px-4 py-3 text-xs", isDue(l) ? "text-orange-300" : "text-zinc-400")}>
                  {isDue(l) && <AlertCircle className="me-1 inline h-3.5 w-3.5" />}
                  {fmtDate(l.followUpAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="p-4"><Empty>{t.common.empty}</Empty></div>}
      </Card>

      {/* mobile cards */}
      <div className="space-y-2 md:hidden">
        {shown.map((l) => (
          <Card key={l.id} className="p-3" onClick={() => setEditing(l)}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p dir="auto" className="font-medium">{l.name}</p>
                <p dir="auto" className="text-xs text-zinc-500">{l.company}</p>
              </div>
              <span className={cx("chip", STAGE_STYLE[l.stage])}>{t.sales.stages[l.stage]}</span>
            </div>
            <p dir="auto" className="mt-2 text-sm text-zinc-300">{l.nextStep}</p>
            <div className="mt-2 flex justify-between text-xs">
              <span className="tabular-nums">{fmtMoney(Number(l.value), l.currency)}</span>
              <span className={isDue(l) ? "text-orange-300" : "text-zinc-500"}>{fmtDate(l.followUpAt)}</span>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? editing.name : t.sales.newLead}>
        {editing && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.sales.name}>
                <input dir="auto" className="input" autoFocus required value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label={t.sales.company}>
                <input dir="auto" className="input" value={editing.company ?? ""} onChange={(e) => setEditing({ ...editing, company: e.target.value })} />
              </Field>
              <Field label="Email">
                <input type="email" className="input" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input className="input" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              <Field label={t.sales.stage}>
                <select className="input" value={editing.stage} onChange={(e) => setEditing({ ...editing, stage: e.target.value as Lead["stage"] })}>
                  {STAGES.map((s) => (
                    <option key={s} value={s}>{t.sales.stages[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label={t.sales.value}>
                <input type="number" min="0" step="any" className="input" value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: e.target.value })} />
              </Field>
            </div>
            <Field label={t.sales.nextStep}>
              <input dir="auto" className="input" value={editing.nextStep ?? ""} onChange={(e) => setEditing({ ...editing, nextStep: e.target.value })} />
            </Field>
            <Field label={t.sales.followUp}>
              <input type="datetime-local" className="input" value={toLocalInput(editing.followUpAt)} onChange={(e) => setEditing({ ...editing, followUpAt: fromLocalInput(e.target.value) })} />
            </Field>
            <Field label="Notes">
              <textarea dir="auto" className="input min-h-[60px]" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            <div className="flex gap-2 pt-1">
              {editing.id && (
                <button type="button" className="btn-danger" onClick={() => remove(editing as Lead)} aria-label={t.common.delete}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button type="button" className="btn-ghost flex-1" onClick={() => setEditing(null)}>{t.common.cancel}</button>
              <button type="submit" className="btn-primary flex-1">{t.common.save}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
