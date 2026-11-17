/** API shapes shared between client and server. */
import type { AgentId } from "./agents";

export type Lang = "en" | "ar";

export interface PendingActionDTO {
  id: number;
  tool: string;
  summary: string;
  args: Record<string, unknown>;
  status: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
  createdAt: string;
}

export interface ChatResponse {
  conversationId: number;
  messageId: number;
  reply: string;
  lang: Lang;
  agent: AgentId;
  /** agents the Chief of Staff delegated to during this turn */
  delegations: AgentId[];
  /** tools that ran during this turn (already executed) */
  actions: { tool: string; summary: string }[];
  /** irreversible/external actions waiting for the user's approval */
  pending: PendingActionDTO[];
  provider: string;
}

export interface IntegrationStatusDTO {
  id: string;
  name: string;
  description: string;
  category: string;
  configured: boolean;
  connected: boolean;
  detail?: string;
  account?: string;
  requiredSecrets: string[];
  connectUrl?: string;
  canDisconnect?: boolean;
}

export interface BriefDTO {
  date: string;
  lang: Lang;
  text: string;
  data: {
    meetings: { title: string; start: string; end?: string; location?: string | null }[];
    urgentTasks: { id: number; title: string; priority: string; dueAt: string | null }[];
    followUps: { id: number; name: string; company: string | null; nextStep: string | null; followUpAt: string | null }[];
    numbers: { monthIncome: number; monthExpenses: number; net: number; pipelineValue: number; openTasks: number; unreadEmails: number; currency: string };
  };
  generatedAt: string;
}
