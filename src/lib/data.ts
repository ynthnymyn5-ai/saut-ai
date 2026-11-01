import "server-only";
import * as demo from "@/lib/demo-data";
import { supabaseServer } from "@/lib/supabase/server";
import type { Session } from "@/lib/auth";

/**
 * Data access for dashboard pages. Each function returns the same shape whether it reads
 * the database (RLS-scoped to the signed-in user's organization) or the demo fixtures.
 * `demo: true` in the result drives the "Demo data" badge.
 */
type S = Session & { org: NonNullable<Session["org"]> };

export async function getOverview(s: S) {
  if (s.demo) return { demo: true, stats: demo.demoStats, daily: demo.demoDaily, monthly: demo.demoMonthly, recent: demo.demoConversations, employees: demo.demoEmployees };
  const sb = (await supabaseServer())!;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [calls, convs, appts, emps, recent] = await Promise.all([
    sb.from("calls").select("status, started_at, duration_sec").eq("organization_id", s.org.id).gte("started_at", since),
    sb.from("conversations").select("started_at").eq("organization_id", s.org.id).gte("started_at", since),
    sb.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", s.org.id).gte("created_at", since),
    sb.from("ai_employees").select("id, name, industry, dialect, voice, status").eq("organization_id", s.org.id),
    sb.from("conversations").select("id, channel, status, summary, sentiment, started_at, customers(full_name), ai_employees(name)").eq("organization_id", s.org.id).order("started_at", { ascending: false }).limit(6),
  ]);
  const c = calls.data ?? [];
  const answered = c.filter((x) => ["completed", "transferred", "in_progress"].includes(x.status)).length;
  const days = new Map<string, { day: string; calls: number; answered: number; chats: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(5, 10);
    days.set(d, { day: d, calls: 0, answered: 0, chats: 0 });
  }
  c.forEach((x) => { const d = days.get(x.started_at.slice(5, 10)); if (d) { d.calls++; if (x.status === "completed") d.answered++; } });
  (convs.data ?? []).forEach((x) => { const d = days.get(x.started_at.slice(5, 10)); if (d) d.chats++; });
  const totalSec = c.reduce((a, x) => a + (x.duration_sec ?? 0), 0);
  return {
    demo: false,
    stats: {
      totalCalls: c.length,
      answered,
      missed: c.filter((x) => ["no_answer", "busy", "failed"].includes(x.status)).length,
      aiConversations: convs.data?.length ?? 0,
      appointments: appts.count ?? 0,
      hoursSaved: Math.round((totalSec + (convs.data?.length ?? 0) * 90) / 3600),
    },
    daily: [...days.values()],
    monthly: [] as typeof demo.demoMonthly,
    recent: (recent.data ?? []).map((r) => ({
      id: r.id, channel: r.channel, status: r.status, summary: r.summary ?? "", sentiment: r.sentiment ?? "neutral", at: r.started_at, duration: 0,
      customer: (r.customers as unknown as { full_name: string } | null)?.full_name ?? "—",
      employee: (r.ai_employees as unknown as { name: string } | null)?.name ?? "—",
    })),
    employees: (emps.data ?? []).map((e, i) => ({ ...e, callsToday: 0, satisfaction: 0, hue: [265, 200, 300, 330, 180][i % 5] })) as typeof demo.demoEmployees,
  };
}

export async function getEmployees(s: S) {
  if (s.demo) return { demo: true, employees: demo.demoEmployees };
  const sb = (await supabaseServer())!;
  const { data } = await sb.from("ai_employees").select("id, name, industry, dialect, voice, status").eq("organization_id", s.org.id).order("created_at");
  return { demo: false, employees: (data ?? []).map((e, i) => ({ ...e, callsToday: 0, satisfaction: 0, hue: [265, 200, 300, 330, 180][i % 5] })) as typeof demo.demoEmployees };
}

