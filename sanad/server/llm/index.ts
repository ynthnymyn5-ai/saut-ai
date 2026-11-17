/**
 * THE single place that decides which LLM backs Sanad.
 *
 * To switch to Claude later: create server/llm/anthropic.ts implementing
 * LLMProvider (chat + embed; voice can stay on OpenAI or another vendor)
 * and return it here, e.g. `if (env.ANTHROPIC_API_KEY) return new AnthropicProvider()`.
 * Nothing else in the codebase imports a vendor SDK.
 */
import { env } from "../env";
import type { LLMProvider } from "./types";
import { OpenAIProvider } from "./openai";
import { LocalProvider } from "./local";

let instance: LLMProvider | null = null;

export function llm(): LLMProvider {
  if (!instance) instance = env.OPENAI_API_KEY ? new OpenAIProvider() : new LocalProvider();
  return instance;
}

export type { LLMProvider, ChatMessage, ToolSpec, ToolCall } from "./types";
