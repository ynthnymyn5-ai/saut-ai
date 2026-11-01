import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { AuthError, ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const patch = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Invalid phone number").nullable().optional().or(z.literal("")),
  locale: z.enum(["ar", "en"]).optional(),
});

/** The signed-in user's own profile (RLS: users can only read/update themselves). */
export const GET = route("profile-get", async () => {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  if (s.demo) return ok({ demo: true, profile: { email: s.email, full_name: s.fullName, phone: null, locale: "ar" } });
  const sb = (await supabaseServer())!;
  const { data } = await sb.from("users").select("email, full_name, phone, locale").eq("id", s.userId).single();
  return ok({ profile: data });
});

export const PATCH = route("profile-update", async (req) => {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  const body = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { error } = await sb.from("users").update({ ...body, phone: body.phone === "" ? null : body.phone }).eq("id", s.userId);
  if (error) throw error;
  await audit({ orgId: s.org?.id ?? null, actorId: s.userId, action: "profile.updated", metadata: { fields: Object.keys(body) } });
  return ok({ ok: true });
}, { limit: 20 });