export async function getConversations(s: S, channel?: string) {
  if (s.demo) return { demo: true, items: channel === "phone" ? demo.demoCalls : demo.demoConversations, transcript: demo.demoTranscript };
  const sb = (await supabaseServer())!;
  let q = sb.from("conversations").select("id, channel, status, summary, sentiment, started_at, customers(full_name), ai_employees(name)").eq("organization_id", s.org.id).order("started_at", { ascending: false }).limit(100);
  if (channel) q = q.eq("channel", channel);
  const { data } = await q;
  return {
    demo: false,
    transcript: [] as typeof demo.demoTranscript,
    items: (data ?? []).map((r) => ({
      id: r.id, channel: r.channel, status: r.status, summary: r.summary ?? "", sentiment: r.sentiment ?? "neutral", at: r.started_at, duration: 0,
      customer: (r.customers as unknown as { full_name: string } | null)?.full_name ?? "—",
      employee: (r.ai_employees as unknown as { name: string } | null)?.name ?? "—",
    })),
  };
}

export async function getCustomers(s: S) {
  if (s.demo) return { demo: true, customers: demo.demoCustomers };
  const sb = (await supabaseServer())!;
  const { data } = await sb.from("customers").select("id, full_name, phone, tags, notes, last_contact_at").eq("organization_id", s.org.id).order("last_contact_at", { ascending: false, nullsFirst: false }).limit(500);
  return {
    demo: false,
    customers: (data ?? []).map((c) => ({ id: c.id, name: c.full_name ?? "—", phone: c.phone ?? "", tags: c.tags ?? [], notes: c.notes ?? "", lastContact: c.last_contact_at ?? new Date().toISOString(), conversations: 0, appointments: 0 })),
  };
}

export async function getBilling(s: S) {
  if (s.demo) return { demo: true, plan: "business", status: "active", interval: "monthly", renews: "2026-11-01", cancelAtPeriodEnd: false, billingProvider: null, payments: demo.demoPayments.map((x) => ({ ...x, receiptUrl: null })), usage: demo.demoUsage };
  const sb = (await supabaseServer())!;
  const [{ data: sub }, { data: pays }] = await Promise.all([
    // A live subscription and a pending checkout can coexist; prefer the live one.
    sb.from("subscriptions").select("status, interval, provider, current_period_end, trial_ends_at, cancel_at_period_end, subscription_plans(code, max_employees, monthly_voice_minutes, monthly_conversations)").eq("organization_id", s.org.id).in("status", ["trialing", "active", "past_due", "incomplete"]).order("created_at", { ascending: false }).limit(5)
      .then((r) => ({ data: (r.data ?? []).find((x) => x.status !== "incomplete") ?? r.data?.[0] ?? null })),
    sb.from("payments").select("id, created_at, amount, currency, status, method, provider, receipt_url").eq("organization_id", s.org.id).order("created_at", { ascending: false }).limit(24),
  ]);
  const plan = sub?.subscription_plans as unknown as { code: string; max_employees: number; monthly_voice_minutes: number; monthly_conversations: number } | null;
  const { count: employees } = await sb.from("ai_employees").select("id", { count: "exact", head: true }).eq("organization_id", s.org.id);
  const { getUsage } = await import("@/lib/billing");
  const usage = await getUsage(sb as never, s.org.id);
  return {
    demo: false,
    plan: plan?.code ?? null,
    status: sub?.status ?? null,
    interval: sub?.interval ?? "monthly",
    renews: sub?.current_period_end ?? sub?.trial_ends_at ?? null,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    billingProvider: (sub?.provider as "stripe" | "myfatoorah" | null) ?? null,
    payments: (pays ?? []).map((p) => ({ id: p.id, date: p.created_at.slice(0, 10), amount: Number(p.amount), currency: p.currency, status: p.status, method: p.method ?? "—", provider: p.provider, receiptUrl: (p.receipt_url as string | null) ?? null })),
    usage: {
      voiceMinutes: usage.voiceMinutes, voiceLimit: plan?.monthly_voice_minutes ?? 0,
      conversations: usage.conversations, conversationLimit: plan?.monthly_conversations ?? 0,
      employees: employees ?? 0, employeeLimit: plan?.max_employees ?? 1,
    },
  };
}

export async function getIntegrations(s: S) {
  if (s.demo) return { demo: true, rows: [] as { provider: string; status: string; connected_at: string | null; last_error: string | null }[] };
  const sb = (await supabaseServer())!;
  const { data } = await sb.from("integrations").select("provider, status, connected_at, last_error").eq("organization_id", s.org.id);
  return { demo: false, rows: data ?? [] };
}
