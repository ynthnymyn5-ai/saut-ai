/** Finance: monthly KPIs, income vs expenses chart, spending by category, log and invoices. */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { api } from "../lib/api";
import { useData, useMira } from "../lib/store";
import { useI18n } from "../i18n";
import { Card, Field, Modal, SectionTitle, cx, Empty } from "../components/ui";
import { useConfirm } from "../components/ConfirmModal";

// Validated (CVD + lightness band) on the dark surface
const INCOME = "#a855f7";
const EXPENSE = "#ea580c";

interface Summary {
  month: { income: number; expenses: number; net: number; byCategory: Record<string, number> };
  series: { month: string; income: number; expenses: number }[];
  currency: string;
}
interface Tx { id: number; type: "income" | "expense"; amount: string; category: string; description: string | null; occurredAt: string }
interface Invoice { id: number; number: string; client: string; amount: string; currency: string; status: string; dueAt: string | null }

const INV_STYLE: Record<string, string> = {
  draft: "border-zinc-500/30 text-zinc-300",
  sent: "border-sky-400/30 text-sky-200",
  paid: "border-emerald-400/40 text-emerald-200",
  overdue: "border-red-400/40 text-red-200",
};

export function FinancePanel() {
  const { t, lang, fmtDate, fmtMoney } = useI18n();
  const { bump } = useMira();
  const ask = useConfirm();
  const [summary, reloadSummary] = useData(() => api.get<Summary>("/api/finance/summary"));
  const [txs, reloadTx] = useData(() => api.get<Tx[]>("/api/finance/transactions"));
  const [invoices, reloadInv] = useData(() => api.get<Invoice[]>("/api/finance/invoices"));
  const [form, setForm] = useState<{ type: "income" | "expense"; amount: string; category: string; description: string } | null>(null);

  const cur = summary?.currency ?? "KWD";
  const reload = () => {
    reloadSummary();
    reloadTx();
    reloadInv();
    bump();
  };
  const monthLabel = (m: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { month: "short" }).format(new Date(`${m}-15`));
  const cats = Object.entries(summary?.month.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;

  const add = async () => {
    if (!form || !Number(form.amount)) return;
    await api.post("/api/finance/transactions", { ...form, amount: Number(form.amount) });
    setForm(null);
    reload();
  };

  return (
    <div className="space-y-4">
      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: t.finance.income, v: summary?.month.income, icon: TrendingUp, c: "text-violet-300" },
          { label: t.finance.expenses, v: summary?.month.expenses, icon: TrendingDown, c: "text-orange-300" },
          { label: t.finance.net, v: summary?.month.net, icon: Scale, c: (summary?.month.net ?? 0) >= 0 ? "text-emerald-300" : "text-red-300" },
        ].map((k) => (
          <Card key={k.label} className="p-3 sm:p-4">
            <p className="label flex items-center gap-1"><k.icon className={cx("h-3.5 w-3.5", k.c)} /> {k.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums sm:text-2xl">{summary ? fmtMoney(k.v ?? 0, cur) : "—"}</p>
            <p className="text-[11px] text-zinc-500">{t.finance.thisMonth}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <SectionTitle>{t.finance.last6}</SectionTitle>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary?.series ?? []} barGap={2} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,.04)" }}
                  contentStyle={{ background: "#150d26", border: "1px solid rgba(168,85,247,.3)", borderRadius: 12, fontSize: 12 }}
                  labelStyle={{ color: "#e4e4e7" }}
                  itemStyle={{ color: "#e4e4e7" }}
                  labelFormatter={(m) => monthLabel(String(m))}
                  formatter={(v, name) => [fmtMoney(Number(v), cur), name === "income" ? t.finance.income : t.finance.expenses]}
                />
                <Legend formatter={(v) => <span className="text-xs text-zinc-300">{v === "income" ? t.finance.income : t.finance.expenses}</span>} iconType="circle" iconSize={8} />
                <Bar dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expenses" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <SectionTitle>{t.finance.byCategory}</SectionTitle>
          <div className="space-y-2.5">
            {cats.map(([c, v]) => (
              <div key={c} title={`${c}: ${fmtMoney(v, cur)}`}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="capitalize text-zinc-300">{c}</span>
                  <span className="tabular-nums text-zinc-400">{fmtMoney(v, cur)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5">
                  <div className="h-2 rounded-full" style={{ width: `${(v / maxCat) * 100}%`, background: EXPENSE }} />
                </div>
              </div>
            ))}
            {!cats.length && <Empty>{t.common.empty}</Empty>}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle action={<button className="btn-ghost px-3 py-1 text-xs" onClick={() => setForm({ type: "expense", amount: "", category: "", description: "" })}><Plus className="h-3.5 w-3.5" /> {t.finance.newTx}</button>}>
            {t.finance.transactions}
          </SectionTitle>
          <div className="max-h-96 space-y-1 overflow-y-auto pe-1 scrollbar-thin">
            {(txs ?? []).slice(0, 60).map((x) => (
              <div key={x.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.type === "income" ? INCOME : EXPENSE }} />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm">{x.description ?? x.category}</p>
                  <p className="text-[11px] capitalize text-zinc-500">{x.category} · {fmtDate(x.occurredAt, { day: "numeric", month: "short" })}</p>
                </div>
                <span className={cx("text-sm tabular-nums", x.type === "income" ? "text-violet-200" : "text-zinc-300")}>
                  {x.type === "income" ? "+" : "−"}
                  {fmtMoney(Number(x.amount), cur)}
                </span>
                <button
                  className="text-zinc-600 opacity-0 transition hover:text-red-300 group-hover:opacity-100"
                  aria-label={t.common.delete}
                  onClick={async () => {
                    if (await ask({})) {
                      await api.del(`/api/finance/transactions/${x.id}`);
                      reload();
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>{t.finance.invoices}</SectionTitle>
          <div className="space-y-2">
            {(invoices ?? []).map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-medium">{inv.client}</p>
                  <p className="text-[11px] text-zinc-500">{inv.number}{inv.dueAt ? ` · ${t.common.due} ${fmtDate(inv.dueAt, { day: "numeric", month: "short" })}` : ""}</p>
                </div>
                <span className="text-sm tabular-nums">{fmtMoney(Number(inv.amount), inv.currency)}</span>
                <select
                  value={inv.status}
                  onChange={async (e) => {
                    await api.patch(`/api/finance/invoices/${inv.id}`, { status: e.target.value });
                    reload();
                  }}
                  className={cx("chip cursor-pointer bg-transparent py-1 outline-none", INV_STYLE[inv.status])}
                >
                  {["draft", "sent", "paid", "overdue"].map((s) => (
                    <option key={s} value={s} className="bg-ink-900 text-zinc-100">{s}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={t.finance.newTx}>
        {form && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <div className="flex gap-1 rounded-xl bg-white/5 p-1">
              {(["expense", "income"] as const).map((ty) => (
                <button type="button" key={ty} onClick={() => setForm({ ...form, type: ty })} className={cx("flex-1 rounded-lg py-1.5 text-sm", form.type === ty ? "bg-white/10 text-white" : "text-zinc-400")}>
                  {ty === "income" ? t.finance.income : t.finance.expenses}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t.finance.amount} (${cur})`}>
                <input type="number" step="any" min="0" autoFocus required className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label={t.finance.category}>
                <input className="input" list="cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                <datalist id="cats">{["materials", "packaging", "marketing", "software", "rent", "salaries", "delivery", "online store", "wholesale"].map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
            </div>
            <Field label={t.finance.description}>
              <input dir="auto" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="flex gap-2 pt-1">
              <button type="button" className="btn-ghost flex-1" onClick={() => setForm(null)}>{t.common.cancel}</button>
              <button type="submit" className="btn-primary flex-1">{t.common.save}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
