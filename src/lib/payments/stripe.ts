import "server-only";
import Stripe from "stripe";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Interval, PlanCode } from "@/lib/plans";

let client: Stripe | null = null;
export function stripe() {
  if (!client) client = new Stripe(serverEnv("STRIPE_SECRET_KEY"));
  return client;
}

export function stripePriceId(plan: PlanCode, interval: Interval) {
  return serverEnv(`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`);
}

/**
 * Stripe Checkout in subscription mode. Apple Pay / Google Pay appear automatically
 * on supported devices once enabled in the Stripe dashboard. Nothing is marked paid
 * here — the webhook does that after Stripe confirms.
 */
export async function createStripeCheckout(opts: {
  orgId: string;
  email: string;
  plan: PlanCode;
  interval: Interval;
  trialDays: number;
  customerId?: string | null;
  promotionCode?: string;
}) {
  const s = stripe();
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: opts.customerId ?? undefined,
    customer_email: opts.customerId ? undefined : opts.email,
    line_items: [{ price: stripePriceId(opts.plan, opts.interval), quantity: 1 }],
    allow_promotion_codes: !opts.promotionCode,
    discounts: opts.promotionCode ? [{ promotion_code: opts.promotionCode }] : undefined,
    subscription_data: {
      trial_period_days: opts.trialDays > 0 ? opts.trialDays : undefined,
      metadata: { org_id: opts.orgId, plan: opts.plan, interval: opts.interval },
    },
    metadata: { org_id: opts.orgId, plan: opts.plan, interval: opts.interval },
    success_url: `${publicEnv.appUrl}/dashboard/billing?checkout=processing`,
    cancel_url: `${publicEnv.appUrl}/dashboard/billing?checkout=canceled`,
  });
  return session.url!;
}

export async function stripePortal(customerId: string) {
  const s = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${publicEnv.appUrl}/dashboard/billing` });
  return s.url;
}

export function verifyStripeEvent(rawBody: string, signature: string) {
  return stripe().webhooks.constructEvent(rawBody, signature, serverEnv("STRIPE_WEBHOOK_SECRET"));
}
