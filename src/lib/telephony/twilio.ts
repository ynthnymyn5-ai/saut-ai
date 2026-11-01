import "server-only";
import twilio from "twilio";
import { publicEnv, serverEnv } from "@/lib/env";

export function twilioClient() {
  return twilio(serverEnv("TWILIO_ACCOUNT_SID"), serverEnv("TWILIO_AUTH_TOKEN"));
}

/** Verifies the X-Twilio-Signature header. Rejects every unsigned/forged webhook. */
export function verifyTwilioRequest(req: Request, params: Record<string, string>) {
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${publicEnv.appUrl}${new URL(req.url).pathname}`;
  return twilio.validateRequest(serverEnv("TWILIO_AUTH_TOKEN"), signature, url, params);
}

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

/**
 * TwiML for an incoming call: optional recording-consent notice, then bridge the audio
 * to our realtime voice service over a Media Stream (wss). Twilio does not forward query
 * strings on Stream URLs, so call data travels as <Parameter>s, including a short-lived
 * signed token the bridge verifies before it opens an OpenAI session.
 */
export function incomingCallTwiml(opts: {
  streamUrl: string;
  employeeId: string;
  conversationId: string;
  token: string;            // signed stream token (src/lib/so/stream-token.ts)
  from?: string;
  consentMessage?: string | null;
  language: "ar-XA" | "en-US";
  record: boolean;
}) {
  const consent = opts.consentMessage ? `<Say language="${opts.language}">${escapeXml(opts.consentMessage)}</Say>` : "";
  const record = opts.record ? `<Start><Recording recordingStatusCallback="${publicEnv.appUrl}/api/telephony/twilio/status" /></Start>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${consent}${record}
  <Connect>
    <Stream url="${escapeXml(opts.streamUrl)}">
      <Parameter name="employeeId" value="${escapeXml(opts.employeeId)}" />
      <Parameter name="conversationId" value="${escapeXml(opts.conversationId)}" />
      <Parameter name="token" value="${escapeXml(opts.token)}" />
      <Parameter name="from" value="${escapeXml(opts.from ?? "")}" />
    </Stream>
  </Connect>
</Response>`;
}

export function transferTwiml(number: string, message: string, language: "ar-XA" | "en-US") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="${language}">${escapeXml(message)}</Say><Dial>${escapeXml(number)}</Dial></Response>`;
}

export function unavailableTwiml(language: "ar-XA" | "en-US") {
  const msg = language === "ar-XA" ? "عذراً، الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً." : "Sorry, this line is not available right now. Please try again later.";
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="${language}">${msg}</Say><Hangup/></Response>`;
}

export const mapTwilioStatus = (s: string) =>
  (({ queued: "queued", ringing: "ringing", "in-progress": "in_progress", completed: "completed", busy: "busy", "no-answer": "no_answer", failed: "failed", canceled: "canceled" }) as Record<string, string>)[s] ?? "failed";

/** Redirects a LIVE call to a human (used when the AI calls transfer_to_human mid-call). */
export async function redirectLiveCall(callSid: string, number: string, message: string, language: "ar-XA" | "en-US") {
  await twilioClient().calls(callSid).update({ twiml: transferTwiml(number, message, language) });
}
