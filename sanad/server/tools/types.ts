/**
 * Tool framework. A tool is a typed action an agent can take. Tools flagged
 * `confirm` never run directly: the executor stores a pending action and the
 * owner must approve it (web modal, or "yes" on Telegram/WhatsApp).
 */
import type { z } from "zod";
import type { AgentId } from "@shared/agents";
import type { Lang } from "@shared/types";

export interface ToolContext {
  agentId: AgentId;
  lang: Lang;
  channel: "web" | "telegram" | "whatsapp" | "system";
  conversationId?: number;
}

/** Every tool returns data plus a short human sentence (`say`) the model/offline mode can relay. */
export type ToolOutput = { say: string; [k: string]: unknown };

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** agents that get this tool; the Chief of Staff reaches others by delegation */
  agents: AgentId[];
  /** true (or a predicate) when the action sends, deletes, pays or publishes */
  confirm?: boolean | ((args: z.infer<S>) => boolean);
  /** writes to the activity log when it runs (default: true when it changes data) */
  mutates?: boolean;
  /** one-line human description used in confirmation modals and the activity log */
  summarize: (args: z.infer<S>, lang: Lang) => string;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<ToolOutput>;
}

/** Helper preserving the generic so `run` receives typed args. */
export const defineTool = <S extends z.ZodType>(t: ToolDef<S>): ToolDef<S> => t;

export const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);
