import type Stripe from "stripe";
import { audit } from "@/lib/audit";
import { recordPayment, syncStripeSubscription } from "@/lib/billing";
import { fromMinor } from "@/lib/payments/money";
import { reportError } from "@/lib/monitoring";
import { stripe, verifyStripeEvent } from "@/lib/payments/stripe";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Stripe webhook — signature-verified, idempotent (upserts keyed on provider ids). */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = verifyStripeEvent(await req.text(), sig);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  const db = supabaseService();
  if (!db) return new Response("DB not configured", { status: 503 });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncStripeSubscription(db, event.data.object);
        break;
      case "checkout.session.completed": {
        const cs = event.data.object;
        if (cs.metadata?.addon_id && cs.payment_status === "paid") {
          // one-time add-on: activate only after Stripe reports it paid
          await db.from("subscription_addons").update({ status: "active", provider_ref: cs.id }).eq("id", cs.metadata.addon_id).eq("organization_id", cs.metadata.org_id).eq("status", "pending");
          await recordPayment(db, { orgId: cs.metadata.org_id, provider: "stripe", providerPaymentId: String(cs.payment_intent ?? cs.id), amount: fromMinor(cs.amount_total ?? 0, cs.currency ?? "kwd"), currency: cs.currency ?? "kwd", status: "succeeded", method: "card", eventId: event.id });
          await audit({ orgId: cs.metadata.org_id, action: "addon.activated", metadata: { addon: cs.metadata.addon_id } });
        }
        if (cs.subscription) await syncStripeSubscription(db, await stripe().subscriptions.retrieve(String(cs.subscription)));
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice & { subscription?: string };
        const subId = inv.subscription ?? (inv as unknown as { parent?: { subscription_details?: { subscription?: string } } }).parent?.subscription_details?.subscription;
        const orgId = inv.metadata?.org_id || (subId ? (await stripe().subscriptions.retrieve(String(subId))).metadata.org_id : undefined);
        if (!orgId) break;
        await recordPayment(db, {
          orgId, provider: "stripe", providerPaymentId: inv.id!, amount: fromMinor(event.type === "invoice.paid" ? inv.amount_paid : inv.amount_due, inv.currency),
          currency: inv.currency, status: event.type === "invoice.paid" ? "succeeded" : "failed", method: "card", receiptUrl: inv.hosted_invoice_url, eventId: event.id,
        });
        await audit({ orgId, action: `payment.${event.type === "invoice.paid" ? "succeeded" : "failed"}`, metadata: { provider: "stripe", invoice: inv.id } });
        break;
      }
    }
  } catch (e) {
    reportError(e, { scope: "stripe-webhook", event: event.type });
    return new Response("Handler error", { status: 500 }); // Stripe retries
  }
  return new Response("ok");
}
