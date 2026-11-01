import { z } from "zod";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { engineDb, notify } from "@/lib/so/context";
import { internalAuthorized } from "@/lib/so/internal-auth";
import { redirectLiveCall } from "@/lib/telephony/twilio";

export const runtime = "nodejs";

const base = { orgId: z.string().uuid(), employeeId: z.string().uuid(), conversationId: z.string().uuid() };
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("message"), ...base, role: z.enum(["customer", "ai"]), content: z.string().trim().min(1).max(10000) }),
  z.object({ kind: z.literal("transfer"), ...base, callSid: z.string().regex(/^CA[0-9a-f]{32}$/i) }),
]);

/**
 * Voice bridge → call events (shared-secret auth). The bridge holds no database key:
 * transcripts and live transfers go through here, scoped to the org on every query.
 *  - message:  stores one transcript line on the conversation
 *  - transfer: redirects the LIVE Twilio call to the agent's transfer number (or the
 *              platform fallback). Reported as transferred only after Twilio accepts it.
 */
export async function POST(req: Request) {
  if (!internalAuthorized(req)) return new Response("Forbidden", { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "invalid_input" }, { status: 422 });
  const ev = p.data;
  const db = engineDb();
  const { data: conv } = await db.from("conversations").select("id, employee_id").eq("id", ev.conversationId).eq("organization_id", ev.orgId).maybeSingle();
  if (!conv || conv.employee_id !== ev.employeeId) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  if (ev.kind === "message") {
    await db.from("messages").insert({ conversation_id: conv.id, organization_id: ev.orgId, role: ev.role, content: ev.content });
    await db.from("conversations").update({ last_activity_at: new Date().toISOString() }).eq("id", conv.id).eq("organization_id", ev.orgId);
    return Response.json({ ok: true });
  }

  // transfer
  const { data: call } = await db.from("calls").select("id").eq("provider_call_sid", ev.callSid).eq("organization_id", ev.orgId).maybeSingle();
  if (!call) return Response.json({ ok: false, error: "call_not_found" }, { status: 404 });
  const { data: emp } = await db.from("ai_employees").select("dialect, call_settings").eq("id", ev.employeeId).eq("organization_id", ev.orgId).single();
  const to = (emp?.call_settings as { transfer_number?: string | null } | null)?.transfer_number || process.env.TWILIO_HUMAN_FALLBACK_NUMBER;
  const lang = emp?.dialect === "english" ? "en-US" : "ar-XA";
  if (!to) {
    await notify(db, { orgId: ev.orgId, kind: "escalation", title: "Caller asked for a person — no transfer number set", body: "Add a transfer number in the AI employee's call settings.", link: "/dashboard/live" });
    return Response.json({ ok: false, error: "no_transfer_number", note: "No transfer number is configured. Take a message and tell the caller staff will call back." });
  }
  try {
    await redirectLiveCall(ev.callSid, to, lang === "ar-XA" ? "لحظة من فضلك، جاري تحويلك لأحد الزملاء." : "One moment, connecting you to a colleague.", lang);
  } catch (e) {
    reportError(e, { scope: "call-transfer" });
    return Response.json({ ok: false, error: "provider_error", note: "The transfer could not be completed. Take a message instead." }, { status: 502 });
  }
  await db.from("calls").update({ status: "transferred" }).eq("id", call.id).eq("organization_id", ev.orgId);
  await db.from("conversations").update({ status: "transferred", transferred_to: to, escalated_at: new Date().toISOString() }).eq("id", conv.id).eq("organization_id", ev.orgId);
  await audit({ orgId: ev.orgId, action: "call.transferred", targetType: "call", targetId: call.id, metadata: { to: to.slice(0, -4) + "****" } });
  return Response.json({ ok: true });
}
