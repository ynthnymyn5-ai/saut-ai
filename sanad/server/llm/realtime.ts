/**
 * Live voice conversation (OpenAI Realtime over WebRTC).
 *
 * The browser connects to OpenAI directly with a short-lived client secret
 * minted here, so the API key never leaves the server. The realtime voice
 * model handles the conversation itself (turn-taking, interruptions), and
 * hands every request that touches the owner's data or needs an action to
 * Sanad's normal orchestrator through one tool, `ask_sanad`. That keeps all
 * agents, memory and the confirmation gate in one place.
 */
import OpenAI from "openai";
import { env } from "../env";
import { nowForPrompt } from "../lib/time";

export const realtimeAvailable = () => Boolean(env.OPENAI_API_KEY);

const INSTRUCTIONS = `You are Sanad (سند), the owner's AI Chief of Staff, speaking live by voice. You are male: in Arabic use masculine forms for yourself.
Reply in the language the owner speaks (Gulf Arabic or English). Keep spoken replies short and natural: one to three sentences, no lists read aloud, no URLs.
For anything about the owner's tasks, schedule, email, money, sales, content, notes or memory, and for any action, call ask_sanad with the owner's request in their own words, then say its answer naturally (summarise long answers).
Never say an action was done unless ask_sanad said so. If ask_sanad says something needs approval, tell the owner to approve it on screen.
Small talk and general questions you can answer yourself.`;

export async function createRealtimeSecret() {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const secret = await client.realtime.clientSecrets.create({
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: env.OPENAI_REALTIME_MODEL,
      instructions: `${INSTRUCTIONS}\n\nCurrent time: ${nowForPrompt()}`,
      audio: {
        input: { transcription: { model: "gpt-4o-mini-transcribe" }, turn_detection: { type: "semantic_vad" } },
        output: { voice: env.OPENAI_REALTIME_VOICE },
      },
      tools: [
        {
          type: "function",
          name: "ask_sanad",
          description: "Send the owner's request to Sanad's agents (tasks, calendar, email, finance, sales, marketing, notes, memory, actions). Returns the answer to speak.",
          parameters: {
            type: "object",
            properties: { request: { type: "string", description: "The owner's request, in their own words and language" } },
            required: ["request"],
          },
        },
      ],
    },
  });
  return { value: secret.value, expiresAt: secret.expires_at, model: env.OPENAI_REALTIME_MODEL };
}
