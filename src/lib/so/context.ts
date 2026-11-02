import "server-only";
import { supabaseService } from "@/lib/supabase/server";
import { ProviderNotConfiguredError } from "@/lib/env";
import type { AgentRole } from "./permissions";
import type { LiveStatus } from "./status";

export type DB = NonNullable<ReturnType<typeof supabaseService>>;

/**
 * The engine runs with the service role (it serves webhooks and calls with no user session),
 * so EVERY query in src/lib/so filters by organization_id explicitly. Callers that act for a
 * signed-in user must check that user's org/role before calling into the engine.
 */
export function engineDb(): DB {
  const db = supabaseService();
  if (!db) throw new ProviderNotConfiguredError("SUPABASE_SERVICE_ROLE_KEY");
  return db;
}

export interface AgentRecord {
  id: string;
  organization_id: string;
  branch_id: string | null;
  name: string;
  role: AgentRole;
  industry: string;
  dialect: string;
  voice: string;
  speaking_rate: number;
  status: string;
  safety_profile: string;
  business_info: Record<string, unknown>;
  call_settings: Record<string, unknown>;
  working_hours: Record<string, unknown>;
  personality?: Record<string, unknown> | null;
}

export interface ToolCtx {
  db: DB | null;               // null only in test/simulate runs without a database
  orgId: string;
  agent: Pick<AgentRecord, "id" | "role" | "branch_id" | "name"> | null;
  actor: "agent" | "workflow" | "human";
  userId?: string;             // human actor / confirmer
  conversationId?: string;
  customerId?: string;
  branchId?: string | null;
  channel?: string;
  test: boolean;
}

export async function setLiveStatus(db: DB | null, agentId: string | undefined | null, status: LiveStatus, detail?: string | null) {
  if (!db || !agentId) return;
  await db.from("ai_employees").update({ live_status: status, live_detail: detail ?? null, live_updated_at: new Date().toISOString() }).eq("id", agentId);
}

export async function notify(db: DB, n: { orgId: string; userId?: string | null; kind: string; title: string; body?: string; link?: string }) {
  await db.from("notifications").insert({ organization_id: n.orgId, user_id: n.userId ?? null, kind: n.kind, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000) ?? null, link: n.link ?? null });
  if (!n.userId) { const { emailAlert } = await import("@/lib/notify-email"); await emailAlert(db, n); } // business-wide alerts may also go by email
}

export const maskPhone = (p?: string | null) => (p ? p.replace(/\d(?=\d{4})/g, "•") : "");
