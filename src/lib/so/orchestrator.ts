import "server-only";
import type OpenAI from "openai";
import { ProviderNotConfiguredError, providerStatus } from "@/lib/env";
import { understand } from "./brain";
import { maskPhone, setLiveStatus, type AgentRecord, type DB, type ToolCtx } from "./context";
import { agentToolKeys, runTool } from "./engine";
import { searchKnowledge } from "./knowledge";
import { loadMemory } from "./memory";
import { needsHumanHandoff, routeAgent } from "./router";
import { buildAgentPrompt } from "./templates";
import { openAiToolSpecs } from "./tools";
import type { AgentRole } from "./permissions";

export interface Inbound {
  orgId: string;
  channel: "phone" | "whatsapp" | "web_chat" | "test";
  text: string;
  conversationId?: string;
  customerId?: string;
  customerPhone?: string;
  branchId?: string | null;
  agentId?: string;                    // pin a specific agent (e.g. the number's owner)
  draftAgent?: Partial<AgentRecord> & { instructions?: string; businessName?: string }; // wizard tests
  history?: { role: "user" | "assistant"; content: string }[];
  test: boolean;
  audience?: "customer" | "internal";
}

export interface OrchestratorResult {
  reply: string;
  agent: { id: string | null; name: string; role: AgentRole };
  intent: string;
  intentSource: "model" | "rules";
  transfer: boolean;
  handoffReason: string | null;
  tools: { key: string; ok: boolean; pending?: boolean; note: string }[];
}

const MAX_ROUNDS = 4;

/**
 * SO Brain → Router → Memory → Knowledge → LLM with guarded tools → Handoff → Status/Audit.
 * Statuses are written as the work actually happens (thinking → working/speaking → online).
 */
