import { getSession } from "@/lib/auth";
import { AuthError, ok, parseJson, route } from "@/lib/http";
import { supabaseService } from "@/lib/supabase/server";
import { handleMessage } from "@/lib/so/orchestrator";
import { z } from "zod";
import { chatSchema } from "@/lib/validation";

const schema = chatSchema.extend({ role: z.enum(["receptionist", "sales", "support", "manager", "booking", "custom"]).optional() });

/**
 * Dashboard test conversation. Runs through the full SO orchestration engine in TEST mode:
 * real intent understanding, routing and prompts, but every tool is simulated and reported
 * as NOT executed. Existing response shape ({ reply, transfer }) is preserved.
 */
export const POST = route(
  "ai-chat",
  async (req) => {
    const s = await getSession();
    if (!s?.org) throw new AuthError(401);
    const body = await parseJson(req, schema);
    const last = body.messages[body.messages.length - 1];
    const e = body.employee ?? {};
    const db = s.demo ? null : supabaseService();
    const r = await handleMessage(db, {
      orgId: s.org.id, channel: "test", text: last.content, test: true, history: body.messages.slice(0, -1),
      agentId: body.employeeId,
      draftAgent: body.employeeId ? undefined : {
        name: e.name, industry: e.industry, dialect: e.dialect, voice: e.voice, role: body.role,
        business_info: e.businessInfo ?? {}, instructions: e.instructions, businessName: e.businessInfo?.businessName,
      },
    });
    return ok({ reply: r.reply, transfer: r.transfer, agent: r.agent, intent: r.intent, intentSource: r.intentSource, tools: r.tools });
  },
  { limit: 20 },
);
