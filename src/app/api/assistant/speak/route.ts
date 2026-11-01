import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { fail, parseJson, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { speakable } from "@/lib/assistant/core";
import { synthesize } from "@/lib/assistant/tts";
import { resolveVoice, VOICE_ID, type VoicePair } from "@/lib/assistant/voices";
import { supabaseServer } from "@/lib/supabase/server";

const schema = z.object({
  text: z.string().trim().min(1).max(2000),
  emotion: z.string().optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
  employeeId: z.string().uuid().optional(),     // speak as this AI employee (its chosen voices)
  voiceId: z.string().regex(VOICE_ID).optional(), // preview a specific voice from the picker
});

/**
 * Text → speech. Returns raw PCM16 mono at 16 kHz (audio/L16) — what the faces lip-sync to.
 * Voice: explicit preview → employee's choice → business default → server env → OpenAI.
 * Voice choices are read with the user's own session, so RLS keeps them to their org.
 */
export const POST = route("assistant-speak", async (req) => {
  const s = await requireApiSession(ANY_MEMBER);
  const body = await parseJson(req, schema);
  const text = speakable(body.text);
  if (!text) return fail(422, "invalid_input", "Nothing to say");

  const layers: (VoicePair | null)[] = [];
  const sb = s.demo ? null : await supabaseServer();
  if (sb) {
    if (body.employeeId) {
      const { data } = await sb.from("ai_employees").select("call_settings").eq("id", body.employeeId).eq("organization_id", s.org.id).maybeSingle();
      layers.push((data?.call_settings as VoicePair | null) ?? null);
    }
    const { data: org, error } = await sb.from("organizations").select("voice_settings").eq("id", s.org.id).maybeSingle();
    if (!error) layers.push((org?.voice_settings as VoicePair | null) ?? null); // column absent before migration 0010 → ignore
  }
  const pick = (lang: "ar" | "en") => body.voiceId ?? resolveVoice(lang, layers);

  let result: Awaited<ReturnType<typeof synthesize>>;
  try {
    result = await synthesize(text, body.emotion, body.locale, pick);
  } catch {
    return fail(502, "provider_error", "Speech is unavailable right now");
  }
  const out = new ArrayBuffer(result.pcm.byteLength); // plain ArrayBuffer: a valid BodyInit for every TS/DOM lib version
  new Uint8Array(out).set(result.pcm);
  return new Response(out, {
    headers: { "Content-Type": "audio/L16; rate=16000; channels=1", "Cache-Control": "no-store", "X-Voice-Provider": result.provider },
  });
}, { limit: 40 });
