import { z } from "zod";
import { getSession } from "@/lib/auth";
import { AuthError, fail, ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { INDUSTRIES } from "@/lib/validation";

const onboardingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.enum(["KW", "SA", "AE", "QA", "BH", "OM", "US"]),
  industry: z.enum(INDUSTRIES),
  contact_email: z.string().trim().email().max(200).optional().or(z.literal("")),
  contact_phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
  timezone: z.enum(["Asia/Kuwait", "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "UTC"]),
  language: z.enum(["ar", "en"]),
});

/**
 * Creates the user's business through the create_organization() database function, which
 * atomically inserts the organization, the owner membership, a free-trial subscription and
 * an audit entry, and validates every field again in SQL. Runs as the signed-in user (RLS).
 */
export const POST = route("onboarding", async (req) => {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  const b = await parseJson(req, onboardingSchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.rpc("create_organization", {
    p_name: b.name, p_country: b.country, p_industry: b.industry,
    p_contact_email: b.contact_email || null, p_contact_phone: b.contact_phone || null,
    p_timezone: b.timezone, p_language: b.language, p_address: b.address || null,
  });
  if (error) {
    if (error.message.includes("limit")) return fail(409, "org_limit", "You already own the maximum number of organizations.");
    return fail(422, "invalid_input", error.message);
  }
  await notifyOwnerOfSignup({
    businessName: b.name, ownerName: s.fullName, ownerEmail: s.email,
    contactEmail: b.contact_email || null, contactPhone: b.contact_phone || null,
    country: b.country, industry: b.industry, language: b.language, organizationId: String(data),
  });
  const res = ok({ organizationId: data }, 201);
  res.cookies.set("saut_locale", b.language, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}, { limit: 5 });

/** Emails the platform owner about the new business. Never blocks or fails sign-up. */
async function notifyOwnerOfSignup(info: import("@/lib/admin-notify").NewSignup) {
  try {
    const { providerStatus } = await import("@/lib/env");
    if (!providerStatus("email").configured) return;
    const { sendEmail } = await import("@/lib/messaging/email");
    const { CONTACT_EMAIL } = await import("@/lib/contact");
    const { newSignupEmail } = await import("@/lib/admin-notify");
    const to = (process.env.SIGNUP_ALERT_EMAIL || CONTACT_EMAIL).trim();
    const { subject, text } = newSignupEmail(info, process.env.NEXT_PUBLIC_APP_URL || "https://www.sautai.company");
    const r = await sendEmail(to, subject, text);
    if (!r.ok) {
      const { reportError } = await import("@/lib/monitoring");
      await reportError(new Error(`Signup alert email failed: ${r.error}`), { scope: "signup-alert" });
    }
  } catch { /* the business is created either way */ }
}
