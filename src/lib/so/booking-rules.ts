import "server-only";
import { checkSlot, freeSlots, type Busy } from "./availability";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (t: string) => any };

/**
 * Loads the rules that apply to a booking (branch opening hours → AI employee working hours →
 * default 09:00–21:00; capacity per slot from the employee's business info) and checks it.
 * On conflict, returns up to 4 free alternatives the same day.
 */
export async function validateBooking(db: Client, p: { orgId: string; branchId?: string | null; employeeId?: string | null; startsAt: Date; durationMin: number; ignoreAppointmentId?: string }) {
  const branch = p.branchId ? (await db.from("branches").select("opening_hours").eq("id", p.branchId).eq("organization_id", p.orgId).maybeSingle()).data : null;
  let agentQ = db.from("ai_employees").select("working_hours, business_info").eq("organization_id", p.orgId);
  agentQ = p.employeeId ? agentQ.eq("id", p.employeeId) : agentQ.eq("status", "active").order("created_at").limit(1);
  const agent = (await agentQ.maybeSingle()).data as { working_hours?: { days?: Record<string, [string, string][]> }; business_info?: { capacity_per_slot?: number } } | null;
  const hours = (branch?.opening_hours as Record<string, [string, string][]> | undefined) ?? agent?.working_hours?.days ?? {};
  const capacity = Number(agent?.business_info?.capacity_per_slot ?? 1) || 1;

  const local = new Date(p.startsAt.getTime() + 180 * 60000);
  const date = local.toISOString().slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00+03:00`), dayEnd = new Date(dayStart.getTime() + 86400000);
  let q = db.from("appointments").select("id, starts_at, ends_at").eq("organization_id", p.orgId).in("status", ["pending", "confirmed"]).gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString());
  if (p.branchId) q = q.eq("branch_id", p.branchId);
  const busy = ((await q).data ?? []).filter((b: { id: string }) => b.id !== p.ignoreAppointmentId) as (Busy & { id: string })[];

  const res = checkSlot({ startsAt: p.startsAt, durationMin: p.durationMin, hours, busy, capacity });
  if (res.ok) return { ok: true as const };
  const alternatives = freeSlots({ date, hours, busy, durationMin: p.durationMin, capacity, notBefore: new Date(Date.now() + 15 * 60000), max: 4 }).map((s) => s.local);
  return { ok: false as const, reason: res.reason, alternatives };
}
