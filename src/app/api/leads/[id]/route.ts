import { OPERATE } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, parseJson, route } from "@/lib/http";
import { inBranch, orgContext } from "@/lib/so/api";
import { rescoreLead } from "@/lib/so/crm";

const patch = z.object({
  stage: z.enum(["new", "contacted", "interested", "qualified", "converted", "lost"]).optional(),
  lost_reason: z.string().max(300).optional(),
  estimated_value: z.number().min(0).max(10_000_000).nullable().optional(),
  next_follow_up_at: z.string().datetime().nullable().optional(),
  interest: z.string().max(500).optional(),
});

export const PATCH = route("lead-update", async (req, ctx) => {
  const c = await orgContext(OPERATE);
  const body = await parseJson(req, patch);
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: lead } = await c.db.from("leads").select("branch_id, stage").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!lead || !inBranch(c.branchIds, lead.branch_id)) return fail(404, "not_found", "Lead not found");
  if (body.stage === "lost" && !body.lost_reason) return fail(422, "invalid_input", "A reason is required when marking a lead as lost");
  await c.db.from("leads").update({ ...body, ...(body.stage && body.stage !== lead.stage ? { stage_changed_at: new Date().toISOString() } : {}) }).eq("id", id);
  const score = await rescoreLead(c.db, c.s.org.id, id);
  if (body.stage) await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "lead.stage_changed", targetType: "lead", targetId: id, metadata: { from: lead.stage, to: body.stage } });
  return ok({ ok: true, score });
});
