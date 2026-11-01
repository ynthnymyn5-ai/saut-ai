import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { hoursSchema } from "@/lib/so/workflow-schema";

const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  name_ar: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  phone_number: z.string().regex(/^\+?[0-9 ]{6,20}$/).optional().or(z.literal("")),
  opening_hours: hoursSchema.default({}),
});

export const GET = route("branches-list", async () => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, branches: [] });
  let q = c.db.from("branches").select("id, name, name_ar, address, phone_number, opening_hours, is_active, created_at").eq("organization_id", c.s.org.id).order("created_at");
  if (c.branchIds) q = q.in("id", c.branchIds);
  const { data } = await q;
  const ids = (data ?? []).map((b) => b.id);
  const [emps, appts] = ids.length ? await Promise.all([
    c.db.from("ai_employees").select("id, name, branch_id").eq("organization_id", c.s.org.id),
    c.db.from("appointments").select("branch_id").eq("organization_id", c.s.org.id).gte("starts_at", new Date().toISOString()).in("status", ["pending", "confirmed"]),
  ]) : [{ data: [] }, { data: [] }];
  return ok({
    branches: (data ?? []).map((b) => ({
      ...b,
      employees: (emps.data ?? []).filter((e) => e.branch_id === b.id).map((e) => ({ id: e.id, name: e.name })),
      upcomingAppointments: (appts.data ?? []).filter((a) => a.branch_id === b.id).length,
    })),
    unassignedEmployees: (emps.data ?? []).filter((e) => !e.branch_id).map((e) => ({ id: e.id, name: e.name })),
  });
});

export const POST = route("branches-create", async (req) => {
  const c = await orgContext(["owner", "admin"]);
  const body = await parseJson(req, branchSchema);
  if (c.demo) return ok({ demo: true });
  const { data, error } = await c.db.from("branches").insert({ ...body, phone_number: body.phone_number || null, organization_id: c.s.org.id }).select("id").single();
  if (error) {
    if (error.message.includes("PLAN_LIMIT")) return fail(402, "plan_limit", error.message.replace("PLAN_LIMIT: ", ""));
    if (error.code === "23505") return fail(409, "duplicate", "A branch with this name already exists");
    throw error;
  }
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "branch.created", targetType: "branch", targetId: data.id });
  return ok({ id: data.id }, 201);
});
