import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { supabaseService } from "@/lib/supabase/server";
import { maskPhone, setLiveStatus } from "@/lib/so/context";
import { emitEvent } from "@/lib/so/events";
import { signStreamToken } from "@/lib/so/stream-token";
import { incomingCallTwiml, transferTwiml, unavailableTwiml, verifyTwilioRequest } from "@/lib/telephony/twilio";

export const runtime = "nodejs";
const xml = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/xml" } });

/**
 * Incoming-call webhook. Routes the call to the AI employee that owns the dialled number:
 *  - inactive employee / suspended org / no plan → polite unavailable message
 *  - outside working hours with "transfer" policy → human fallback
 *  - otherwise → consent notice (if recording) + media stream to the realtime voice bridge
 */
export async function POST(req: Request) {
  const params = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  try {
    if (!verifyTwilioRequest(req, params)) return new Response("Invalid signature", { status: 403 });
  } catch {
    return new Response("Telephony not configured", { status: 503 });
  }
  const db = supabaseService();
  if (!db) return xml(unavailableTwiml("ar-XA"));

  try {
    const { data: emp } = await db
      .from("ai_employees")
      .select("id, organization_id, branch_id, status, dialect, call_settings, organizations(status, recording_enabled, recording_consent_msg, retention_days)")
      .eq("phone_number", params.To)
      .maybeSingle();
    const org = emp?.organizations as unknown as { status: string; recording_enabled: boolean; recording_consent_msg: string | null; retention_days: number } | null;
    const lang = emp?.dialect === "english" ? "en-US" : "ar-XA";
    if (!emp || emp.status !== "active" || org?.status !== "active") return xml(unavailableTwiml(lang));

    const { data: sub } = await db.from("subscriptions").select("id").eq("organization_id", emp.organization_id).in("status", ["trialing", "active", "past_due"]).maybeSingle();
    if (!sub) return xml(unavailableTwiml(lang));

    const { data: conv } = await db.from("conversations").insert({
      organization_id: emp.organization_id, employee_id: emp.id, branch_id: emp.branch_id, channel: "phone",
      expires_at: new Date(Date.now() + (org.retention_days ?? 90) * 86400000).toISOString(),
    }).select("id").single();
    await db.from("calls").upsert({
      organization_id: emp.organization_id, employee_id: emp.id, branch_id: emp.branch_id, conversation_id: conv?.id, provider_call_sid: params.CallSid,
      from_number: params.From, to_number: params.To, status: "in_progress", recording_consent: !!org.recording_enabled,
    }, { onConflict: "provider_call_sid" });

    await db.from("usage_records").insert({ organization_id: emp.organization_id, employee_id: emp.id, metric: "conversations", quantity: 1, period_start: new Date().toISOString().slice(0, 10) });
    await setLiveStatus(db, emp.id, "listening", `Call from ${maskPhone(params.From)}`);
    const bridge = process.env.VOICE_BRIDGE_WSS_URL;
    // With the bridge, call_received fires after the caller's first sentence (so workflows see the intent);
    // without it, fire now so missed-intent workflows (e.g. notify owner) still run.
    if (!bridge) await emitEvent(emp.organization_id, "call_received", { conversation_id: conv?.id, phone: params.From, channel: "phone" }, { branchId: emp.branch_id });
    const cs = emp.call_settings as { transfer_number?: string | null };
    if (!bridge) {
      // No realtime bridge deployed — be honest and route to a human if possible.
      const fallback = cs.transfer_number || process.env.TWILIO_HUMAN_FALLBACK_NUMBER;
      return xml(fallback ? transferTwiml(fallback, lang === "ar-XA" ? "لحظة من فضلك، جاري تحويلك." : "One moment, connecting you.", lang) : unavailableTwiml(lang));
    }
    const secret = process.env.INTERNAL_API_SECRET;
    if (!conv?.id || !secret) {
      reportError(new Error(!secret ? "INTERNAL_API_SECRET missing: cannot authorise voice bridge" : "conversation insert failed"), { scope: "twilio-voice" });
      const fallback = cs.transfer_number || process.env.TWILIO_HUMAN_FALLBACK_NUMBER;
      return xml(fallback ? transferTwiml(fallback, lang === "ar-XA" ? "لحظة من فضلك، جاري تحويلك." : "One moment, connecting you.", lang) : unavailableTwiml(lang));
    }
    const token = signStreamToken(secret, { c: conv.id, e: emp.id, o: emp.organization_id }, 120);
    return xml(incomingCallTwiml({
      streamUrl: bridge, employeeId: emp.id, conversationId: conv.id, token, from: params.From, language: lang,
      record: !!org.recording_enabled, consentMessage: org.recording_enabled ? org.recording_consent_msg : null,
    }));
  } catch (e) {
    reportError(e, { scope: "twilio-voice" });
    await audit({ action: "call.routing_failed", metadata: { sid: params.CallSid } });
    return xml(unavailableTwiml("ar-XA"));
  }
}
