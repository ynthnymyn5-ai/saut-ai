/**
 * OpenAI implementation of LLMProvider:
 *   - GPT-4o for reasoning + tool calling
 *   - text-embedding-3-small for memory embeddings
 *   - Whisper for speech-to-text, gpt-4o-mini-tts for text-to-speech
 */
import OpenAI, { toFile } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ChatRequest, ChatResult, LLMProvider } from "./types";
import { env } from "../env";

export class OpenAIProvider implements LLMProvider {
  readonly name = `openai:${env.OPENAI_MODEL}`;
  readonly isReal = true;
  readonly supportsVoice = true;
  private client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  async chat(req: ChatRequest): Promise<ChatResult> {
    const messages: ChatCompletionMessageParam[] = req.messages.map((m) => {
      if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId!, content: m.content ?? "" };
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: JSON.stringify(c.args) },
          })),
        };
      }
      return { role: m.role as "system" | "user" | "assistant", content: m.content ?? "" };
    });

    const tools: ChatCompletionTool[] | undefined = req.tools?.length
      ? req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))
      : undefined;

    const res = await this.client.chat.completions.create({
      model: req.fast ? env.OPENAI_FAST_MODEL : env.OPENAI_MODEL,
      messages,
      tools,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens,
      response_format: req.json ? { type: "json_object" } : undefined,
    });

    const msg = res.choices[0]?.message;
    return {
      content: msg?.content ?? null,
      toolCalls: (msg?.tool_calls ?? [])
        .filter((c) => c.type === "function")
        .map((c) => {
          const fn = (c as { function: { name: string; arguments: string } }).function;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(fn.arguments || "{}");
          } catch {
            /* model produced invalid JSON — pass empty args, tool will validate */
          }
          return { id: c.id, name: fn.name, args };
        }),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const res = await this.client.embeddings.create({ model: env.OPENAI_EMBED_MODEL, input: texts });
    return res.data.map((d) => d.embedding);
  }

  async transcribe(audio: Buffer, filename: string, language?: string) {
    const file = await toFile(audio, filename);
    const res = await this.client.audio.transcriptions.create({
      file,
      model: env.OPENAI_STT_MODEL,
      language: language || undefined,
      response_format: "verbose_json",
    });
    const r = res as unknown as { text: string; language?: string };
    // Whisper returns full language names ("arabic"), normalise to ISO codes
    const lang = r.language?.toLowerCase().startsWith("ar") ? "ar" : r.language ? "en" : undefined;
    return { text: r.text, language: lang };
  }

  async speak(text: string, lang: "en" | "ar"): Promise<Buffer> {
    const res = await this.client.audio.speech.create({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE as "shimmer",
      input: text.slice(0, 4000),
      response_format: "mp3",
      ...(env.OPENAI_TTS_MODEL.includes("gpt-4o")
        ? {
            instructions:
              lang === "ar"
                ? "Speak warm, calm Modern Standard Arabic with a light Gulf accent, like a trusted executive assistant."
                : "Speak warmly and confidently, like a calm, capable executive assistant.",
          }
        : {}),
    });
    return Buffer.from(await res.arrayBuffer());
  }
}
