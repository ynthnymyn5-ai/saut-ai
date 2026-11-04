import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { ticketSchema } from "@/lib/validation";

export const POST = route("support", async (req) => {
  const s = await requireApiSession();
  const t = await parseJson(req, ticketSchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("support_tickets").insert({ organization_id: s.org.id, opened_by: s.userId, subject: t.subject, body: t.body, priority: t.priority }).select("id").single();
  if (error) throw error;
  // Tell the support inbox right away (best effort; the ticket is saved either way).
  const { providerStatus } = await import("@/lib/env");
  if (providerStatus("email").configured) {
    const { sendEmail } = await import("@/lib/messaging/email");
    const { CONTACT_EMAIL } = await import("@/lib/contact");
    await sendEmail(CONTACT_EMAIL, `[SAUT AI support · ${t.priority}] ${t.subject}`,
      `From: ${s.fullName ?? ""} <${s.email}>\nBusiness: ${s.org.name}\nPriority: ${t.priority}\n\n${t.body}`).catch(() => null);
  }
  return ok({ id: data.id }, 201);
}, { limit: 5 });
