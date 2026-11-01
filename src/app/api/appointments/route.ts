import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Appointments in a date range (default: today −1 day → +30 days). RLS scopes to the user's organizations. */
export const GET = route("appointments-list", async (req) => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, appointments: [] });
  const u = new URL(req.url);
  const from = u.searchParams.get("from") ?? new Date(Date.now() - 86400000).toISOString();
  const to = u.searchParams.get("to") ?? new Date(Date.now() + 30 * 86400000).toISOString();
  const status = u.searchParams.get("status");
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return fail(422, "invalid_input", "Invalid date range");
  const sb = (await supabaseServer())!;
  let q = sb.from("appointments").select("id, kind, starts_at, ends_at, party_size, status, notes, created_at, customer_id, customers(full_name, phone), ai_employees(name)")
    .eq("organization_id", s.org.id).gte("starts_at", from).lte("starts_at", to).order("starts_at").limit(500);
  if (status && ["pending", "confirmed", "canceled", "completed", "no_show"].includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return ok({
    appointments: (data ?? []).map((a) => {
      const c = a.customers as unknown as { full_name: string | null; phone: string | null } | null;
      const e = a.ai_employees as unknown as { name: string } | null;
      return { id: a.id, kind: a.kind, starts_at: a.starts_at, ends_at: a.ends_at, party_size: a.party_size, status: a.status, notes: a.notes, customer: c ? { id: a.customer_id, name: c.full_name, phone: c.phone } : null, bookedBy: e?.name ?? null };
    }),
  });
});

const createSchema = z.object({
  customer_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Invalid phone number"),
  starts_at: z.string().datetime({ offset: true }),
  duration_min: z.number().int().min(5).max(600).default(30),
  kind: z.enum(["appointment", "reservation", "viewing", "callback"]).default("appointment"),
  party_size: z.number().int().min(1).max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["pending", "confirmed"]).default("confirmed"),
});

/** Staff-created appointment; finds or creates the customer by phone within the organization. */
export const POST = route("appointments-create", async (req) => {
  const s = await requireApiSession(OPERATE);
  const b = await parseJson(req, createSchema);
  if (s.demo) return ok({ demo: true });
  const starts = new Date(b.starts_at);
  if (starts.getTime() < Date.now() - 5 * 60000) return fail(422, "invalid_input", "The appointment time is in the past");
  const sb = (await supabaseServer())!;
  const phone = (b.phone.startsWith("+") ? "+" : "") + b.phone.replace(/\D/g, "");
  const { data: cust, error: cErr } = await sb.from("customers").upsert({ organization_id: s.org.id, phone, full_name: b.customer_name, last_contact_at: new Date().toISOString() }, { onConflict: "organization_id,phone" }).select("id").single();
  if (cErr) throw cErr;
  const { data, error } = await sb.from("appointments").insert({
    organization_id: s.org.id, customer_id: cust.id, kind: b.kind, starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + b.duration_min * 60000).toISOString(),
    party_size: b.party_size ?? null, notes: b.notes ?? null, status: b.status,
  }).select("id").single();
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "appointment.created", targetType: "appointment", targetId: data.id });
  return ok({ id: data.id }, 201);
}, { limit: 30 });
