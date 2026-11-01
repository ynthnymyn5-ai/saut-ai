import "server-only";
import { serverEnv } from "@/lib/env";
import { asEmotion, elevenVoiceSettings, resamplePcm16, speechLanguage, voiceDirection } from "./core";

/**
 * Speech for the assistant: returns PCM16 mono 16 kHz (what the faces lip-sync to).
 *  1. ElevenLabs when ELEVENLABS_API_KEY is set — natural human voices; separate Arabic and
 *     English voices chosen by the language of each reply.
 *  2. OpenAI TTS otherwise, or if ElevenLabs fails (the assistant never goes silent).
 */
export async function synthesize(text: string, emotionRaw: string | undefined, locale: "ar" | "en"): Promise<{ pcm: Uint8Array; provider: "elevenlabs" | "openai" }> {
  const emotion = asEmotion(emotionRaw);
  const lang = speechLanguage(text, locale);
  if (process.env.ELEVENLABS_API_KEY) {
    try {
      return { pcm: await eleven(text, lang, emotion), provider: "elevenlabs" };
    } catch (e) {
      const { reportError } = await import("@/lib/monitoring");
      reportError(e, { scope: "tts", provider: "elevenlabs" });
    }
  }
  return { pcm: await openaiTts(text, lang, emotion), provider: "openai" };
}

// Fallback voices if none are configured: ElevenLabs' standard multilingual voices.
const DEFAULT_EN = "EXAVITQu4vr4xnSDxMaL"; // "Sarah"

export function elevenVoiceFor(lang: "ar" | "en") {
  const en = process.env.ELEVENLABS_VOICE_EN || DEFAULT_EN;
  return lang === "ar" ? process.env.ELEVENLABS_VOICE_AR || en : en;
}

async function eleven(text: string, lang: "ar" | "en", emotion: ReturnType<typeof asEmotion>) {
  const voice = elevenVoiceFor(lang);
  const model = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5"; // fast, 32 languages incl. Arabic
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=pcm_16000`, {
    method: "POST",
    headers: { "xi-api-key": serverEnv("ELEVENLABS_API_KEY"), "Content-Type": "application/json", Accept: "audio/pcm" },
    body: JSON.stringify({ text, model_id: model, language_code: lang, voice_settings: elevenVoiceSettings(emotion) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer()); // already PCM16 16 kHz mono
}

async function openaiTts(text: string, lang: "ar" | "en", emotion: ReturnType<typeof asEmotion>) {
  const { models } = await import("@/lib/ai/openai");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: models.tts(), voice: process.env.ASSISTANT_VOICE || "coral", input: text, response_format: "pcm", instructions: voiceDirection(emotion, lang) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`OpenAI speech failed (${res.status})`);
  return resamplePcm16(new Uint8Array(await res.arrayBuffer()), 24000, 16000); // OpenAI pcm = 24 kHz
}
