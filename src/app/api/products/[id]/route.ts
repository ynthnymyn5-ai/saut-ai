import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { MANAGE_AI } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const id = z.string().uuid();
const patch = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  price: z.number().min(0).max(100000).multipleOf(0.001).optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Edit or (de)activate a product. Products are never hard-deleted: past orders keep a snapshot, and hiding is reversible. */
export const PATCH = route("products-update", async (req, { params }) => {
  const s = await requireApiSession(MANAGE_AI);
  const pid = id.parse((await params).id);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("products").update(b).eq("id", pid).eq("organization_id", s.org.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Product not found");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "product.updated", targetType: "product", targetId: pid, metadata: b });
  return ok({ ok: true });
}, { limit: 60 });
