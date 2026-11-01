import "server-only";
import { allProviderStatus } from "@/lib/env";
import { estimates, computeMetrics, periodRange } from "./bi";
import { maskPhone, type DB } from "./context";
import { effectiveStatus, isWithinHours, type LiveStatus } from "./status";

/**
 * Command Center snapshot. Everything is read from the database at request time; the client
 * polls every few seconds. `canSeeCustomer` controls whether phone numbers are unmasked.
 */
export async function commandSnapshot(db: DB, orgId: string, opts: { branchIds: string[] | null; canSeeCustomer: boolean }) {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3 * 3600000);
  const ds = (dayStart.getTime() > now.getTime() ? new Date(dayStart.getTime() - 86400000) : dayStart).toISOString();
  const br = <Q,>(q: Q): Q => (opts.branchIds ? (q as unknown as { in: (c: string, v: string[]) => Q }).in("branch_id", opts.branchIds) : q);

  const [agents, liveCalls, liveConvs, tasks, leadsToday, apptsToday, escalated, pending, integ, execs, convFeed] = await Promise.all([
    br(db.from("ai_employees").select("id, name, role, status, branch_id, live_status, live_detail, live_updated_at, working_hours, phone_number").eq("organization_id", orgId)),
    br(db.from("calls").select("id, employee_id, from_number, started_at, status").eq("organization_id", orgId).in("status", ["ringing", "in_progress"])),
    br(db.from("conversations").select("id, employee_id, channel, handled_by").eq("organization_id", orgId).eq("status", "active").gte("last_activity_at", new Date(now.getTime() - 30 * 60000).toISOString())),
    br(db.from("agent_tasks").select("status, completed_at").eq("organization_id", orgId).or(`status.in.(pending,in_progress,needs_confirmation),completed_at.gte.${ds}`)),
    br(db.from("leads").select("id").eq("organization_id", orgId).gte("created_at", ds)),
    br(db.from("appointments").select("id").eq("organization_id", orgId).gte("created_at", ds)),
    br(db.from("conversations").select("id").eq("organization_id", orgId).eq("status", "transferred").gte("escalated_at", ds)),
    db.from("agent_executions").select("id, agent_id, tool_key, input, started_at").eq("organization_id", orgId).eq("status", "pending_confirmation").order("started_at", { ascending: false }).limit(20),
    db.from("integrations").select("provider, status").eq("organization_id", orgId),
    db.from("agent_executions").select("id, agent_id, tool_key, status, started_at, test_mode, error").eq("organization_id", orgId).eq("test_mode", false).order("started_at", { ascending: false }).limit(25),
    br(db.from("conversations").select("id, employee_id, channel, status, started_at, intent").eq("organization_id", orgId).order("started_at", { ascending: false }).limit(15)),
  ]);

  const connected = new Set((integ.data ?? []).filter((i) => i.status === "connected").map((i) => i.provider as string));
  const pendingByAgent = (pending.data ?? []).reduce<Record<string, number>>((a, p) => { if (p.agent_id) a[p.agent_id] = (a[p.agent_id] ?? 0) + 1; return a; }, {});
  const agentRows = (agents.data ?? []).map((a) => {
    const hasChannel = !!a.phone_number || connected.has("whatsapp") || connected.has("web_widget");
    const status: LiveStatus = effectiveStatus({
      status: a.status, live_status: a.live_status, live_updated_at: a.live_updated_at, hasChannel,
      withinHours: isWithinHours((a.working_hours as { days?: Record<string, [string, string][]> })?.days, "Asia/Kuwait", now),
      pendingAttention: pendingByAgent[a.id] ?? 0,
    }, now.getTime());
    return { id: a.id, name: a.name, role: a.role, status, detail: status === a.live_status ? a.live_detail : null, activeCalls: (liveCalls.data ?? []).filter((c) => c.employee_id === a.id).length, activeConversations: (liveConvs.data ?? []).filter((c) => c.employee_id === a.id).length };
  });

  const [mFrom, mTo] = periodRange("this_month", now);
  const month = await computeMetrics(db, orgId, mFrom, mTo, opts.branchIds?.length === 1 ? opts.branchIds[0] : null);
  const { data: usage } = await db.from("usage_records").select("metric, quantity").eq("organization_id", orgId).gte("period_start", mFrom.toISOString().slice(0, 10));
  const sum = (m: string) => (usage ?? []).filter((u) => u.metric === m).reduce((a, u) => a + Number(u.quantity), 0);

  const names = Object.fromEntries((agents.data ?? []).map((a) => [a.id, a.name]));
  const feed = [
    ...(execs.data ?? []).map((e) => ({ at: e.started_at as string, kind: "action", agent: names[e.agent_id as string] ?? "Automation", text: e.tool_key as string, status: e.status as string, note: (e.error as string) ?? null })),
    ...(convFeed.data ?? []).map((c) => ({ at: c.started_at as string, kind: "conversation", agent: names[c.employee_id as string] ?? "—", text: `${c.channel}${c.intent ? ` · ${c.intent}` : ""}`, status: c.status as string, note: null })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);

  const taskRows = tasks.data ?? [];
  return {
    generatedAt: now.toISOString(),
    agents: agentRows,
    counters: {
      activeAgents: agentRows.filter((a) => a.status !== "offline").length,
      currentCalls: liveCalls.data?.length ?? 0,
      activeConversations: liveConvs.data?.length ?? 0,
      completedTasks: taskRows.filter((t) => t.status === "completed").length,
      pendingTasks: taskRows.filter((t) => t.status !== "completed").length,
      newLeads: leadsToday.data?.length ?? 0,
      bookedAppointments: apptsToday.data?.length ?? 0,
      escalated: escalated.data?.length ?? 0,
      aiUsage: { voiceMinutes: Math.round(sum("voice_seconds") / 60), conversations: month.conversations.total, whatsappMessages: sum("whatsapp_messages") },
      timeSaved: estimates(month).time_saved_hours,
    },
    approvals: (pending.data ?? []).map((p) => ({ id: p.id, agent: names[p.agent_id as string] ?? "Automation", tool: p.tool_key, at: p.started_at, summary: summarizeInput(p.input as Record<string, unknown>, opts.canSeeCustomer) })),
    feed,
    providers: allProviderStatus(),
  };
}

function summarizeInput(i: Record<string, unknown>, unmask: boolean) {
  return Object.entries(i ?? {}).slice(0, 5).map(([k, v]) => `${k}: ${/phone|to/.test(k) && !unmask ? maskPhone(String(v)) : String(v).slice(0, 60)}`).join(" · ");
}
