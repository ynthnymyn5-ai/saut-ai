import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { hoursSchema } from "@/lib/so/workflow-schema";

const patch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  name_ar: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  phone_number: z.string().regex(/^\+?[0-9 ]{6,20}$/).nullable().optional(),
  opening_hours: hoursSchema.optional(),
  is_active: z.boolean().optional(),
  assign_employee_ids: z.array(z.string().uuid()).max(50).optional(),
  unassign_employee_ids: z.array(z.string().uuid()).max(50).optional(),
});

export const PATCH = route("branch-update", async (req, ctx) => {
  const c = await orgContext(["owner", "admin"]);
  const { assign_employee_ids, unassign_employee_ids, ...fields } = await parseJson(req, patch);
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: b } = await c.db.from("branches").select("id").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!b) return fail(404, "not_found", "Branch not found");
  if (Object.keys(fields).length) await c.db.from("branches").update(fields).eq("id", id);
  if (assign_employee_ids?.length) await c.db.from("ai_employees").update({ branch_id: id }).in("id", assign_employee_ids).eq("organization_id", c.s.org.id);
  if (unassign_employee_ids?.length) await c.db.from("ai_employees").update({ branch_id: null }).in("id", unassign_employee_ids).eq("organization_id", c.s.org.id).eq("branch_id", id);
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "branch.updated", targetType: "branch", targetId: id });
  return ok({ ok: true });
});

export const DELETE = route("branch-delete", async (_req, ctx) => {
  const c = await orgContext(["owner"]);
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  await c.db.from("branches").delete().eq("id", id).eq("organization_id", c.s.org.id); // FKs set branch_id null on history
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "branch.deleted", targetType: "branch", targetId: id });
  return ok({ ok: true });
});
