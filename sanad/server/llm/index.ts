/**
 * THE single place that decides which LLM backs Sanad.
 *
 *   LLM_PROVIDER=anthropic | openai | local   (optional override)
 *   default: Claude when ANTHROPIC_API_KEY is set, else OpenAI when
 *   OPENAI_API_KEY is set, else the offline fallback.
 *
 * Claude has no embeddings or speech API, so the Anthropic provider borrows
 * them from OpenAI (when its key is set) or from the offline fallback.
 * Nothing else in the codebase imports a vendor SDK.
 */
import { env } from "../env";
import type { LLMProvider } from "./types";
import { OpenAIProvider } from "./openai";
import { LocalProvider } from "./local";
import { AnthropicProvider } from "./anthropic";

let instance: LLMProvider | null = null;

function pick(): LLMProvider {
  const helper = () => (env.OPENAI_API_KEY ? new OpenAIProvider() : new LocalProvider());
  const choice = env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : "local");
  if (choice === "anthropic" && env.ANTHROPIC_API_KEY) return new AnthropicProvider(helper());
  if (choice === "openai" && env.OPENAI_API_KEY) return new OpenAIProvider();
  if (choice !== "local" && (env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY)) {
    return env.ANTHROPIC_API_KEY ? new AnthropicProvider(helper()) : new OpenAIProvider();
  }
  return new LocalProvider();
}

export function llm(): LLMProvider {
  if (!instance) instance = pick();
  return instance;
}

export type { LLMProvider, ChatMessage, ToolSpec, ToolCall } from "./types";
