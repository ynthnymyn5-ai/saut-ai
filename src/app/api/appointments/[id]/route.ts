import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

const patch = z.object({
  status: z.enum(["pending", "confirmed", "canceled", "completed", "no_show"]).optional(),
  starts_at: z.string().datetime({ offset: true }).optional(),
  duration_min: z.number().int().min(5).max(600).optional(),
  party_size: z.number().int().min(1).max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

/** Update or reschedule. Cancelling is a status change — appointments are never hard-deleted. */
export const PATCH = route("appointment-update", async (req, ctx) => {
  const s = await requireApiSession(OPERATE);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const sb = (await supabaseServer())!;
  const { data: cur } = await sb.from("appointments").select("starts_at, ends_at, status").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!cur) return fail(404, "not_found", "Appointment not found");
  const row: Record<string, unknown> = { status: b.status, party_size: b.party_size, notes: b.notes };
  if (b.starts_at || b.duration_min) {
    const starts = new Date(b.starts_at ?? cur.starts_at);
    const dur = b.duration_min ?? (cur.ends_at ? Math.round((new Date(cur.ends_at).getTime() - new Date(cur.starts_at).getTime()) / 60000) : 30);
    row.starts_at = starts.toISOString();
    row.ends_at = new Date(starts.getTime() + dur * 60000).toISOString();
  }
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);
  const { error } = await sb.from("appointments").update(row).eq("id", id).eq("organization_id", s.org.id);
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: b.status === "canceled" ? "appointment.canceled" : "appointment.updated", targetType: "appointment", targetId: id, metadata: { fields: Object.keys(row) } });
  return ok({ ok: true });
});
