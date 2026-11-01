import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/http";
import { stripePortal } from "@/lib/payments/stripe";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Stripe customer portal: update card, download invoices, see renewals.
 * MyFatoorah has no hosted portal; KNET/card customers renew from the billing page.
 */
export const POST = route("billing-portal", async () => {
  const s = await requireApiSession(["owner", "admin"]);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data: sub } = await sb.from("subscriptions").select("provider, provider_customer_id").eq("organization_id", s.org.id).eq("provider", "stripe").not("provider_customer_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!sub?.provider_customer_id) return fail(409, "no_stripe_customer", "Your plan is not billed through Stripe.");
  const url = await stripePortal(sub.provider_customer_id);
  await audit({ orgId: s.org.id, actorId: s.userId, action: "billing.portal_opened" });
  return ok({ url });
}, { limit: 10 });