export async function handleMessage(db: DB | null, input: Inbound): Promise<OrchestratorResult> {
  if (!providerStatus("openai").configured) throw new ProviderNotConfiguredError("OPENAI_API_KEY");
  const { openai, models } = await import("@/lib/ai/openai");

  // 1. Brain
  const intent = await understand(input.text, (input.history ?? []).filter((h) => h.role === "user").map((h) => h.content));

  // 2. Router
  let agent: AgentRecord | null = null;
  if (input.draftAgent) {
    agent = { id: "draft", organization_id: input.orgId, branch_id: null, name: input.draftAgent.name ?? "SO", role: (input.draftAgent.role as AgentRole) ?? "receptionist", industry: input.draftAgent.industry ?? "other", dialect: input.draftAgent.dialect ?? "kuwaiti", voice: input.draftAgent.voice ?? "alloy", speaking_rate: 1, status: "active", safety_profile: input.draftAgent.safety_profile ?? (input.draftAgent.industry === "clinic" ? "medical" : "standard"), business_info: input.draftAgent.business_info ?? {}, call_settings: {}, working_hours: {} };
  } else if (db) {
    const { data: agents } = await db.from("ai_employees").select("id, organization_id, branch_id, name, role, industry, dialect, voice, speaking_rate, status, safety_profile, business_info, call_settings, working_hours").eq("organization_id", input.orgId);
    const list = (agents ?? []) as AgentRecord[];
    const pinned = input.agentId ? list.find((a) => a.id === input.agentId && (a.status === "active" || input.test)) : null;
    // A pinned receptionist hands specialised intents to a specialist when one exists.
    const routed = routeAgent(intent, list, { branchId: input.branchId, channelAudience: input.audience ?? "customer" });
    agent = pinned && (!routed || pinned.role === routed.role || pinned.role !== "receptionist") ? pinned : (list.find((a) => a.id === routed?.id) ?? pinned ?? null);
  }
  if (!agent) {
    return { reply: intent.language === "ar" ? "عذراً، لا يوجد موظف متاح حالياً. سيتواصل معك فريقنا قريباً." : "Sorry, no one is available right now. Our team will get back to you shortly.", agent: { id: null, name: "—", role: "custom" }, intent: intent.kind, intentSource: intent.source, transfer: true, handoffReason: "no_active_agent", tools: [] };
  }
  const realAgentId = agent.id === "draft" ? null : agent.id;
  await setLiveStatus(input.test ? null : db, realAgentId, "thinking", input.customerPhone ? `Customer ${maskPhone(input.customerPhone)}` : null);

  const ctx: ToolCtx = { db: input.test ? null : db, orgId: input.orgId, agent: { id: agent.id, role: agent.role, branch_id: agent.branch_id, name: agent.name }, actor: "agent", conversationId: input.conversationId, customerId: input.customerId, branchId: input.branchId ?? agent.branch_id, channel: input.channel, test: input.test };
  const toolsUsed: OrchestratorResult["tools"] = [];
  let transfer = false;

  // 3. Immediate handoff rules (before spending model calls)
  const early = needsHumanHandoff(intent, { failedToolCalls: 0, safetyProfile: agent.safety_profile });

  // 4. Memory + knowledge
  const [memory, knowledge, branch, instr] = await Promise.all([
    db && !input.test ? loadMemory(db, input.orgId, { conversationId: input.conversationId, customerId: input.customerId }) : Promise.resolve({ history: [], facts: [] as string[] }),
    db && !input.test ? searchKnowledge(db, input.orgId, input.text, { branchId: ctx.branchId }) : Promise.resolve([]),
    db && ctx.branchId ? db.from("branches").select("name, address, opening_hours").eq("id", ctx.branchId).eq("organization_id", input.orgId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    db && realAgentId ? db.from("ai_employee_instructions").select("content").eq("employee_id", realAgentId).eq("is_current", true).maybeSingle().then((r) => r.data?.content as string | undefined) : Promise.resolve(input.draftAgent?.instructions),
  ]);
  const bi = agent.business_info as { businessName?: string; description?: string; hours?: string; faqs?: string };
  const system = buildAgentPrompt({
    name: agent.name, role: agent.role, dialect: agent.dialect, safetyProfile: agent.safety_profile, industry: agent.industry,
    businessName: bi.businessName ?? input.draftAgent?.businessName ?? "the business", channel: input.channel,
    instructions: [instr, bi.description && `About: ${bi.description}`, bi.hours && `Hours: ${bi.hours}`, bi.faqs && `FAQs:\n${bi.faqs}`].filter(Boolean).join("\n"),
    knowledge: knowledge.map((k) => `${k.title}: ${k.excerpt}`), memory: memory.facts,
    branch: branch ? { name: branch.name as string, address: branch.address as string | undefined } : null,
  }) + (input.test ? "\n\nThis is a TEST conversation from the dashboard. Tools are simulated." : "") + (input.customerPhone ? `\n\nCaller/customer phone: ${input.customerPhone}` : "")
    + (early ? `\n\nPOLICY: hand this conversation to a human now (reason: ${early}). Briefly explain and call transfer_to_human.` : "");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }, ...(input.history ?? memory.history), { role: "user", content: input.text }];
  const tools = await openAiToolSpecs(await agentToolKeys(ctx));
  let failed = 0;
  let reply = "";

  // 5. Model loop with guarded tool execution
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const r = await openai().chat.completions.create({ model: models.chat(), messages, tools: tools.length ? tools : undefined, temperature: 0.5, max_tokens: input.channel === "phone" ? 160 : 350 });
    const msg = r.choices[0].message;
    if (!msg.tool_calls?.length) { reply = msg.content ?? ""; break; }
    messages.push(msg);
    await setLiveStatus(ctx.db, realAgentId, "working", `Running ${msg.tool_calls.map((c) => (c.type === "function" ? c.function.name : "")).join(", ")}`);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let args: unknown = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* invalid JSON → validation error below */ }
      const res = await runTool(ctx, call.function.name, args);
      if (!res.ok && !res.pending) failed++;
      if (res.transfer || (input.test && call.function.name === "transfer_to_human")) transfer = true;
      toolsUsed.push({ key: call.function.name, ok: res.ok, pending: res.pending, note: res.note });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ ok: res.ok, pending: !!res.pending, note: res.note, data: res.data ?? null }).slice(0, 6000) });
    }
    // 6. Repeated failures → human handoff
    const late = needsHumanHandoff(intent, { failedToolCalls: failed, safetyProfile: agent.safety_profile });
    if (late === "repeated_failure" && !transfer) {
      const h = await runTool({ ...ctx, actor: "workflow" }, "transfer_to_human", { reason: "AI could not complete the request after repeated tool failures" });
      transfer = !!h.transfer || input.test;
      toolsUsed.push({ key: "transfer_to_human", ok: h.ok, note: h.note });
      messages.push({ role: "system", content: "You were unable to complete the request; a human is taking over. Apologise briefly and tell the customer." });
    }
  }
  if (!reply) reply = intent.language === "ar" ? "لحظة من فضلك، أحوّلك لأحد الزملاء." : "One moment, I'm passing you to a colleague.";

  await setLiveStatus(ctx.db, realAgentId, transfer ? "needs_attention" : input.channel === "phone" ? "speaking" : "online", transfer ? "Escalated to staff" : null);

  // 7. Persist conversation turn (real traffic only)
  if (db && !input.test && input.conversationId) {
    await db.from("messages").insert([
      { conversation_id: input.conversationId, organization_id: input.orgId, role: "customer", content: input.text.slice(0, 10000) },
      { conversation_id: input.conversationId, organization_id: input.orgId, role: "ai", content: reply.slice(0, 10000) },
    ]);
    await db.from("conversations").update({ intent: intent.kind, employee_id: realAgentId, last_activity_at: new Date().toISOString(), current_task: transfer ? "Escalated" : intent.kind }).eq("id", input.conversationId).eq("organization_id", input.orgId);
    if (intent.kind === "complaint") {
      const { emitEvent } = await import("./events");
      await emitEvent(input.orgId, "complaint", { conversation_id: input.conversationId, customer_id: input.customerId, phone: input.customerPhone, channel: input.channel, text: input.text }, { branchId: ctx.branchId });
    }
  }

  return { reply, agent: { id: realAgentId, name: agent.name, role: agent.role }, intent: intent.kind, intentSource: intent.source, transfer, handoffReason: early ?? (transfer ? "agent_escalated" : null), tools: toolsUsed };
}
