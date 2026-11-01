import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { fail, parseJson, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { speakable } from "@/lib/assistant/core";
import { synthesize } from "@/lib/assistant/tts";

const schema = z.object({
  text: z.string().trim().min(1).max(2000),
  emotion: z.string().optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
});

/**
 * Text → speech for the assistant face. Returns raw PCM16 mono at 16 kHz
 * (Content-Type audio/L16) — the exact format the photoreal face (Simli) lip-syncs to,
 * and what the built-in face plays and animates from. ElevenLabs (Arabic + English
 * voices) when configured, otherwise OpenAI; the emotion shapes the delivery.
 */
export const POST = route("assistant-speak", async (req) => {
  await requireApiSession(ANY_MEMBER);
  const body = await parseJson(req, schema);
  const text = speakable(body.text);
  if (!text) return fail(422, "invalid_input", "Nothing to say");
  let result: Awaited<ReturnType<typeof synthesize>>;
  try {
    result = await synthesize(text, body.emotion, body.locale);
  } catch {
    return fail(502, "provider_error", "Speech is unavailable right now");
  }
  const out = new ArrayBuffer(result.pcm.byteLength); // plain ArrayBuffer: a valid BodyInit for every TS/DOM lib version
  new Uint8Array(out).set(result.pcm);
  return new Response(out, {
    headers: { "Content-Type": "audio/L16; rate=16000; channels=1", "Cache-Control": "no-store", "X-Voice-Provider": result.provider },
  });
}, { limit: 40 });
