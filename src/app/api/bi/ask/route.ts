import { MANAGE_AI } from "@/lib/rbac";
import { z } from "zod";
import { fail, ok, parseJson, route } from "@/lib/http";
import { inBranch, orgContext } from "@/lib/so/api";
import { computeMetrics, estimates, interpret, periodRange, previousRange } from "@/lib/so/bi";

/**
 * "Ask SO": measured metrics for the period and the previous one, estimates with formulas,
 * and (when configured) an AI interpretation that may use only those numbers. Saved as a report.
 */
export const POST = route("bi-ask", async (req) => {
  const c = await orgContext(MANAGE_AI);
  const body = await parseJson(req, z.object({
    question: z.string().trim().min(3).max(500),
    period: z.enum(["today", "last_7_days", "this_month", "last_month", "last_30_days"]).default("this_month"),
    branch_id: z.string().uuid().nullable().optional(),
    locale: z.enum(["ar", "en"]).default("ar"),
  }));
  if (c.demo) return ok({ demo: true });
  if (!inBranch(c.branchIds, body.branch_id)) return fail(403, "forbidden", "No access to this branch");
  const [from, to] = periodRange(body.period);
  const [pFrom, pTo] = previousRange(from, to);
  const [current, previous] = await Promise.all([
    computeMetrics(c.db, c.s.org.id, from, to, body.branch_id ?? null),
    computeMetrics(c.db, c.s.org.id, pFrom, pTo, body.branch_id ?? null),
  ]);
  const est = estimates(current);
  const ai = await interpret(body.question, current, previous, est, body.locale);
  const { data: report } = await c.db.from("business_reports").insert({
    organization_id: c.s.org.id, branch_id: body.branch_id ?? null, question: body.question, kind: "question",
    period_start: from.toISOString().slice(0, 10), period_end: to.toISOString().slice(0, 10),
    measured: { current, previous }, estimated: est, interpretation: ai?.text ?? null, model: ai?.model ?? null, created_by: c.s.userId,
  }).select("id").single();
  return ok({ id: report?.id, measured: { current, previous }, estimated: est, interpretation: ai?.text ?? null, aiAvailable: !!ai });
}, { limit: 10 });
