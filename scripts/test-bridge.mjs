/**
 * Integration test for services/voice-bridge/server.mjs — runs the REAL bridge process
 * against local mocks of the app (/api/internal/*) and the OpenAI Realtime socket, then
 * drives it like Twilio does. No network, no keys.
 *
 *   NODE_PATH=<dir containing ws> node --test scripts/test-bridge.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(new URL("../services/voice-bridge/package.json", import.meta.url)); // ws from the bridge
const { WebSocketServer, WebSocket } = require("ws");
const SECRET = "test-secret-" + crypto.randomBytes(8).toString("hex");
const ORG = crypto.randomUUID(), EMP = crypto.randomUUID(), CONV = crypto.randomUUID();
const CALL_SID = "CA" + crypto.randomBytes(16).toString("hex");

function token(exp = 120) {
  const body = Buffer.from(JSON.stringify({ c: CONV, e: EMP, o: ORG, exp: Math.floor(Date.now() / 1000) + exp })).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const wait = (cond, ms = 4000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { if (cond()) { clearInterval(i); res(); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error("timeout")); } }, 20); });

async function setup() {
  const calls = [];
  const appSrv = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      const body = JSON.parse(b || "{}");
      calls.push({ path: req.url, auth: req.headers["x-internal-secret"] === SECRET, body });
      const send = (o) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      if (req.url === "/api/internal/session") return send({ ok: true, orgId: ORG, employeeId: EMP, conversationId: CONV, instructions: "Be nice", tools: [{ type: "function", name: "transfer_to_human", parameters: { type: "object" } }], voice: "alloy", speed: 1, language: "ar", maxDurationSec: 600 });
      if (req.url === "/api/internal/tool") return send({ ok: true, transfer: body.name === "transfer_to_human", note: "Escalated." });
      return send({ ok: true });
    });
  });
  const appPort = await listen(appSrv);

  const ai = { session: null, outputs: [], creates: 0, audioIn: 0 };
  const aiHttp = http.createServer();
  const aiWss = new WebSocketServer({ server: aiHttp });
  aiWss.on("connection", (ws, req) => {
    ai.auth = req.headers.authorization;
    ws.on("message", (raw) => {
      const ev = JSON.parse(raw.toString());
      if (ev.type === "session.update") ai.session = ev.session;
      if (ev.type === "response.create") {
        ai.creates++;
        ws.send(JSON.stringify({ type: "response.audio.delta", delta: "AAAA" }));
        ws.send(JSON.stringify({ type: "response.audio_transcript.done", transcript: ai.creates === 1 ? "أهلاً وسهلاً" : "لحظة، أحولك" }));
        ws.send(JSON.stringify({ type: "response.done" }));
      }
      if (ev.type === "input_audio_buffer.append" && ++ai.audioIn === 1) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.speech_started" }));
        ws.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "أبي أكلم موظف" }));
        ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "transfer_to_human", call_id: "c1", arguments: '{"reason":"caller asked"}' }));
      }
      if (ev.type === "conversation.item.create" && ev.item?.type === "function_call_output") ai.outputs.push(JSON.parse(ev.item.output));
    });
  });
  const aiPort = await listen(aiHttp);

  const bridgePort = 20000 + Math.floor(Math.random() * 20000);
  const bridge = spawn(process.execPath, [fileURLToPath(new URL("../services/voice-bridge/server.mjs", import.meta.url))], {
    env: { ...process.env, PORT: String(bridgePort), OPENAI_API_KEY: "sk-test", APP_URL: `http://127.0.0.1:${appPort}`, INTERNAL_API_SECRET: SECRET, OPENAI_REALTIME_URL: `ws://127.0.0.1:${aiPort}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = ""; bridge.stdout.on("data", (d) => (out += d)); bridge.stderr.on("data", (d) => (out += d));
  await wait(() => out.includes("listening"));
  const close = () => { bridge.kill(); appSrv.close(); aiWss.close(); aiHttp.close(); };
  return { calls, ai, bridgePort, close, out: () => out };
}

function twilioCall(port, tok) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/twilio`);
  const got = { media: 0, clear: 0, closed: false };
  ws.on("message", (raw) => { const m = JSON.parse(raw.toString()); if (m.event === "media") got.media++; if (m.event === "clear") got.clear++; });
  ws.on("close", () => (got.closed = true));
  ws.on("open", () => ws.send(JSON.stringify({ event: "start", start: { streamSid: "MZ1", callSid: CALL_SID, customParameters: { token: tok, conversationId: CONV, employeeId: EMP, from: "+96550000000" } } })));
  return { ws, got };
}

test("bridge: full call — session, greeting, transcripts, guarded tool, live transfer", async () => {
  const env = await setup();
  try {
    const { ws, got } = twilioCall(env.bridgePort, token());
    await wait(() => env.ai.session);
    assert.equal(env.ai.auth, "Bearer sk-test");
    assert.equal(env.ai.session.instructions, "Be nice");
    assert.equal(env.ai.session.type, "realtime");
    assert.equal(env.ai.session.audio.input.format.type, "audio/pcmu", "Twilio μ-law in");
    assert.equal(env.ai.session.audio.output.format.type, "audio/pcmu", "Twilio μ-law out");
    assert.equal(env.ai.session.tools[0].name, "transfer_to_human");
    await wait(() => got.media >= 1);                       // greeting audio reached the caller
    ws.send(JSON.stringify({ event: "media", media: { payload: "//8=" } }));
    await wait(() => env.calls.some((c) => c.path === "/api/internal/call-event" && c.body.kind === "transfer"));
    assert.ok(env.calls.every((c) => c.auth), "every app call carries the internal secret");
    const session = env.calls.find((c) => c.path === "/api/internal/session");
    assert.equal(session.body.from, "+96550000000");
    const tool = env.calls.find((c) => c.path === "/api/internal/tool");
    assert.deepEqual(tool.body.args, { reason: "caller asked" });
    assert.equal(tool.body.conversationId, CONV);
    assert.equal(env.ai.outputs[0].ok, true);
    const lines = env.calls.filter((c) => c.body.kind === "message").map((c) => `${c.body.role}:${c.body.content}`);
    assert.ok(lines.includes("customer:أبي أكلم موظف") && lines.includes("ai:أهلاً وسهلاً"), lines.join(" | "));
    const transfer = env.calls.find((c) => c.body.kind === "transfer");
    assert.equal(transfer.body.callSid, CALL_SID);
    // transfer happens only AFTER the AI's "transferring you" response finished
    assert.ok(env.ai.creates >= 2);
    assert.ok(got.clear >= 1, "barge-in clears caller audio");
    await wait(() => got.closed);                            // bridge hands the call back to Twilio's <Dial>
  } finally { env.close(); }
});

test("bridge: rejects a stream with a forged or expired token before opening OpenAI", async () => {
  const env = await setup();
  try {
    for (const tok of [token().replace(/.$/, (c) => (c === "A" ? "B" : "A")), token(-5), "garbage"]) {
      const { got } = twilioCall(env.bridgePort, tok);
      await wait(() => got.closed);
    }
    assert.equal(env.ai.session, null, "no OpenAI session for bad tokens");
    assert.equal(env.calls.length, 0, "no app calls for bad tokens");
  } finally { env.close(); }
});
