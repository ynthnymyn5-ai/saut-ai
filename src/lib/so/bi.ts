import "server-only";
import { providerStatus } from "@/lib/env";
import type { DB } from "./context";

export type Period = "today" | "last_7_days" | "this_month" | "last_month" | "last_30_days";

export function periodRange(p: Period, now = new Date()): [Date, Date] {
  const d = (y: number, m: number, day = 1) => new Date(Date.UTC(y, m, day) - 3 * 3600000); // Kuwait midnight
  const k = new Date(now.getTime() + 3 * 3600000);
  const y = k.getUTCFullYear(), m = k.getUTCMonth();
  switch (p) {
    case "today": return [d(y, m, k.getUTCDate()), now];
    case "last_7_days": return [new Date(now.getTime() - 7 * 86400000), now];
    case "last_30_days": return [new Date(now.getTime() - 30 * 86400000), now];
    case "this_month": return [d(y, m), now];
    case "last_month": return [d(y, m - 1), d(y, m)];
  }
}

/** Same-length window immediately before [from, to) — for "compared with last period". */
export const previousRange = (from: Date, to: Date): [Date, Date] => [new Date(from.getTime() - (to.getTime() - from.getTime())), from];

/**
 * MEASURED metrics: plain counts/sums over the organization's own rows. Nothing estimated here.
 * Revenue is reported only from CRM-recorded deal values (converted leads); without a sales or
 * POS integration we say so instead of inventing a figure.
 */
