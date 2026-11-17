/**
 * Tool registry + executor.
 *
 * `invokeTool` is the only way an agent's tool call is executed. It validates
 * arguments, and for tools that send/delete/pay/publish it does NOT run them:
 * it records a pending action that the owner must approve. `executePending`
 * runs an approved action. Everything is written to the activity log.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { AgentId } from "@shared/agents";
import type { Lang, PendingActionDTO } from "@shared/types";
import type { ToolSpec } from "../llm/types";
import type { ToolContext, ToolDef, ToolOutput } from "./types";
import { operationsTools } from "./operations";
import { salesTools } from "./sales";
import { financeTools } from "./finance";
import { contentTools } from "./content";
import { memoryTools } from "../memory/service";
import { getDailyBriefTool } from "../brief/dailyBrief";
import { businessTools } from "./business";
import { integrations } from "../integrations/registry";
import { logActivity } from "../lib/activity";

export const allTools: ToolDef[] = [
  ...operationsTools,
  ...salesTools,
  ...financeTools,
  ...contentTools,
  ...memoryTools,
  getDailyBriefTool,
  ...businessTools,
  ...integrations.flatMap((i) => i.tools),
] as ToolDef[];

const byName = new Map(allTools.map((t) => [t.name, t]));
export const getTool = (name: string) => byName.get(name);

export function toolsForAgent(agentId: AgentId): ToolDef[] {
  return allTools.filter((t) => t.agents.includes(agentId));
}

/** JSON-schema spec handed to the LLM. */
export function toSpec(t: ToolDef): ToolSpec {
  const params = z.toJSONSchema(t.schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete params.$schema;
  const confirmNote = t.confirm ? " [Requires the owner's confirmation — calling it queues an approval request instead of acting immediately.]" : "";
  return { name: t.name, description: t.description + confirmNote, parameters: params };
}

export function toDTO(p: typeof schema.pendingActions.$inferSelect): PendingActionDTO {
  return { id: p.id, tool: p.tool, summary: p.summary, args: p.args as Record<string, unknown>, status: p.status as PendingActionDTO["status"], createdAt: p.createdAt.toISOString() };
}

export interface InvokeResult {
  output: ToolOutput;
  pending?: PendingActionDTO;
  /** approvals a tool queued itself (e.g. one email per overdue lead) */
  extraPending?: PendingActionDTO[];
  executed?: { tool: string; summary: string };
}

export async function invokeTool(name: string, rawArgs: Record<string, unknown>, ctx: ToolContext): Promise<InvokeResult> {
  const tool = getTool(name);
  if (!tool) return { output: { say: `Unknown tool ${name}`, error: true } };
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    return { output: { say: `Invalid arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, error: true } };
  }
  const args = parsed.data;
  const summary = tool.summarize(args, ctx.lang);
  const needsConfirm = typeof tool.confirm === "function" ? tool.confirm(args) : Boolean(tool.confirm);

  if (needsConfirm) {
    const [p] = await db
      .insert(schema.pendingActions)
      .values({ tool: name, args: args as object, summary, agentId: ctx.agentId, conversationId: ctx.conversationId ?? null, channel: ctx.channel })
      .returning();
    await logActivity({ action: name, agentId: ctx.agentId, summary: `Awaiting approval: ${summary}`, status: "pending", details: { pendingActionId: p.id } });
    return {
      pending: toDTO(p),
      output: {
        status: "awaiting_confirmation",
        pendingActionId: p.id,
        say: ctx.lang === "ar" ? `هذا الإجراء يحتاج موافقتك: ${summary}` : `This needs your approval: ${summary}`,
        instruction: "Do NOT claim this was done. Tell the owner it is waiting for their confirmation.",
      },
    };
  }

  try {
    const output = await tool.run(args, ctx);
    if (tool.mutates) await logActivity({ action: name, agentId: ctx.agentId, summary, details: { args } });
    const extraPending = Array.isArray(output.pendingActions) ? (output.pendingActions as PendingActionDTO[]) : undefined;
    return { output, executed: tool.mutates ? { tool: name, summary } : undefined, extraPending };
  } catch (e) {
    const msg = (e as Error).message;
    await logActivity({ action: name, agentId: ctx.agentId, summary: `Failed: ${summary} — ${msg}`, status: "failed" });
    return { output: { say: `${name} failed: ${msg}`, error: true } };
  }
}

/** Run (or cancel) a pending action after the owner decided. */
export async function resolvePending(id: number, approve: boolean, lang: Lang = "en"): Promise<{ action: PendingActionDTO; say: string }> {
  const [p] = await db.select().from(schema.pendingActions).where(eq(schema.pendingActions.id, id));
  if (!p) throw new Error("Pending action not found");
  if (p.status !== "pending") return { action: toDTO(p), say: lang === "ar" ? "تمت معالجة هذا الإجراء مسبقاً." : "This action was already handled." };

  if (!approve) {
    const [u] = await db.update(schema.pendingActions).set({ status: "cancelled", resolvedAt: new Date() }).where(eq(schema.pendingActions.id, id)).returning();
    await logActivity({ action: p.tool, agentId: p.agentId, actor: "user", summary: `Cancelled: ${p.summary}`, status: "cancelled" });
    return { action: toDTO(u), say: lang === "ar" ? `تم الإلغاء: ${p.summary}` : `Cancelled: ${p.summary}` };
  }

  const tool = getTool(p.tool);
  if (!tool) throw new Error(`Tool ${p.tool} no longer exists`);
  await db.update(schema.pendingActions).set({ status: "confirmed" }).where(eq(schema.pendingActions.id, id));
  try {
    const ctx: ToolContext = { agentId: (p.agentId ?? "chief") as AgentId, lang, channel: p.channel as ToolContext["channel"], conversationId: p.conversationId ?? undefined };
    const output = await tool.run(p.args as never, ctx);
    const [u] = await db.update(schema.pendingActions).set({ status: "executed", result: output, resolvedAt: new Date() }).where(eq(schema.pendingActions.id, id)).returning();
    await logActivity({ action: p.tool, agentId: p.agentId, actor: "sanad", summary: `Approved & done: ${p.summary}`, details: { args: p.args } });
    if (p.conversationId) {
      await db.insert(schema.messages).values({ conversationId: p.conversationId, role: "assistant", content: `✅ ${output.say}`, agentId: p.agentId, lang });
    }
    return { action: toDTO(u), say: output.say };
  } catch (e) {
    const msg = (e as Error).message;
    const [u] = await db.update(schema.pendingActions).set({ status: "failed", result: { error: msg }, resolvedAt: new Date() }).where(eq(schema.pendingActions.id, id)).returning();
    await logActivity({ action: p.tool, agentId: p.agentId, summary: `Failed after approval: ${p.summary} — ${msg}`, status: "failed" });
    return { action: toDTO(u), say: `${lang === "ar" ? "فشل التنفيذ" : "Failed"}: ${msg}` };
  }
}
