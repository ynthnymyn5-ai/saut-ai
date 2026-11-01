import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { fail, parseJson, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { asEmotion, resamplePcm16, speakable, voiceDirection } from "@/lib/assistant/core";

const schema = z.object({
  text: z.string().trim().min(1).max(2000),
  emotion: z.string().optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
});
const VOICE = () => process.env.ASSISTANT_VOICE || "coral"; // warm female voice; change to taste (alloy, ash, sage, …)

/**
 * Text → speech for the assistant face. Returns raw PCM16 mono at 16 kHz
 * (Content-Type audio/L16) — the exact format the photoreal face (Simli) lip-syncs to,
 * and what the built-in face plays and animates from. The emotion shapes the voice tone.
 */
export const POST = route("assistant-speak", async (req) => {
  await requireApiSession(ANY_MEMBER);
  const body = await parseJson(req, schema);
  const text = speakable(body.text);
  if (!text) return fail(422, "invalid_input", "Nothing to say");
  const { models } = await import("@/lib/ai/openai");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: models.tts(), voice: VOICE(), input: text, response_format: "pcm", instructions: voiceDirection(asEmotion(body.emotion), body.locale) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return fail(502, "provider_error", `Speech failed (${res.status})`);
  const pcm24 = new Uint8Array(await res.arrayBuffer()); // OpenAI "pcm" = 24 kHz, 16-bit, mono, little-endian
  const pcm16k = resamplePcm16(pcm24, 24000, 16000);
  const body = new ArrayBuffer(pcm16k.byteLength); // plain ArrayBuffer: a valid BodyInit for every TS/DOM lib version
  new Uint8Array(body).set(pcm16k);
  return new Response(body, {
    headers: { "Content-Type": "audio/L16; rate=16000; channels=1", "Cache-Control": "no-store" },
  });
}, { limit: 40 });
