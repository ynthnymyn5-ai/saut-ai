import "server-only";
import OpenAI from "openai";
import { serverEnv } from "@/lib/env";

let client: OpenAI | null = null;

export function openai() {
  if (!client) client = new OpenAI({ apiKey: serverEnv("OPENAI_API_KEY") });
  return client;
}

export const models = {
  chat: () => process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  realtime: () => process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview",
  tts: () => process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  stt: () => process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe",
};

/**
 * Mints a short-lived client secret for a browser WebRTC realtime session.
 * The real API key never leaves the server.
 */
export async function createRealtimeSession(instructions: string, voice: string) {
  const res = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: models.realtime(),
      voice,
      instructions,
      input_audio_transcription: { model: models.stt() },
      turn_detection: { type: "server_vad" },
    }),
  });
  if (!res.ok) throw new Error(`Realtime session failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { client_secret: { value: string; expires_at: number }; model: string };
}

/** One-line summary + sentiment for a finished conversation. */
export async function summarizeConversation(transcript: string) {
  const r = await openai().chat.completions.create({
    model: models.chat(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: 'Summarise this customer conversation. Reply as JSON: {"summary": string (one sentence, same language as the customer), "sentiment": "positive"|"neutral"|"negative", "intent": string}' },
      { role: "user", content: transcript.slice(0, 20000) },
    ],
  });
  return JSON.parse(r.choices[0].message.content ?? "{}") as { summary?: string; sentiment?: string; intent?: string };
}
