import { OPERATE } from "@/lib/rbac";
import { z } from "zod";
import { providerStatus } from "@/lib/env";
import { fail, ok, route } from "@/lib/http";
import { inBranch, orgContext } from "@/lib/so/api";
import { customerTimeline, leadSignals } from "@/lib/so/crm";
import { suggestFollowUp } from "@/lib/so/scoring";

/**
 * Follow-up suggestion grounded in recorded interactions. Always returns the rule-based
 * suggestion (source "rules"); adds an AI-written suggestion (source "ai") when OpenAI is
 * configured, generated only from this customer's timeline.
 */
export const POST = route("lead-suggest", async (_req, ctx) => {
  const c = await orgContext(OPERATE);
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: lead } = await c.db.from("leads").select("branch_id, interest, stage").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!lead || !inBranch(c.branchIds, lead.branch_id)) return fail(404, "not_found", "Lead not found");
  const s = await leadSignals(c.db, c.s.org.id, id);
  if (!s) return fail(404, "not_found", "Lead not found");
  const rules = suggestFollowUp(s);
  let ai: string | null = null;
  if (providerStatus("openai").configured) {
    const timeline = (await customerTimeline(c.db, c.s.org.id, s.customerId)).slice(0, 25);
    if (timeline.length) {
      const { openai, models } = await import("@/lib/ai/openai");
      const r = await openai().chat.completions.create({
        model: models.chat(), temperature: 0.3, max_tokens: 220,
        messages: [
          { role: "system", content: "Suggest ONE concrete next follow-up for this sales lead, based only on the interaction timeline given. Two sentences max: what to do, and why (cite the interaction). If the timeline is too thin, say what information is missing. Reply in the language of the interactions." },
          { role: "user", content: JSON.stringify({ stage: lead.stage, interest: lead.interest, signals: s, timeline }) },
        ],
      });
      ai = r.choices[0].message.content;
    }
  }
  return ok({ rules, ai, signals: s });
}, { limit: 20 });
