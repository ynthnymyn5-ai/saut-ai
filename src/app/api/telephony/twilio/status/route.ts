import { summarizeConversation } from "@/lib/ai/openai";
import { providerStatus } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { supabaseService } from "@/lib/supabase/server";
import { setLiveStatus } from "@/lib/so/context";
import { emitEvent } from "@/lib/so/events";
import { checkUsageAlerts } from "@/lib/so/usage";
import { mapTwilioStatus, verifyTwilioRequest } from "@/lib/telephony/twilio";

export const runtime = "nodejs";

/** Call status + recording callbacks: updates call state, usage and the AI summary. */
export async function POST(req: Request) {
  const p = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  try {
    if (!verifyTwilioRequest(req, p)) return new Response("Invalid signature", { status: 403 });
  } catch {
    return new Response("Telephony not configured", { status: 503 });
  }
  const db = supabaseService();
  if (!db) return new Response("ok");

  try {
    if (p.RecordingUrl) {
      await db.from("calls").update({ recording_url: p.RecordingUrl }).eq("provider_call_sid", p.CallSid).eq("recording_consent", true);
      return new Response("ok");
    }
    const status = mapTwilioStatus(p.CallStatus);
    const duration = Number(p.CallDuration ?? 0);
    const { data: call } = await db.from("calls")
      .update({ status, duration_sec: duration, ended_at: ["completed", "busy", "no_answer", "failed", "canceled"].includes(status) ? new Date().toISOString() : null })
      .eq("provider_call_sid", p.CallSid)
      .select("organization_id, employee_id, conversation_id, branch_id, from_number")
      .maybeSingle();

    const ended = ["completed", "busy", "no_answer", "failed", "canceled"].includes(status);
    if (call && ended) {
      await setLiveStatus(db, call.employee_id, "online");
      if (status !== "completed" || duration === 0) {
        await emitEvent(call.organization_id, "missed_call", { phone: call.from_number, channel: "phone", conversation_id: call.conversation_id }, { branchId: call.branch_id });
      }
    }
    if (call && status === "completed") {
      await db.from("usage_records").insert({ organization_id: call.organization_id, employee_id: call.employee_id, metric: "voice_seconds", quantity: duration, period_start: new Date().toISOString().slice(0, 10) });
      if (call.conversation_id && providerStatus("openai").configured) {
        const { data: msgs } = await db.from("messages").select("role, content").eq("conversation_id", call.conversation_id).order("created_at");
        if (msgs?.length) {
          const s = await summarizeConversation(msgs.map((m) => `${m.role}: ${m.content}`).join("\n"));
          await db.from("conversations").update({ summary: s.summary, sentiment: s.sentiment, intent: s.intent, status: "completed", ended_at: new Date().toISOString() }).eq("id", call.conversation_id);
        }
      }
      await checkUsageAlerts(db, call.organization_id);
    }
  } catch (e) {
    reportError(e, { scope: "twilio-status" });
  }
  return new Response("ok");
}
