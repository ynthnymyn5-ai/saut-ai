import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, MANAGE_AI } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The organization's product / menu catalogue. RLS: members read. */
export const GET = route("products-list", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, products: [] });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("products").select("id, name, description, sku, price, currency, is_active, updated_at")
    .eq("organization_id", s.org.id).order("is_active", { ascending: false }).order("name").limit(500);
  if (error) throw error;
  return ok({ products: data ?? [] });
}, { limit: 60 });

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  sku: z.string().trim().max(60).optional().nullable(),
  price: z.number().min(0).max(100000).multipleOf(0.001),
  currency: z.string().regex(/^[A-Z]{3}$/).default("KWD"),
  is_active: z.boolean().default(true),
});

/** Add a product. Owners/admins/managers only (also enforced by RLS). */
export const POST = route("products-create", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const b = await parseJson(req, productSchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("products").insert({ ...b, organization_id: s.org.id }).select("id").single();
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "product.created", targetType: "product", targetId: data.id, metadata: { name: b.name, price: b.price } });
  return ok({ id: data.id }, 201);
}, { limit: 60 });
