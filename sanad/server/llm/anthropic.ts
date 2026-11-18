/**
 * Claude (Anthropic) implementation of LLMProvider.
 *
 *   - chat + tool calling: Claude Opus 5.5 (ANTHROPIC_MODEL), adaptive thinking
 *     (always on for this model), depth set with `output_config.effort`
 *   - refusals: server-side fallback (`fallbacks: "default"`) re-runs a
 *     declined request on a fallback model inside the same call
 *   - embeddings and voice: Anthropic has no embeddings or speech API, so these
 *     are delegated to OpenAI when OPENAI_API_KEY is set, otherwise to the
 *     offline fallbacks (hashed embeddings, browser speech)
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatRequest, ChatResult, LLMProvider } from "./types";
import { env } from "../env";

type Block = Anthropic.Beta.BetaContentBlockParam;
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class AnthropicProvider implements LLMProvider {
  readonly name = `anthropic:${env.ANTHROPIC_MODEL}`;
  readonly isReal = true;
  readonly supportsVoice: boolean;
  readonly embeddingId: string;
  private client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  /** `helper` serves embeddings + speech (OpenAI or the local fallback). */
  constructor(private helper: LLMProvider) {
    this.supportsVoice = helper.supportsVoice;
    this.embeddingId = helper.embeddingId;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const system = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content ?? "")
      .join("\n\n");
    const jsonNote = req.json ? "\n\nRespond with a single JSON object only — no prose, no code fences." : "";

    const tools: Anthropic.Beta.BetaTool[] | undefined = req.tools?.length
      ? req.tools.map((t, i, all) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
          // Tools render first and never change between calls: cache them.
          ...(i === all.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
        }))
      : undefined;

    const res = await this.client.beta.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: req.maxTokens ?? 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: (req.fast ? "low" : env.ANTHROPIC_EFFORT) as Effort },
      system: system + jsonNote || undefined,
      tools,
      messages: toAnthropicMessages(req.messages),
    });

    if (res.stop_reason === "refusal") {
      return { content: "I can't help with that request.", toolCalls: [] };
    }

    let text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (req.json) text = extractJson(text);

    const toolCalls = res.content
      .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> }));

    // Keep the raw blocks (thinking, fallback, tool_use) so the next request in
    // this tool loop sends them back unchanged, as the API expects.
    return { content: text || null, toolCalls, raw: res.content };
  }

  embed(texts: string[]) {
    return this.helper.embed(texts);
  }
  transcribe(audio: Buffer, filename: string, language?: string) {
    return this.helper.transcribe(audio, filename, language);
  }
  speak(text: string, lang: "en" | "ar") {
    return this.helper.speak(text, lang);
  }
}

/** Provider-neutral history → Anthropic messages (tool results grouped per turn). */
function toAnthropicMessages(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const block: Block = { type: "tool_result", tool_use_id: m.toolCallId!, content: m.content ?? "" };
      const last = out[out.length - 1];
      // All results for one assistant turn go in a single user message
      if (last?.role === "user" && Array.isArray(last.content) && last.content.every((b) => (b as Block).type === "tool_result")) {
        (last.content as Block[]).push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
      continue;
    }
    if (m.role === "assistant") {
      if (Array.isArray(m.raw)) {
        out.push({ role: "assistant", content: m.raw as Block[] });
        continue;
      }
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.args });
      if (blocks.length) out.push({ role: "assistant", content: blocks });
      continue;
    }
    out.push({ role: "user", content: m.content ?? "" });
  }
  return out;
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : "{}";
}
