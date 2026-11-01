import "server-only";
import OpenAI from "openai";
import { ProviderRequestError, serverEnv } from "@/lib/env";

let client: OpenAI | null = null;

export function openai() {
  if (!client) client = new OpenAI({ apiKey: serverEnv("OPENAI_API_KEY") });
  return client;
}

export const models = {
  chat: () => process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  realtime: () => process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
  tts: () => process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  stt: () => process.env.OPENAI_STT_MODEL || "gpt-4o-transcribe",
};

/**
 * Mints a short-lived client secret for a browser WebRTC realtime session (GA API:
 * POST /v1/realtime/client_secrets — the beta /v1/realtime/sessions endpoint was retired).
 * The real API key never leaves the server.
 */
export async function createRealtimeSession(instructions: string, voice: string) {
  const model = models.realtime();
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 600 },
      session: {
        type: "realtime",
        model,
        instructions,
        audio: {
          input: { transcription: { model: models.stt() }, turn_detection: { type: "server_vad" } },
          output: { voice },
        },
      },
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new ProviderRequestError("OpenAI", res.status, j.error?.message ?? `Realtime session failed (${res.status})`);
  }
  const j = (await res.json()) as { value: string; expires_at: number; session?: { model?: string } };
  return { client_secret: { value: j.value, expires_at: j.expires_at }, model: j.session?.model ?? model };
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
