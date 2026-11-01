import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/validation";

/** Create a customer (phone is unique per organization). */
export const POST = route("customers-create", async (req) => {
  const s = await requireApiSession(OPERATE);
  const b = await parseJson(req, customerSchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const phone = (b.phone.startsWith("+") ? "+" : "") + b.phone.replace(/\D/g, "");
  const { data, error } = await sb.from("customers").insert({
    organization_id: s.org.id, phone, full_name: b.fullName || null, email: b.email || null, tags: b.tags, notes: b.notes ?? null, marketing_consent: b.marketingConsent,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return fail(409, "duplicate", "A customer with this phone number already exists");
    throw error;
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "customer.created", targetType: "customer", targetId: data.id });
  return ok({ id: data.id }, 201);
}, { limit: 30 });
