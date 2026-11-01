import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { getTrialDays } from "@/lib/billing";
import { fail, ok, parseJson, route } from "@/lib/http";
import { createMyFatoorahPayment } from "@/lib/payments/myfatoorah";
import { createStripeCheckout, stripe } from "@/lib/payments/stripe";
import { getPlan } from "@/lib/plans";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { checkoutSchema } from "@/lib/validation";

/**
 * Starts checkout and returns the provider's hosted payment URL.
 * Nothing is activated here — subscriptions become active only from verified webhooks.
 */
export const POST = route("billing-checkout", async (req) => {
  const s = await requireApiSession(["owner", "admin"]);
  const input = await parseJson(req, checkoutSchema);
  if (s.demo) return ok({ demo: true });

  const db = supabaseService();
  if (!db) return fail(503, "provider_not_configured", "Database service role missing", { variable: "SUPABASE_SERVICE_ROLE_KEY" });
  const sb = (await supabaseServer())!;

  // Prices come from the database (admin-editable), never from the client.
  const { data: plan } = await db.from("subscription_plans").select("id, price_monthly, price_annual, currency, is_active").eq("code", input.plan).single();
  if (!plan?.is_active) return fail(400, "plan_unavailable", "Plan unavailable");
  let amount = Number(input.interval === "annual" ? plan.price_annual : plan.price_monthly);

  if (input.coupon) {
    const { data: c } = await db.from("coupons").select("percent_off, amount_off, max_redemptions, times_redeemed, expires_at, is_active").eq("code", input.coupon).maybeSingle();
    const valid = c && c.is_active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (!c.max_redemptions || c.times_redeemed < c.max_redemptions);
    if (!valid) return fail(400, "invalid_coupon", "Coupon is invalid or expired");
    amount = c.percent_off ? amount * (1 - c.percent_off / 100) : Math.max(0, amount - Number(c.amount_off));
  }

  const { data: existing } = await sb.from("subscriptions").select("id, provider, provider_subscription_id, provider_customer_id, status").eq("organization_id", s.org.id).in("status", ["trialing", "active", "past_due"]).maybeSingle();

  // Upgrade / downgrade an existing Stripe subscription in place (prorated).
  if (existing?.provider === "stripe" && existing.provider_subscription_id && input.provider === "stripe") {
    const { stripePriceId } = await import("@/lib/payments/stripe");
    const sub = await stripe().subscriptions.retrieve(existing.provider_subscription_id);
    await stripe().subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price: stripePriceId(input.plan, input.interval) }],
      proration_behavior: "create_prorations",
      metadata: { ...sub.metadata, plan: input.plan, interval: input.interval },
    });
    await audit({ orgId: s.org.id, actorId: s.userId, action: "subscription.change_requested", metadata: input });
    return ok({ url: "/dashboard/billing?checkout=processing" });
  }

  const trialDays = existing ? 0 : await getTrialDays(db);
  let url: string;
  if (input.provider === "stripe") {
    url = await createStripeCheckout({ orgId: s.org.id, email: s.email, plan: input.plan, interval: input.interval, trialDays, customerId: existing?.provider_customer_id, promotionCode: undefined });
  } else {
    const { data: pending, error } = await db.from("subscriptions").insert({ organization_id: s.org.id, plan_id: plan.id, status: "incomplete", interval: input.interval, provider: "myfatoorah", coupon_code: input.coupon ?? null }).select("id").single();
    if (error) throw error;
    const r = await createMyFatoorahPayment({ orgId: s.org.id, amount: Number(amount.toFixed(3)), currency: plan.currency, customerName: s.fullName ?? s.org.name, email: s.email, reference: pending.id, interval: input.interval });
    url = r.url;
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "checkout.started", metadata: { ...input, plan_name: getPlan(input.plan).name.en } });
  return ok({ url });
}, { limit: 10 });
