/**
 * SAUT AI — realtime voice bridge
 * Twilio Media Stream (μ-law 8 kHz) ⇄ OpenAI Realtime API (speech-to-speech).
 *
 * Runs as a small long-lived Node service (Fly.io, Railway, Render, a VM) because
 * serverless platforms can't hold WebSockets open for the length of a call.
 *
 *   npm install            (in this folder)
 *   PORT=8080 OPENAI_API_KEY=… APP_URL=https://app.example.com INTERNAL_API_SECRET=… npm start
 *
 * Then set VOICE_BRIDGE_WSS_URL=wss://<this-host>/twilio in the main app.
 *
 * Security: the bridge holds NO database key. Each stream must carry a signed, 2-minute
 * token minted by the app's incoming-call webhook; it is verified here before any paid
 * OpenAI session opens. Prompt, tools, transcripts, tool execution and live transfers all
 * go through the app's /api/internal/* endpoints, which scope everything to the org.
 */
import crypto from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const { OPENAI_API_KEY, APP_URL, INTERNAL_API_SECRET } = process.env;
const MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview";
const STT_MODEL = process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe";
const REALTIME_URL = process.env.OPENAI_REALTIME_URL || "wss://api.openai.com/v1/realtime"; // override only for tests
for (const [k, v] of Object.entries({ OPENAI_API_KEY, APP_URL, INTERNAL_API_SECRET })) {
  if (!v) { console.error(`Missing ${k}`); process.exit(1); }
}

const log = (level, msg, extra = {}) => console[level === "error" ? "error" : "log"](JSON.stringify({ level, msg, ...extra, at: new Date().toISOString() }));

/** Same algorithm as src/lib/so/stream-token.ts (keep in sync). */
export function verifyStreamToken(secret, token, now = Date.now()) {
  if (!secret || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(crypto.createHmac("sha256", secret).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof c.exp !== "number" || c.exp * 1000 < now) return null;
    return [c.c, c.e, c.o].every((v) => typeof v === "string" && v) ? c : null;
  } catch { return null; }
}

async function app(path, body) {
  const r = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_API_SECRET },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({ ok: false }));
  return { status: r.status, ...data };
}

let active = 0;
const server = createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, activeCalls: active })); return; }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, path: "/twilio", maxPayload: 1 << 20 });

