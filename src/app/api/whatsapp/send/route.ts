import { OPERATE } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { insideServiceWindow, splitWhatsAppText } from "@/lib/messaging/wa-core";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { supabaseServer } from "@/lib/supabase/server";
import { whatsappSendSchema } from "@/lib/validation";

/** Manual WhatsApp send from the dashboard. Reports success only if Meta accepted the message. */
export const POST = route("whatsapp-send", async (req) => {
  const s = await requireApiSession(OPERATE);
  const { to, text } = await parseJson(req, whatsappSendSchema);
  if (s.demo) return ok({ demo: true, sent: false });
  const sb = (await supabaseServer())!;
  const { data: integ } = await sb.from("integrations").select("status").eq("organization_id", s.org.id).eq("provider", "whatsapp").maybeSingle();
  if (integ?.status !== "connected") return fail(409, "not_connected", "WhatsApp is not connected");
  // Meta rejects free-form messages outside the 24 h customer-service window; say so up front.
  const phone = "+" + to.replace(/\D/g, "");
  const { data: cust } = await sb.from("customers").select("whatsapp_last_inbound_at").eq("organization_id", s.org.id).eq("phone", phone).maybeSingle();
  if (!insideServiceWindow(cust?.whatsapp_last_inbound_at as string | null | undefined)) {
    return fail(409, "template_required", "This customer hasn't messaged in the last 24 hours. WhatsApp only allows an approved template message now.");
  }
  let r: Awaited<ReturnType<typeof sendWhatsAppText>> = { ok: false, error: "empty message", retryable: false };
  for (const part of splitWhatsAppText(text)) {
    r = await sendWhatsAppText(to, part);
    if (!r.ok) break;
  }
  if (!r.ok) return fail(502, "provider_error", r.error);
  await audit({ orgId: s.org.id, actorId: s.userId, action: "whatsapp.sent", metadata: { to: to.slice(0, -4) + "****", id: r.id } });
  return ok({ sent: true, id: r.id });
}, { limit: 30 });
