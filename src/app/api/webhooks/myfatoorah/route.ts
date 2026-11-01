import { audit } from "@/lib/audit";
import { recordPayment } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { getMyFatoorahStatus, verifyMyFatoorahSignature } from "@/lib/payments/myfatoorah";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * MyFatoorah webhook (v2). Two layers of verification:
 *  1. HMAC signature on the payload.
 *  2. Authoritative GetPaymentStatus call — we only activate when MyFatoorah says "Paid".
 */
export async function POST(req: Request) {
  const sig = req.headers.get("myfatoorah-signature") ?? "";
  const body = (await req.json().catch(() => null)) as { Data?: Record<string, unknown> } | null;
  if (!body?.Data || !verifyMyFatoorahSignature(body.Data, sig)) return new Response("Invalid signature", { status: 401 });

  const db = supabaseService();
  if (!db) return new Response("DB not configured", { status: 503 });
  try {
    const invoiceId = String(body.Data.InvoiceId ?? "");
    if (!invoiceId) return new Response("ok");
    const status = await getMyFatoorahStatus(invoiceId);
    const subId = status.CustomerReference;
    const orgId = status.UserDefinedField;
    const tx = status.InvoiceTransactions.at(-1);
    const paid = status.InvoiceStatus === "Paid";

    await recordPayment(db, {
      orgId, provider: "myfatoorah", providerPaymentId: tx?.PaymentId ?? invoiceId, amount: status.InvoiceValue, currency: "KWD", // invoices are created in KWD (checkout)
      status: paid ? "succeeded" : status.InvoiceStatus === "Canceled" ? "failed" : "pending", method: tx?.PaymentGateway ?? null,
    });

    if (paid && subId.startsWith("addon:")) {
      await db.from("subscription_addons").update({ status: "active", provider_ref: `mf_${invoiceId}` }).eq("id", subId.slice(6)).eq("organization_id", orgId).eq("status", "pending");
      await audit({ orgId, action: "addon.activated", metadata: { provider: "myfatoorah", invoiceId } });
    } else if (paid) {
      const { data: sub } = await db.from("subscriptions").select("id, interval").eq("id", subId).eq("organization_id", orgId).maybeSingle();
      if (sub) {
        const start = new Date();
        const end = new Date(start);
        if (sub.interval === "annual") end.setFullYear(end.getFullYear() + 1); else end.setMonth(end.getMonth() + 1);
        // retire any previous live subscription, then activate this one
        await db.from("subscriptions").update({ status: "canceled", canceled_at: start.toISOString() }).eq("organization_id", orgId).neq("id", sub.id).in("status", ["trialing", "active", "past_due"]);
        await db.from("subscriptions").update({ status: "active", provider_subscription_id: `mf_${invoiceId}`, current_period_start: start.toISOString(), current_period_end: end.toISOString(), ...(status.RecurringId ? { provider_recurring_id: status.RecurringId } : {}) }).eq("id", sub.id);
        await audit({ orgId, action: "payment.succeeded", metadata: { provider: "myfatoorah", invoiceId } });
      }
    }
  } catch (e) {
    reportError(e, { scope: "myfatoorah-webhook" });
    return new Response("Handler error", { status: 500 });
  }
  return new Response("ok");
}
