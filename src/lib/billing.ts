import "server-only";
import type Stripe from "stripe";
import { supabaseService } from "@/lib/supabase/server";
import type { PlanCode } from "@/lib/plans";

type DB = NonNullable<ReturnType<typeof supabaseService>>;

export async function getTrialDays(db: DB | null) {
  if (!db) return 14;
  const { data } = await db.from("platform_settings").select("value").eq("key", "trial").maybeSingle();
  const v = data?.value as { enabled?: boolean; days?: number } | undefined;
  return v?.enabled === false ? 0 : (v?.days ?? 14);
}

async function planId(db: DB, code: PlanCode) {
  const { data, error } = await db.from("subscription_plans").select("id").eq("code", code).single();
  if (error) throw error;
  return data.id as string;
}

const STRIPE_STATUS: Record<string, string> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "paused",
};

/** Source of truth for subscription state is the provider; this mirrors it. */
export async function syncStripeSubscription(db: DB, sub: Stripe.Subscription) {
  const orgId = sub.metadata.org_id;
  const plan = sub.metadata.plan as PlanCode;
  if (!orgId || !plan) throw new Error("Stripe subscription missing org_id/plan metadata");
  const item = sub.items.data[0] as Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number };
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;

  const row = {
    organization_id: orgId,
    plan_id: await planId(db, plan),
    status: STRIPE_STATUS[sub.status] ?? "incomplete",
    interval: (sub.metadata.interval as "monthly" | "annual") ?? "monthly",
    provider: "stripe",
    provider_subscription_id: sub.id,
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_start: start ? new Date(start * 1000).toISOString() : null,
    current_period_end: end ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
  };
  const { error } = await db.from("subscriptions").upsert(row, { onConflict: "provider_subscription_id" });
  if (error) throw error;
}

export async function recordPayment(
  db: DB,
  p: {
    orgId: string;
    provider: "stripe" | "myfatoorah";
    providerPaymentId: string;
    amount: number;
    currency: string;
    status: "pending" | "succeeded" | "failed" | "refunded";
    method?: string | null;
    receiptUrl?: string | null;
    eventId?: string;
  },
) {
  const { error } = await db.from("payments").upsert(
    {
      organization_id: p.orgId,
      provider: p.provider,
      provider_payment_id: p.providerPaymentId,
      amount: p.amount,
      currency: p.currency.toUpperCase(),
      status: p.status,
      method: p.method ?? null,
      receipt_url: p.receiptUrl ?? null,
      raw_event_id: p.eventId ?? null,
      paid_at: p.status === "succeeded" ? new Date().toISOString() : null,
    },
    { onConflict: "provider,provider_payment_id" },
  );
  if (error) throw error;
}

/** Current usage vs plan limits for the billing page and enforcement. */
export async function getUsage(db: DB, orgId: string) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const period = monthStart.toISOString().slice(0, 10);
  const { data } = await db.from("usage_records").select("metric, quantity").eq("organization_id", orgId).gte("period_start", period);
  const sum = (m: string) => (data ?? []).filter((r) => r.metric === m).reduce((a, r) => a + Number(r.quantity), 0);
  return { voiceMinutes: Math.round(sum("voice_seconds") / 60), conversations: sum("conversations") };
}
