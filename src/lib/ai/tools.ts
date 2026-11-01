import "server-only";
import { engineDb } from "@/lib/so/context";
import { runTool } from "@/lib/so/engine";

export type ToolContext = { orgId: string; employeeId?: string; conversationId?: string; test: boolean };

/**
 * Backwards-compatible entry point (used by /api/internal/tool for the voice bridge).
 * Since the OS upgrade this delegates to the SO Tool Execution Engine, so every call is
 * permission-checked, confirmation-gated, retried and recorded in agent_executions.
 */
export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<{ ok: boolean; note: string; transfer?: boolean; pending?: boolean }> {
  const db = engineDb();
  const { data: agent } = ctx.employeeId
    ? await db.from("ai_employees").select("id, role, branch_id, name").eq("id", ctx.employeeId).eq("organization_id", ctx.orgId).maybeSingle()
    : { data: null };
  const r = await runTool(
    { db, orgId: ctx.orgId, agent: agent as never, actor: agent ? "agent" : "workflow", conversationId: ctx.conversationId, branchId: (agent?.branch_id as string | null) ?? null, channel: "phone", test: ctx.test },
    name,
    args,
  );
  return { ok: r.ok, note: r.note, transfer: r.transfer, pending: r.pending };
}
