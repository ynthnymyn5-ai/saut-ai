import "server-only";
import type OpenAI from "openai";
import { ProviderNotConfiguredError, providerStatus } from "@/lib/env";
import { MANAGE_AI, type MemberRole } from "@/lib/rbac";
import type { DB } from "@/lib/so/context";
import { ASSISTANT_PAGES, asEmotion, type AssistantPage, type Emotion } from "./core";

export interface AssistantCtx {
  db: DB | null;              // null in demo mode
  orgId: string;
  orgName: string;
  userName: string | null;
  role: MemberRole;
  branchIds: string[] | null; // null = whole organization
  locale: "ar" | "en";
  path: string;
}
export interface AssistantReply { reply: string; emotion: Emotion; actions: { type: "navigate"; href: string }[]; tools: string[] }

const PERIODS = ["today", "last_7_days", "this_month", "last_month", "last_30_days"] as const;

/**
 * Tools the assistant may use for THIS user. All are read-only (the assistant explains and
 * navigates; changes are made by the user in the screens, where the normal role checks apply).
 * Business metrics only for roles that may see them and only with whole-org access.
 */
function toolSpecs(ctx: AssistantCtx): OpenAI.Chat.ChatCompletionTool[] {
  const specs: OpenAI.Chat.ChatCompletionTool[] = [
    { type: "function", function: { name: "open_page", description: "Open a screen of the SAUT AI dashboard for the user.", parameters: { type: "object", additionalProperties: false, required: ["page"], properties: { page: { type: "string", enum: Object.keys(ASSISTANT_PAGES) } } } } },
    { type: "function", function: { name: "get_live_status", description: "Right-now status: AI employees online, current calls, active conversations, escalations, items waiting for approval, today's leads and bookings.", parameters: { type: "object", additionalProperties: false, properties: {} } } },
    { type: "function", function: { name: "list_appointments", description: "Appointments/reservations for a day (Kuwait time).", parameters: { type: "object", additionalProperties: false, required: ["day"], properties: { day: { type: "string", enum: ["today", "tomorrow"] } } } } },
  ];
  if (MANAGE_AI.includes(ctx.role) && !ctx.branchIds) {
    specs.push({ type: "function", function: { name: "get_business_metrics", description: "Measured business metrics for a period: calls, conversations, appointments, leads, customers, per-employee performance.", parameters: { type: "object", additionalProperties: false, required: ["period"], properties: { period: { type: "string", enum: [...PERIODS] } } } } });
  }
  return specs;
}

async function runTool(ctx: AssistantCtx, name: string, args: Record<string, unknown>, actions: AssistantReply["actions"]): Promise<unknown> {
  if (name === "open_page") {
    const page = String(args.page) as AssistantPage;
    if (!(page in ASSISTANT_PAGES)) return { ok: false, note: "Unknown page" };
    actions.push({ type: "navigate", href: ASSISTANT_PAGES[page] });
    return { ok: true, note: "The screen is opening for the user." };
  }
  if (!ctx.db) return { ok: false, note: "DEMO MODE: no live business data is connected. Say so plainly; do not invent numbers." };
  const db = ctx.db;

  if (name === "get_live_status") {
    const { commandSnapshot } = await import("@/lib/so/command");
    const s = await commandSnapshot(db, ctx.orgId, { branchIds: ctx.branchIds, canSeeCustomer: false });
    return { ok: true, measured: true, counters: { ...s.counters, timeSaved: undefined }, employees: s.agents.map((a) => ({ name: a.name, status: a.status, activeCalls: a.activeCalls, activeConversations: a.activeConversations })), waitingForApproval: s.approvals.length };
  }
  if (name === "list_appointments") {
    const kw = new Date(Date.now() + 3 * 3600_000); // Asia/Kuwait (UTC+3, no DST)
    const startKw = Date.UTC(kw.getUTCFullYear(), kw.getUTCMonth(), kw.getUTCDate()) + (args.day === "tomorrow" ? 86400_000 : 0);
    const from = new Date(startKw - 3 * 3600_000).toISOString(), to = new Date(startKw + 21 * 3600_000).toISOString();
    let q = db.from("appointments").select("starts_at, kind, status, party_size, customers(full_name)").eq("organization_id", ctx.orgId).gte("starts_at", from).lt("starts_at", to).order("starts_at").limit(30);
    if (ctx.branchIds) q = q.in("branch_id", ctx.branchIds);
    const { data } = await q;
    return {
      ok: true, measured: true, count: data?.length ?? 0,
      items: (data ?? []).map((a) => ({
        time: new Date(new Date(a.starts_at as string).getTime() + 3 * 3600_000).toISOString().slice(11, 16),
        kind: a.kind, status: a.status, party_size: a.party_size,
        customer: ((a.customers as unknown as { full_name?: string } | null)?.full_name ?? "").split(" ")[0] || null, // first name only
      })),
    };
  }
  if (name === "get_business_metrics" && MANAGE_AI.includes(ctx.role) && !ctx.branchIds) {
    const { computeMetrics, periodRange } = await import("@/lib/so/bi");
    const period = (PERIODS as readonly string[]).includes(String(args.period)) ? (args.period as (typeof PERIODS)[number]) : "this_month";
    const [from, to] = periodRange(period);
    const m = await computeMetrics(db, ctx.orgId, from, to, null);
    return { ok: true, measured: true, period, metrics: { ...m, agents: m.agents.slice(0, 10) } };
  }
  return { ok: false, note: "Not available for this user." };
}

