import "server-only";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { notify, type ToolCtx } from "./context";
import { ALWAYS_CONFIRM, decide, HARD_DENY, resolveEffect, type Effect } from "./permissions";
import { withRetry } from "./retry";
import { ROLE_TEMPLATES } from "./templates";
import { toolByKey, type ToolResult } from "./tools";

const AUDITED = new Set(["book_appointment", "reschedule_appointment", "cancel_appointment", "send_whatsapp", "transfer_to_human", "update_lead_stage"]);

/** Tools an agent may call: explicit agent_tools rows, else its role template's default set. */
export async function agentToolKeys(ctx: ToolCtx): Promise<string[]> {
  if (!ctx.agent) return [];
  if (ctx.db && !ctx.test) {
    const { data } = await ctx.db.from("agent_tools").select("tool_key, enabled").eq("agent_id", ctx.agent.id);
    if (data?.length) return data.filter((t) => t.enabled).map((t) => t.tool_key as string);
  }
  return ctx.agent.role === "custom" ? ["lookup_customer", "search_knowledge", "transfer_to_human"] : [...ROLE_TEMPLATES[ctx.agent.role].tools, "remember_preference"];
}

async function effectFor(ctx: ToolCtx, permission: string): Promise<Effect> {
  const p = permission as Parameters<typeof resolveEffect>[1];
  if (ctx.actor === "human") return "allow"; // humans are authorized by their org role in the API layer
  if (ctx.actor === "workflow") return HARD_DENY.includes(p) ? "deny" : ALWAYS_CONFIRM.includes(p) ? "confirm" : "allow"; // owner-authored
  let overrides: Record<string, Effect> = {};
  if (ctx.db && ctx.agent && !ctx.test) {
    const { data } = await ctx.db.from("agent_permissions").select("permission, effect").eq("agent_id", ctx.agent.id);
    overrides = Object.fromEntries((data ?? []).map((r) => [r.permission, r.effect as Effect]));
  }
  return resolveEffect(ctx.agent?.role ?? "custom", p, overrides);
}

/**
 * Tool Execution Engine with Guardrails. Order: tool exists → assigned to agent → args valid →
 * permission effect → (deny | simulate | confirm | run with retries) → execution record → audit.
 */
export async function runTool(ctx: ToolCtx, key: string, rawArgs: unknown, opts: { taskId?: string } = {}): Promise<ToolResult & { executionId?: string }> {
  const tool = toolByKey(key);
  if (!tool) return { ok: false, note: `Unknown tool ${key}.` };
  if (ctx.actor === "agent" && !(await agentToolKeys(ctx)).includes(key)) return { ok: false, note: `Tool ${key} is not assigned to this AI employee.` };

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) return { ok: false, note: `Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };

  const decision = decide(await effectFor(ctx, tool.permission), !!tool.sensitive, ctx.test);
  const record = async (row: Record<string, unknown>) => {
    if (!ctx.db) return undefined;
    const { data } = await ctx.db.from("agent_executions").insert({
      organization_id: ctx.orgId, agent_id: ctx.agent?.id ?? null, task_id: opts.taskId ?? null, conversation_id: ctx.conversationId ?? null,
      tool_key: key, input: parsed.data, test_mode: ctx.test, ...row,
    }).select("id").single();
    return data?.id as string | undefined;
  };

  if (decision === "deny") {
    const id = await record({ status: "denied", error: `permission ${tool.permission} denied`, finished_at: new Date().toISOString() });
    await audit({ orgId: ctx.orgId, action: "agent.tool_denied", targetType: "ai_employee", targetId: ctx.agent?.id, metadata: { tool: key } });
    return { ok: false, executionId: id, note: `Not permitted (${tool.permission}). Do not attempt this; offer to transfer to staff.` };
  }
  if (decision === "simulate") {
    const id = await record({ status: "canceled", output: { simulated: true }, finished_at: new Date().toISOString() });
    return { ok: false, executionId: id, note: `TEST MODE: ${key} was NOT executed. Tell the tester nothing was booked or sent.` };
  }
  if (decision === "confirm") {
    const id = await record({ status: "pending_confirmation", requires_confirmation: true });
    if (ctx.db) await notify(ctx.db, { orgId: ctx.orgId, kind: "confirmation", title: `Approval needed: ${key.replace(/_/g, " ")}`, body: `${ctx.agent?.name ?? "Workflow"} wants to run ${key}.`, link: "/dashboard/command#approvals" });
    return { ok: false, pending: true, executionId: id, note: "This action needs staff confirmation. Tell the customer it is pending confirmation; do NOT say it is done." };
  }
  return execute(ctx, key, parsed.data, await record({ status: "running" }));
}

async function execute(ctx: ToolCtx, key: string, args: unknown, executionId?: string): Promise<ToolResult & { executionId?: string }> {
  const tool = toolByKey(key)!;
  const started = Date.now();
  try {
    if (!ctx.db) throw new Error("Database not configured");
    const { value, attempts } = await withRetry(() => tool.run({ ...ctx, db: ctx.db! }, args), { attempts: 3 });
    if (executionId) await ctx.db.from("agent_executions").update({ status: value.ok ? "succeeded" : "failed", output: value as never, attempts, error: value.ok ? null : value.note, finished_at: new Date().toISOString(), duration_ms: Date.now() - started }).eq("id", executionId);
    if (AUDITED.has(key) && value.ok) await audit({ orgId: ctx.orgId, actorId: ctx.userId ?? null, action: `tool.${key}`, targetType: ctx.agent ? "ai_employee" : "workflow", targetId: ctx.agent?.id, metadata: { executionId } });
    return { ...value, executionId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ctx.db && executionId) await ctx.db.from("agent_executions").update({ status: "failed", error: msg.slice(0, 1000), attempts: (e as { attemptsMade?: number }).attemptsMade ?? 1, finished_at: new Date().toISOString(), duration_ms: Date.now() - started }).eq("id", executionId);
    reportError(e, { scope: "tool", key });
    return { ok: false, executionId, note: `Action failed: ${msg}. Do not claim it succeeded.` };
  }
}

/** Human approval from the Command Center. Re-validates org ownership before running. */
export async function resolveConfirmation(db: NonNullable<ToolCtx["db"]>, orgId: string, executionId: string, userId: string, approve: boolean) {
  const { data: ex } = await db.from("agent_executions").select("id, tool_key, input, agent_id, conversation_id, status").eq("id", executionId).eq("organization_id", orgId).maybeSingle();
  if (!ex || ex.status !== "pending_confirmation") return { ok: false, note: "Nothing to confirm." };
  await db.from("agent_executions").update({ confirmed_by: userId, confirmed_at: new Date().toISOString(), status: approve ? "running" : "canceled", finished_at: approve ? null : new Date().toISOString() }).eq("id", executionId);
  await audit({ orgId, actorId: userId, action: approve ? "execution.approved" : "execution.rejected", targetType: "agent_execution", targetId: executionId });
  if (!approve) return { ok: true, note: "Rejected." };
  const { data: agent } = ex.agent_id ? await db.from("ai_employees").select("id, role, branch_id, name").eq("id", ex.agent_id).maybeSingle() : { data: null };
  return execute({ db, orgId, agent: agent as never, actor: "human", userId, conversationId: (ex.conversation_id as string) ?? undefined, branchId: (agent?.branch_id as string) ?? null, test: false }, ex.tool_key as string, ex.input, executionId);
}
