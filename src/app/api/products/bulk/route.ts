import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { MANAGE_AI } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({
  items: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    price: z.number().min(0).max(100000), // required: no product is added without a real price
    currency: z.string().regex(/^[A-Z]{3}$/).default("KWD"),
  })).min(1).max(200),
});

/** Adds the products the owner confirmed from a menu import. Names already in the catalogue are skipped. */
export const POST = route("products-bulk", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const b = await parseJson(req, schema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data: existing } = await sb.from("products").select("name").eq("organization_id", s.org.id);
  const have = new Set((existing ?? []).map((p) => String(p.name).toLowerCase()));
  const rows = b.items.filter((i) => !have.has(i.name.toLowerCase())).map((i) => ({
    organization_id: s.org.id, name: i.name, description: i.description ?? null, price: Math.round(i.price * 1000) / 1000, currency: i.currency, is_active: true,
  }));
  if (rows.length) { const { error } = await sb.from("products").insert(rows); if (error) throw error; }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "products.imported", metadata: { added: rows.length, skipped: b.items.length - rows.length } });
  return ok({ added: rows.length, skipped: b.items.length - rows.length });
}, { limit: 10 });