function systemPrompt(ctx: AssistantCtx) {
  return [
    `You are "SO" (سو), the in-app assistant of SAUT AI for ${ctx.orgName}. You appear as a friendly human face and your replies are SPOKEN aloud.`,
    `The user is ${ctx.userName ?? "a team member"} (role: ${ctx.role}). They are on ${ctx.path}. Today is ${new Date().toISOString().slice(0, 10)} (Asia/Kuwait).`,
    ctx.locale === "ar" ? "Reply in natural, warm Kuwaiti/Gulf Arabic unless the user writes in English." : "Reply in English unless the user writes in Arabic (then reply in Gulf Arabic).",
    "Keep it short: 1–3 spoken sentences, no lists, no markdown, no emojis. Ask at most one question.",
    "You help the business owner and staff use SAUT AI: explain screens and features, answer questions about THEIR business using the tools, and open screens with open_page.",
    "Facts and numbers must come only from tool results (they are measured). Never invent numbers, customers or events. If a tool says DEMO MODE or not available, say so plainly.",
    "You cannot change data, send messages, make calls or take payments. If asked, open the right screen and tell the user what to tap.",
    "SAUT AI screens: Overview, Command Center (live status), Live Operations, AI employees (create/edit, voice, dialect, tools, permissions), Templates, Automation Studio, Knowledge base, Customers, Appointments, Sales pipeline, Calls, Conversations, Business Intelligence, Analytics, Branches, Integrations (phone, WhatsApp, calendar), Billing (plans: Starter 19, Business 49, Pro 99 KWD/month), Settings (profile, business, team & roles), Support.",
    'Return JSON {"reply": string, "emotion": "neutral"|"happy"|"thinking"|"concerned"|"celebrating"} — emotion matches what you say (good news → happy/celebrating, problems → concerned).',
  ].join("\n");
}

/** One assistant turn: model ↔ read-only tools (max 3 rounds) → spoken reply + emotion + UI actions. */
export async function assistantTurn(ctx: AssistantCtx, text: string, history: { role: "user" | "assistant"; content: string }[]): Promise<AssistantReply> {
  if (!providerStatus("openai").configured) throw new ProviderNotConfiguredError("OPENAI_API_KEY");
  const { openai, models } = await import("@/lib/ai/openai");
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt(ctx) }, ...history.slice(-10), { role: "user", content: text }];
  const tools = toolSpecs(ctx);
  const actions: AssistantReply["actions"] = [];
  const used: string[] = [];

  for (let round = 0; round < 4; round++) {
    const r = await openai().chat.completions.create({
      model: models.chat(), messages, temperature: 0.4, max_tokens: 300,
      tools: round < 3 ? tools : undefined,
      response_format: {
        type: "json_schema",
        json_schema: { name: "assistant_reply", strict: true, schema: { type: "object", additionalProperties: false, required: ["reply", "emotion"], properties: { reply: { type: "string" }, emotion: { type: "string", enum: ["neutral", "happy", "thinking", "concerned", "celebrating"] } } } },
      },
    });
    const msg = r.choices[0].message;
    if (!msg.tool_calls?.length) {
      let out: { reply?: string; emotion?: string } = {};
      try { out = JSON.parse(msg.content ?? "{}"); } catch { out = { reply: msg.content ?? "" }; }
      return { reply: (out.reply ?? "").trim() || (ctx.locale === "ar" ? "تم." : "Done."), emotion: asEmotion(out.emotion), actions, tools: used };
    }
    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* empty */ }
      used.push(call.function.name);
      const result = await runTool(ctx, call.function.name, args, actions).catch(() => ({ ok: false, note: "The data could not be loaded right now." }));
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
    }
  }
  return { reply: ctx.locale === "ar" ? "عذراً، ما قدرت أكمل الطلب. جرّب مرة ثانية." : "Sorry, I couldn't finish that. Please try again.", emotion: "concerned", actions, tools: used };
}
