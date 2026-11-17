/**
 * Provider-neutral LLM types. Everything in Mira talks to the model through
 * the `LLMProvider` interface, so swapping OpenAI for Claude (or anything
 * else) means writing one new file that implements it — see server/llm/index.ts.
 */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  /** assistant messages that requested tools */
  toolCalls?: ToolCall[];
  /** tool result messages reference the call they answer */
  toolCallId?: string;
}

/** JSON-schema tool definition (the common denominator of OpenAI/Anthropic). */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  /** ask for a JSON object response (no tools) */
  json?: boolean;
  /** use the cheaper/faster model (classification, extraction) */
  fast?: boolean;
  maxTokens?: number;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface LLMProvider {
  /** shown in the UI/activity log, e.g. "openai:gpt-4o" or "local" */
  readonly name: string;
  /** true when backed by a real model (false for the offline fallback) */
  readonly isReal: boolean;
  readonly supportsVoice: boolean;
  chat(req: ChatRequest): Promise<ChatResult>;
  embed(texts: string[]): Promise<number[][]>;
  transcribe(audio: Buffer, filename: string, language?: string): Promise<{ text: string; language?: string }>;
  /** returns MP3 audio */
  speak(text: string, lang: "en" | "ar"): Promise<Buffer>;
}