export async function computeMetrics(db: DB, orgId: string, from: Date, to: Date, branchId: string | null = null) {
  const f = from.toISOString(), t = to.toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (branchId ? q.eq("branch_id", branchId) : q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [calls, convs, appts, leadsNew, leadsClosed, custNew, execs, agents]: any[] = await Promise.all([
    scope(db.from("calls").select("status, duration_sec, employee_id").eq("organization_id", orgId).gte("started_at", f).lt("started_at", t)),
    scope(db.from("conversations").select("channel, status, intent, sentiment, employee_id, escalated_at, customer_id").eq("organization_id", orgId).gte("started_at", f).lt("started_at", t)),
    scope(db.from("appointments").select("status, kind, employee_id").eq("organization_id", orgId).gte("created_at", f).lt("created_at", t)),
    scope(db.from("leads").select("id, source").eq("organization_id", orgId).gte("created_at", f).lt("created_at", t)),
    scope(db.from("leads").select("stage, estimated_value, lost_reason").eq("organization_id", orgId).in("stage", ["converted", "lost"]).gte("stage_changed_at", f).lt("stage_changed_at", t)),
    scope(db.from("customers").select("id").eq("organization_id", orgId).gte("created_at", f).lt("created_at", t)),
    db.from("agent_executions").select("agent_id, status, tool_key").eq("organization_id", orgId).eq("test_mode", false).gte("started_at", f).lt("started_at", t),
    db.from("ai_employees").select("id, name, role").eq("organization_id", orgId),
  ]);
  type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const C: Row[] = calls.data ?? [], V: Row[] = convs.data ?? [], A: Row[] = appts.data ?? [], X: Row[] = execs.data ?? [];
  const LC: Row[] = leadsClosed.data ?? [];
  const count = <T,>(arr: T[], key: (x: T) => string | null | undefined) => arr.reduce<Record<string, number>>((acc, x) => { const k = key(x) ?? "unknown"; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const answered = C.filter((c) => ["completed", "transferred", "in_progress"].includes(c.status)).length;
  const talkSec = C.reduce((a, c) => a + (c.duration_sec ?? 0), 0);
  const converted = LC.filter((l: Row) => l.stage === "converted");
  const returning = new Set(V.map((v) => v.customer_id).filter(Boolean)).size - (custNew.data?.length ?? 0);

  return {
    period: { from: f, to: t, branch_id: branchId },
    calls: { total: C.length, answered, missed: C.filter((c) => ["no_answer", "busy", "failed"].includes(c.status)).length, talk_minutes: Math.round(talkSec / 60), avg_call_seconds: answered ? Math.round(talkSec / answered) : 0 },
    conversations: { total: V.length, by_channel: count(V, (v) => v.channel), escalated: V.filter((v) => v.escalated_at || v.status === "transferred").length, negative: V.filter((v) => v.sentiment === "negative").length },
    top_intents: Object.entries(count(V.filter((v) => v.intent), (v) => v.intent)).sort((a, b) => b[1] - a[1]).slice(0, 8),
    appointments: { created: A.length, by_status: count(A, (a) => a.status), by_kind: count(A, (a) => a.kind) },
    leads: { new: leadsNew.data?.length ?? 0, converted: converted.length, lost: LC.length - converted.length, conversion_rate: LC.length ? Math.round((converted.length / LC.length) * 100) : null, lost_reasons: count(LC.filter((l) => l.stage === "lost"), (l) => l.lost_reason) },
    customers: { new: custNew.data?.length ?? 0, returning: Math.max(0, returning) },
    revenue: converted.some((l) => l.estimated_value !== null)
      ? { source: "crm_deal_values", converted_value: converted.reduce((a, l) => a + Number(l.estimated_value ?? 0), 0) }
      : { source: "not_available", reason: "No sales/POS integration and no deal values recorded on converted leads." },
    agents: ((agents.data ?? []) as Row[]).map((ag) => {
      const ex = X.filter((x) => x.agent_id === ag.id);
      const conv = V.filter((v) => v.employee_id === ag.id);
      return {
        id: ag.id, name: ag.name, role: ag.role,
        conversations: conv.length,
        calls: C.filter((c) => c.employee_id === ag.id).length,
        escalations: conv.filter((v) => v.escalated_at || v.status === "transferred").length,
        appointments_booked: A.filter((a) => a.employee_id === ag.id).length,
        tool_success_rate: ex.length ? Math.round((ex.filter((x) => x.status === "succeeded").length / ex.length) * 100) : null,
        denied_actions: ex.filter((x) => x.status === "denied").length,
      };
    }),
  };
}
export type Metrics = Awaited<ReturnType<typeof computeMetrics>>;

/** ESTIMATES: always shipped with their formula so the UI can show it. */
export function estimates(m: Metrics) {
  const chatMin = 1.5; // assumed staff minutes per text conversation
  const minutes = m.calls.talk_minutes + Math.round((m.conversations.total - (m.conversations.by_channel.phone ?? 0)) * chatMin);
  return {
    time_saved_hours: { value: Math.round((minutes / 60) * 10) / 10, formula: `AI-handled call minutes (${m.calls.talk_minutes}) + non-phone conversations × ${chatMin} min` },
  };
}

/** AI interpretation: the model sees ONLY the measured/estimated JSON and must say when data can't answer. */
export async function interpret(question: string, current: Metrics, previous: Metrics, est: ReturnType<typeof estimates>, locale: "ar" | "en") {
  if (!providerStatus("openai").configured) return null;
  const { openai, models } = await import("@/lib/ai/openai");
  const r = await openai().chat.completions.create({
    model: models.chat(),
    temperature: 0.2,
    max_tokens: 700,
    messages: [
      { role: "system", content: [
        `You are SO Manager, a business analyst for a Kuwaiti business. Answer in ${locale === "ar" ? "Arabic (Gulf business tone)" : "English"}.`,
        "Use ONLY the numbers in the JSON provided. Never invent figures, causes or benchmarks.",
        "If the data cannot answer the question (e.g. revenue not available), say exactly what is missing and which integration would provide it.",
        "Label any causal explanation as a hypothesis. End with up to 3 concrete recommendations, each citing the metric behind it.",
        "Format: short paragraphs and a bullet list. No tables.",
      ].join("\n") },
      { role: "user", content: `Question: ${question}\n\nCURRENT PERIOD (measured): ${JSON.stringify(current)}\n\nPREVIOUS PERIOD (measured): ${JSON.stringify(previous)}\n\nESTIMATES (with formulas): ${JSON.stringify(est)}` },
    ],
  });
  return { text: r.choices[0].message.content ?? "", model: models.chat() };
}