wss.on("connection", (twilio) => {
  let streamSid = null, callSid = null, session = null, ai = null;
  let speaking = false, firstSent = false, pendingTransfer = false, transferring = false, closed = false;
  let timer = null;
  active++;

  const status = (st, extra = {}) => session && app("/api/internal/status", { orgId: session.orgId, employeeId: session.employeeId, conversationId: session.conversationId, status: st, ...extra }).catch(() => {});
  const transcript = (role, content) => session && content?.trim() && app("/api/internal/call-event", { kind: "message", orgId: session.orgId, employeeId: session.employeeId, conversationId: session.conversationId, role, content: content.slice(0, 10000) }).catch(() => {});
  const end = (why) => {
    if (closed) return; closed = true; active--;
    clearTimeout(timer);
    log("info", "call ended", { callSid, why });
    try { ai?.close(); } catch {}
    try { twilio.close(); } catch {}
  };
  const say = (text) => { // ask the model to speak a system-directed line
    if (ai?.readyState !== WebSocket.OPEN) return;
    ai.send(JSON.stringify({ type: "conversation.item.create", item: { type: "message", role: "system", content: [{ type: "input_text", text }] } }));
    ai.send(JSON.stringify({ type: "response.create" }));
  };

  async function doTransfer() {
    if (transferring) return; transferring = true;
    const r = await app("/api/internal/call-event", { kind: "transfer", orgId: session.orgId, employeeId: session.employeeId, conversationId: session.conversationId, callSid }).catch(() => ({ ok: false }));
    if (r.ok) { log("info", "transferred", { callSid }); return end("transferred"); } // Twilio now runs the <Dial>
    transferring = false;
    say(`The transfer did not go through (${r.note || "unavailable"}). Apologise, offer to take a message, and confirm the caller's name and number.`);
  }

  twilio.on("message", async (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      callSid = msg.start.callSid;
      const p = msg.start.customParameters || {};
      if (!verifyStreamToken(INTERNAL_API_SECRET, p.token)) { log("error", "rejected stream: bad token", { callSid }); return end("bad_token"); }
      const s = await app("/api/internal/session", { token: p.token, from: p.from || undefined }).catch((e) => ({ ok: false, error: String(e) }));
      if (!s.ok) { log("error", "session failed", { callSid, error: s.error }); return end("session_failed"); }
      session = s;

      ai = new WebSocket(`${REALTIME_URL}?model=${encodeURIComponent(MODEL)}`, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "OpenAI-Beta": "realtime=v1" } });
      ai.on("open", () => {
        ai.send(JSON.stringify({ type: "session.update", session: {
          instructions: s.instructions, voice: s.voice, speed: s.speed,
          input_audio_format: "g711_ulaw", output_audio_format: "g711_ulaw",
          input_audio_transcription: { model: STT_MODEL, language: s.language },
          turn_detection: { type: "server_vad", silence_duration_ms: 600 },
          tools: s.tools, tool_choice: "auto",
        } }));
        ai.send(JSON.stringify({ type: "response.create" })); // greet the caller
        status("speaking", { detail: "Greeting caller" });
        timer = setTimeout(() => {
          say("The maximum call length has been reached. Thank the caller warmly, say goodbye and end politely.");
          setTimeout(() => end("max_duration"), 12000);
        }, Math.max(60, s.maxDurationSec) * 1000);
      });
      ai.on("message", async (data) => {
        let ev; try { ev = JSON.parse(data.toString()); } catch { return; }
        switch (ev.type) {
          case "input_audio_buffer.speech_started":
            twilio.send(JSON.stringify({ event: "clear", streamSid })); // barge-in: stop our audio
            status("listening"); break;
          case "input_audio_buffer.speech_stopped":
            status("thinking"); break;
          case "response.audio.delta":
          case "response.output_audio.delta":
            if (!speaking) { speaking = true; status("speaking"); }
            twilio.send(JSON.stringify({ event: "media", streamSid, media: { payload: ev.delta } })); break;
          case "response.done":
            speaking = false;
            if (pendingTransfer) { pendingTransfer = false; await doTransfer(); }
            else status("waiting");
            break;
          case "conversation.item.input_audio_transcription.completed":
            transcript("customer", ev.transcript);
            if (!firstSent && ev.transcript?.trim()) { firstSent = true; status("thinking", { firstUtterance: ev.transcript.slice(0, 2000), phone: (msg.start.customParameters?.from || "").slice(0, 20) || undefined }); }
            break;
          case "response.audio_transcript.done":
          case "response.output_audio_transcript.done":
            transcript("ai", ev.transcript); break;
          case "response.function_call_arguments.done": {
            let args = {}; try { args = JSON.parse(ev.arguments || "{}"); } catch {}
            const r = await app("/api/internal/tool", { orgId: session.orgId, employeeId: session.employeeId, conversationId: session.conversationId, name: ev.name, args })
              .catch(() => ({ ok: false, note: "Tool service unavailable. Apologise and offer to take a message." }));
            ai.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify({ ok: r.ok, pending: !!r.pending, note: r.note }) } }));
            if (r.transfer) pendingTransfer = true; // let the AI say "transferring you" first, then redirect
            ai.send(JSON.stringify({ type: "response.create" }));
            break;
          }
          case "error":
            log("error", "openai error", { callSid, error: ev.error?.message }); break;
        }
      });
      ai.on("close", () => { if (!transferring) end("ai_closed"); });
      ai.on("error", (e) => { log("error", "openai socket", { callSid, error: e.message }); end("ai_error"); });
    }
    if (msg.event === "media" && ai?.readyState === WebSocket.OPEN) ai.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.media.payload }));
    if (msg.event === "stop") end("caller_hung_up");
  });
  twilio.on("close", () => end("twilio_closed"));
  twilio.on("error", () => end("twilio_error"));
});

const port = Number(process.env.PORT || 8080);
if (process.env.NODE_ENV !== "test") server.listen(port, () => log("info", "voice bridge listening", { port }));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { log("info", "shutting down", { active }); wss.clients.forEach((c) => c.close()); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000); });
