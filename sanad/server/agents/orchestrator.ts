/**
 * The orchestration loop.
 *
 *   owner message → Chief of Staff (with memories + tools + delegate_to_* tools)
 *                    ├─ calls its own tools (tasks, calendar, email, memory, brief)
 *                    └─ delegates to specialist agents, each running its own
 *                       tool loop with its own prompt, then returning a result
 *                 → one combined reply (in the owner's language)
 *
 * Panels can also talk to a specialist directly (agentId ≠ "chief").
 */
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { llm, type ChatMessage, type ToolSpec } from "../llm";
import { AGENTS, AGENT_IDS, type AgentId } from "@shared/agents";
import type { ChatResponse, Lang, PendingActionDTO } from "@shared/types";
import { AGENT_PROMPTS } from "./registry";
import { invokeTool, toolsForAgent, toSpec } from "../tools/registry";
import type { ToolContext } from "../tools/types";
import { memoryContext, extractMemories } from "../memory/service";
import { nowForPrompt } from "../lib/time";
import { logActivity } from "../lib/activity";

const MAX_STEPS = 6;
const HISTORY = 16;

export const detectLang = (text: string): Lang => {
  const ar = (text.match(/[؀-ۿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return ar > latin * 0.5 ? "ar" : "en";
};

interface LoopResult {
  content: string;
  pending: PendingActionDTO[];
  actions: { tool: string; summary: string }[];
  delegations: AgentId[];
}

function delegateSpecs(): ToolSpec[] {
  return AGENTS.filter((a) => a.id !== "chief").map((a) => ({
    name: `delegate_to_${a.id}`,
    description: `Delegate to the ${a.name.en} agent (${a.tagline.en}). Pass a complete, self-contained request.`,
    parameters: {
      type: "object",
      properties: { request: { type: "string", description: "What the specialist should do, with all needed details" } },
      required: ["request"],
    },
  }));
}

async function systemPrompt(agentId: AgentId, query: string, lang: Lang, channel: string) {
  const memories = await memoryContext(query).catch(() => "");
  return [
    AGENT_PROMPTS[agentId],
    `\nCurrent time: ${nowForPrompt()}`,
    `Channel: ${channel}${channel !== "web" ? " (plain text only, keep it short)" : ""}. The owner's latest message is in ${lang === "ar" ? "Arabic" : "English"} — reply in that language.`,
    memories ? `\nWhat you remember about the owner (use when relevant, don't recite):\n${memories}` : "",
  ].join("\n");
}

/** Generic tool-calling loop used by the Chief and by every specialist. */
async function agentLoop(agentId: AgentId, messages: ChatMessage[], ctx: ToolContext, depth = 0): Promise<LoopResult> {
  const tools = toolsForAgent(agentId).map(toSpec);
  if (agentId === "chief" && depth === 0) tools.push(...delegateSpecs());
  const result: LoopResult = { content: "", pending: [], actions: [], delegations: [] };

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await llm().chat({ messages, tools });
    if (!res.toolCalls.length) {
      result.content = (res.content ?? "").trim();
      return result;
    }
    messages.push({ role: "assistant", content: res.content, toolCalls: res.toolCalls, raw: res.raw });

    for (const call of res.toolCalls) {
      let output: Record<string, unknown>;
      const delegate = call.name.match(/^delegate_to_(\w+)$/)?.[1] as AgentId | undefined;

      if (delegate && AGENT_IDS.includes(delegate) && delegate !== "chief") {
        const request = String(call.args.request ?? "");
        result.delegations.push(delegate);
        await logActivity({ action: "delegate", agentId: delegate, summary: `Chief of Staff → ${delegate}: ${request.slice(0, 140)}`, details: { request } });
        const sub = await agentLoop(
          delegate,
          [
            { role: "system", content: await systemPrompt(delegate, request, ctx.lang, ctx.channel) },
            { role: "user", content: request },
          ],
          { ...ctx, agentId: delegate },
          depth + 1,
        );
        result.pending.push(...sub.pending);
        result.actions.push(...sub.actions);
        output = { agent: delegate, say: sub.content, pendingApprovals: sub.pending.map((p) => p.summary) };
      } else {
        const r = await invokeTool(call.name, call.args, ctx);
        if (r.pending) result.pending.push(r.pending);
        if (r.extraPending) result.pending.push(...r.extraPending);
        if (r.executed) result.actions.push(r.executed);
        output = r.output;
      }
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(output).slice(0, 8000) });
    }
  }
  // Ran out of steps — ask the model for a final answer without tools
  const final = await llm().chat({ messages: [...messages, { role: "user", content: "Summarise what you did and the result for the owner." }] });
  result.content = (final.content ?? "").trim();
  return result;
}

export interface TurnInput {
  text: string;
  conversationId?: number;
  agentId?: AgentId;
  channel?: ToolContext["channel"];
}

export async function runTurn(input: TurnInput): Promise<ChatResponse> {
  const text = input.text.trim();
  const agentId: AgentId = input.agentId && AGENT_IDS.includes(input.agentId) ? input.agentId : "chief";
  const channel = input.channel ?? "web";
  const lang = detectLang(text);

  // Conversation + history
  let conversationId = input.conversationId;
  if (conversationId) {
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId));
    if (!c) conversationId = undefined;
  }
  if (!conversationId) {
    const [c] = await db.insert(schema.conversations).values({ title: text.slice(0, 60), channel, agentId }).returning();
    conversationId = c.id;
  }
  const history = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(desc(schema.messages.createdAt)).limit(HISTORY);
  await db.insert(schema.messages).values({ conversationId, role: "user", content: text, lang, agentId });

  const messages: ChatMessage[] = [
    { role: "system", content: await systemPrompt(agentId, text, lang, channel) },
    ...history.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: text },
  ];

  let result: LoopResult;
  try {
    result = await agentLoop(agentId, messages, { agentId, lang, channel, conversationId });
  } catch (e) {
    console.error("[orchestrator]", e);
    const msg = (e as Error).message;
    result = {
      content: lang === "ar" ? `عذراً، واجهت مشكلة في الاتصال بنموذج الذكاء الاصطناعي (${msg}).` : `Sorry — I couldn't reach the AI model (${msg}).`,
      pending: [],
      actions: [],
      delegations: [],
    };
  }
  if (!result.content) result.content = lang === "ar" ? "تم." : "Done.";

  const [saved] = await db
    .insert(schema.messages)
    .values({ conversationId, role: "assistant", content: result.content, lang, agentId, meta: { delegations: result.delegations, actions: result.actions, pending: result.pending.map((p) => p.id) } })
    .returning();
  await db.update(schema.conversations).set({ updatedAt: new Date() }).where(eq(schema.conversations.id, conversationId));

  // Long-term memory runs after the reply so it never slows Sanad down
  void extractMemories(text, result.content);

  return {
    conversationId,
    messageId: saved.id,
    reply: result.content,
    lang,
    agent: agentId,
    delegations: [...new Set(result.delegations)],
    actions: result.actions,
    pending: result.pending,
    provider: llm().name,
  };
}
