import { z } from "zod";
import { providerStatus } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { engineDb } from "@/lib/so/context";
import { agentToolKeys } from "@/lib/so/engine";
import { internalAuthorized } from "@/lib/so/internal-auth";
import { loadMemory } from "@/lib/so/memory";
import { buildAgentPrompt } from "@/lib/so/templates";
import { openAiToolSpecs } from "@/lib/so/tools";
import { verifyStreamToken } from "@/lib/so/stream-token";
import type { AgentRole } from "@/lib/so/permissions";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(20).max(2000), from: z.string().max(20).optional() });

/**
 * Voice bridge → session config for ONE call. The signed stream token (minted by the
 * incoming-call webhook, 2-minute expiry) identifies org, agent and conversation, so the
 * bridge needs no database key. Returns the same prompt and guarded tool list the chat
 * orchestrator uses, in OpenAI Realtime format; every tool call still runs through
 * /api/internal/tool → the SO Tool Execution Engine.
 */
export async function POST(req: Request) {
  if (!internalAuthorized(req)) return new Response("Forbidden", { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "invalid_input" }, { status: 422 });
  const claims = verifyStreamToken(process.env.INTERNAL_API_SECRET ?? "", p.data.token);
  if (!claims) return Response.json({ ok: false, error: "invalid_token" }, { status: 401 });
  if (!providerStatus("openai").configured) return Response.json({ ok: false, error: "openai_not_configured" }, { status: 503 });

  try {
    const db = engineDb();
    const { data: a } = await db.from("ai_employees")
      .select("id, organization_id, branch_id, name, role, industry, dialect, voice, speaking_rate, status, safety_profile, business_info, call_settings")
      .eq("id", claims.e).eq("organization_id", claims.o).maybeSingle();
    if (!a || a.status !== "active") return Response.json({ ok: false, error: "agent_unavailable" }, { status: 409 });
    const { data: conv } = await db.from("conversations").select("id, customer_id").eq("id", claims.c).eq("organization_id", claims.o).maybeSingle();
    if (!conv) return Response.json({ ok: false, error: "conversation_not_found" }, { status: 404 });

    // Known caller? attach the customer so memory and CRM tools work during the call.
    let customerId = conv.customer_id as string | null;
    if (!customerId && p.data.from) {
      const { data: c } = await db.from("customers").select("id").eq("organization_id", claims.o).eq("phone", p.data.from).maybeSingle();
      if (c) { customerId = c.id; await db.from("conversations").update({ customer_id: c.id }).eq("id", conv.id).eq("organization_id", claims.o); }
    }

    const [instr, memory, branch] = await Promise.all([
      db.from("ai_employee_instructions").select("content").eq("employee_id", a.id).eq("is_current", true).maybeSingle().then((r) => r.data?.content as string | undefined),
      customerId ? loadMemory(db, claims.o, { customerId, turns: 0 }) : Promise.resolve({ history: [], facts: [] as string[] }),
      a.branch_id ? db.from("branches").select("name, address").eq("id", a.branch_id).eq("organization_id", claims.o).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    ]);
    const bi = (a.business_info ?? {}) as { businessName?: string; description?: string; hours?: string; faqs?: string };
    const instructions = buildAgentPrompt({
      name: a.name, role: a.role as AgentRole, dialect: a.dialect, safetyProfile: a.safety_profile, industry: a.industry,
      businessName: bi.businessName ?? "the business", channel: "phone",
      instructions: [instr, bi.description && `About: ${bi.description}`, bi.hours && `Hours: ${bi.hours}`, bi.faqs && `FAQs:\n${bi.faqs}`].filter(Boolean).join("\n"),
      knowledge: [], memory: memory.facts,
      branch: branch ? { name: branch.name as string, address: branch.address as string | undefined } : null,
    })
      + (p.data.from ? `\n\nCaller phone: ${p.data.from}` : "")
      + "\n\nGreet the caller first with the business name. For anything about prices, menus, policies or services, call search_knowledge before answering if that tool is available.";

    const keys = await agentToolKeys({ db, orgId: claims.o, agent: { id: a.id, role: a.role as AgentRole, branch_id: a.branch_id, name: a.name }, actor: "agent", test: false });
    const tools = (await openAiToolSpecs(keys)).map((t) => ({ type: "function", name: t.function.name, description: t.function.description, parameters: t.function.parameters }));

    return Response.json({
      ok: true, orgId: claims.o, employeeId: a.id, conversationId: conv.id,
      instructions, tools,
      voice: a.voice || "alloy",
      speed: Math.min(1.3, Math.max(0.7, Number(a.speaking_rate ?? 1))),
      language: a.dialect === "english" ? "en" : "ar",
      maxDurationSec: Number((a.call_settings as { max_duration_sec?: number })?.max_duration_sec ?? 600),
    });
  } catch (e) {
    reportError(e, { scope: "internal-session" });
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
