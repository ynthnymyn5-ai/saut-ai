import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { MANAGE_AI } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  areas: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  fee: z.number().min(0).max(1000).optional(),
  min_order: z.number().min(0).max(100000).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Edit a zone (fee changes apply to new orders only — existing orders keep the fee they were charged). */
export const PATCH = route("zones-update", async (req, { params }) => {
  const s = await requireApiSession(MANAGE_AI);
  const id = z.string().uuid().parse((await params).id);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("delivery_zones").update(b).eq("id", id).eq("organization_id", s.org.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Zone not found");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "delivery_zone.updated", targetType: "delivery_zone", targetId: id, metadata: b });
  return ok({ ok: true });
}, { limit: 30 });
