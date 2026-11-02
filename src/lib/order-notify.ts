import "server-only";
import { providerStatus } from "@/lib/env";
import { insideServiceWindow } from "@/lib/messaging/wa-core";
import { reportError } from "@/lib/monitoring";
import { engineDb } from "@/lib/so/context";

const TEXT: Record<string, { ar: string; en: string }> = {
  confirmed: { ar: "تم تأكيد طلبك رقم #{n} ✅", en: "Your order #{n} is confirmed ✅" },
  ready: { ar: "طلبك رقم #{n} جاهز للاستلام 🛍️", en: "Your order #{n} is ready for pickup 🛍️" },
  out_for_delivery: { ar: "طلبك رقم #{n} في الطريق إليك 🛵", en: "Your order #{n} is on its way 🛵" },
  delivered: { ar: "تم توصيل طلبك رقم #{n}. بالعافية! 🌟", en: "Your order #{n} was delivered. Enjoy! 🌟" },
};

/**
 * Tells the customer about an order status change on WhatsApp — only when WhatsApp is connected
 * and the customer messaged in the last 24 h (Meta's rule for free-form messages). Otherwise does
 * nothing and says so (returns null); it never pretends a message was sent.
 */
export async function notifyCustomerOrderStatus(orgId: string, customerId: string, orderNo: number, status: string): Promise<string | null> {
  const t = TEXT[status];
  if (!t || !providerStatus("whatsapp").configured) return null;
  try {
    const db = engineDb();
    const { data: integ } = await db.from("integrations").select("status").eq("organization_id", orgId).eq("provider", "whatsapp").maybeSingle();
    if (integ?.status !== "connected") return null;
    const [{ data: c }, { data: org }] = await Promise.all([
      db.from("customers").select("phone, whatsapp_last_inbound_at").eq("id", customerId).eq("organization_id", orgId).maybeSingle(),
      db.from("organizations").select("preferred_language").eq("id", orgId).single(),
    ]);
    if (!c?.phone || !insideServiceWindow(c.whatsapp_last_inbound_at as string | null)) return null;
    const text = (org?.preferred_language === "en" ? t.en : t.ar).replace("{n}", String(orderNo));
    const { enqueue, runJob } = await import("@/lib/jobs");
    const job = await enqueue(db, { orgId, kind: "whatsapp_text", payload: { to: c.phone, parts: [text] } });
    if (job && (await runJob(db, job))) return "whatsapp";
    return null; // queued for retry; reported in Settings → Message deliveries if it keeps failing
  } catch (e) {
    reportError(e, { scope: "order-notify" });
    return null;
  }
}
