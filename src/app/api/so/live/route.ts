import { allProviderStatus } from "@/lib/env";
import { ok, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { maskPhone } from "@/lib/so/context";

export const dynamic = "force-dynamic";

/**
 * Live Operations: conversations active in the last 30 minutes plus open escalations.
 * Only rows that exist in the database are returned; nothing is simulated.
 */
export const GET = route("so-live", async () => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, items: [], health: allProviderStatus() });
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  let q = c.db.from("conversations")
    .select("id, channel, status, handled_by, assigned_user, escalated_at, current_task, started_at, last_activity_at, branch_id, intent, employee_id, ai_employees(name, live_status), customers(id, full_name, phone, tags)")
    .eq("organization_id", c.s.org.id)
    .or(`and(status.eq.active,last_activity_at.gte.${since}),and(status.eq.transferred,handled_by.eq.ai)`)
    .order("last_activity_at", { ascending: false }).limit(50);
  if (c.branchIds) q = q.in("branch_id", c.branchIds);
  const { data } = await q;
  const ids = (data ?? []).map((d) => d.id);
  const [calls, msgs] = await Promise.all([
    ids.length ? c.db.from("calls").select("conversation_id, status, started_at, provider_call_sid").in("conversation_id", ids).eq("organization_id", c.s.org.id) : Promise.resolve({ data: [] }),
    ids.length ? c.db.from("messages").select("conversation_id, role, content, created_at").in("conversation_id", ids).eq("organization_id", c.s.org.id).order("created_at", { ascending: false }).limit(400) : Promise.resolve({ data: [] }),
  ]);
  const items = (data ?? []).map((d) => {
    const call = (calls.data ?? []).find((x) => x.conversation_id === d.id);
    const cust = d.customers as unknown as { id: string; full_name: string | null; phone: string | null; tags: string[] } | null;
    const ag = d.ai_employees as unknown as { name: string; live_status: string } | null;
    return {
      id: d.id, channel: d.channel, status: d.status, handledBy: d.handled_by, assignedToMe: d.assigned_user === c.s.userId, escalated: !!d.escalated_at, task: d.current_task, intent: d.intent,
      startedAt: d.started_at, lastActivityAt: d.last_activity_at,
      call: call ? { status: call.status, startedAt: call.started_at, canTakeOver: !!call.provider_call_sid && ["in_progress", "ringing"].includes(call.status) } : null,
      agent: ag ? { name: ag.name, status: ag.live_status } : null,
      customer: cust ? { id: cust.id, name: cust.full_name, phone: c.canSeeCustomer ? cust.phone : maskPhone(cust.phone), tags: cust.tags } : null,
      transcript: (msgs.data ?? []).filter((m) => m.conversation_id === d.id).slice(0, 12).reverse().map((m) => ({ role: m.role, content: m.content, at: m.created_at })),
    };
  });
  return ok({ items, health: allProviderStatus(), generatedAt: new Date().toISOString() });
}, { limit: 60 });
