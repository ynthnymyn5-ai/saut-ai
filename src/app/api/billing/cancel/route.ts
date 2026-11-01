import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/http";
import { reportError } from "@/lib/monitoring";
import { cancelMyFatoorahRecurring } from "@/lib/payments/myfatoorah";
import { stripe } from "@/lib/payments/stripe";
import { supabaseService } from "@/lib/supabase/server";

/**
 * Cancel at period end. Stripe confirms via webhook. For MyFatoorah the recurring
 * agreement is cancelled at the provider NOW (so no further charge happens) and access
 * continues until the paid period ends; the billing job then closes the subscription.
 */
export const POST = route("billing-cancel", async () => {
  const s = await requireApiSession(["owner"]);
  if (s.demo) return ok({ demo: true });
  const db = supabaseService();
  if (!db) return fail(503, "provider_not_configured", "Database service role missing", { variable: "SUPABASE_SERVICE_ROLE_KEY" });
  const { data: sub } = await db.from("subscriptions").select("id, provider, provider_subscription_id, provider_recurring_id").eq("organization_id", s.org.id).in("status", ["trialing", "active", "past_due"]).maybeSingle();
  if (!sub) return fail(404, "no_subscription", "No active subscription");

  if (sub.provider === "stripe" && sub.provider_subscription_id) {
    await stripe().subscriptions.update(sub.provider_subscription_id, { cancel_at_period_end: true });
  } else {
    if (sub.provider === "myfatoorah" && sub.provider_recurring_id) {
      try {
        await cancelMyFatoorahRecurring(sub.provider_recurring_id);
      } catch (e) {
        reportError(e, { scope: "billing-cancel", provider: "myfatoorah" });
        return fail(502, "provider_error", "MyFatoorah did not confirm the cancellation. Nothing was changed — please try again or contact support.");
      }
    }
    await db.from("subscriptions").update({ cancel_at_period_end: true }).eq("id", sub.id).eq("organization_id", s.org.id);
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "subscription.cancel_requested", metadata: { provider: sub.provider } });
  return ok({ ok: true });
});
