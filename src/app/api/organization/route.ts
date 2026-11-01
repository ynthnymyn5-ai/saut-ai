import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, MANAGE_ORG } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/validation";

/** Organization profile + its subscription reference. Every member may read; owner/admin may edit. */
export const GET = route("org-get", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, organization: { name: s.org.name, industry: "restaurant", timezone: "Asia/Kuwait", preferred_language: "ar", contact_email: null, contact_phone: null, address: null, country: "KW", currency: "KWD" }, subscription: { plan: "business", status: "active" }, role: s.role });
  const sb = (await supabaseServer())!;
  const [{ data: org }, { data: sub }] = await Promise.all([
    sb.from("organizations").select("id, name, slug, country, currency, industry, timezone, preferred_language, contact_email, contact_phone, address, created_at").eq("id", s.org.id).single(),
    sb.from("subscriptions").select("id, status, interval, trial_ends_at, current_period_end, subscription_plans(code)").eq("organization_id", s.org.id).in("status", ["trialing", "active", "past_due", "incomplete"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return ok({
    organization: org,
    subscription: sub ? { id: sub.id, status: sub.status, interval: sub.interval, trial_ends_at: sub.trial_ends_at, current_period_end: sub.current_period_end, plan: (sub.subscription_plans as unknown as { code: string } | null)?.code ?? null } : null,
    role: s.role,
  });
});

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  industry: z.enum(INDUSTRIES).optional(),
  timezone: z.enum(["Asia/Kuwait", "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "UTC"]).optional(),
  preferred_language: z.enum(["ar", "en"]).optional(),
  contact_email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  contact_phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Invalid phone number").nullable().optional().or(z.literal("")),
  address: z.string().trim().max(300).nullable().optional(),
});

export const PATCH = route("org-update", async (req) => {
  const s = await requireApiSession(MANAGE_ORG);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const row = { ...b, contact_email: b.contact_email === "" ? null : b.contact_email, contact_phone: b.contact_phone === "" ? null : b.contact_phone };
  const { error } = await sb.from("organizations").update(row).eq("id", s.org.id);
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "organization.updated", metadata: { fields: Object.keys(b) } });
  return ok({ ok: true });
}, { limit: 20 });
