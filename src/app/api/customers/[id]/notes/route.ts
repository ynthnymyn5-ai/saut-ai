import { OPERATE } from "@/lib/rbac";
import { z } from "zod";
import { fail, ok, parseJson, route } from "@/lib/http";
import { inBranch, orgContext } from "@/lib/so/api";
import { tagCustomer } from "@/lib/so/crm";

/** Add a note and/or tags, and optionally schedule a follow-up reminder task. */
export const POST = route("customer-notes", async (req, ctx) => {
  const c = await orgContext(OPERATE);
  const body = await parseJson(req, z.object({
    note: z.string().trim().min(1).max(5000).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    reminder: z.object({ title: z.string().trim().min(2).max(200), due_at: z.string().datetime() }).optional(),
  }));
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: cust } = await c.db.from("customers").select("id, branch_id").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!cust || !inBranch(c.branchIds, cust.branch_id)) return fail(404, "not_found", "Customer not found");
  if (body.note) await c.db.from("customer_notes").insert({ organization_id: c.s.org.id, customer_id: id, author_user: c.s.userId, body: body.note });
  for (const t of body.tags ?? []) await tagCustomer(c.db, c.s.org.id, id, t);
  if (body.reminder) await c.db.from("agent_tasks").insert({ organization_id: c.s.org.id, branch_id: cust.branch_id, customer_id: id, kind: "follow_up", title: body.reminder.title, due_at: body.reminder.due_at, assigned_user: c.s.userId, created_by_user: c.s.userId });
  return ok({ ok: true }, 201);
});
