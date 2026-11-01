import { requireApiSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { reportError } from "@/lib/monitoring";

/**
 * Starts a photoreal face session (Simli, audio-to-video over WebRTC). The API key stays on
 * the server; the browser receives a short-lived session token only. Sessions are capped
 * (10 min, 2 min idle) so a forgotten tab can't run up costs. Without SIMLI_API_KEY and
 * SIMLI_FACE_ID the client shows the built-in face instead.
 */
export const POST = route("assistant-face", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  const apiKey = process.env.SIMLI_API_KEY, faceId = process.env.SIMLI_FACE_ID;
  if (!apiKey || !faceId) return fail(503, "provider_not_configured", "Photoreal face not configured", { variable: !apiKey ? "SIMLI_API_KEY" : "SIMLI_FACE_ID" });
  if (s.demo) return ok({ demo: true });
  const res = await fetch("https://api.simli.ai/compose/token", {
    method: "POST",
    headers: { "x-simli-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ faceId, handleSilence: true, maxSessionLength: 600, maxIdleTime: 120, audioInputFormat: "pcm16" }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { session_token?: string; detail?: unknown };
  if (!res.ok || !data.session_token) {
    reportError(new Error(`Simli token failed: ${res.status}`), { scope: "assistant-face", status: res.status });
    return fail(502, "provider_error", "The face service did not start a session.");
  }
  return ok({ session_token: data.session_token });
}, { limit: 6 });
