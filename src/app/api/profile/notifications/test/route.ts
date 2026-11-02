import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { providerStatus, publicEnv } from "@/lib/env";
import { fail, ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Sends a real test email to the signed-in person. Reports the provider's actual answer — never a fake success. */
export const POST = route("notif-test-email", async () => {
  const s = await requireApiSession();
  if (s.demo) return ok({ demo: true });
  if (!providerStatus("email").configured) return fail(503, "provider_not_configured", "Email sending isn't configured on the server", { variable: "RESEND_API_KEY" });
  if (!s.email) return fail(422, "invalid_input", "Your account has no email address");
  const { sendEmail } = await import("@/lib/messaging/email");
  const r = await sendEmail(s.email, "SAUT AI · Test email ✓", `This is a test from SAUT AI.\nهذه رسالة تجريبية من SAUT AI.\n\nIf you can read this, owner alerts will reach you by email.\n\n${publicEnv.appUrl}/dashboard`);
  if (!r.ok) return fail(502, "provider_error", r.error);
  await audit({ orgId: s.org.id, actorId: s.userId, action: "email.test_sent" });
  return ok({ sent: true, to: s.email });
}, { limit: 5 });
