import { z } from "zod";
import { fail, ok, route } from "@/lib/http";
import { inBranch, orgContext } from "@/lib/so/api";
import { customerTimeline } from "@/lib/so/crm";

export const GET = route("customer-timeline", async (_req, ctx) => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, items: [] });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: cust } = await c.db.from("customers").select("id, branch_id").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!cust || !inBranch(c.branchIds, cust.branch_id)) return fail(404, "not_found", "Customer not found");
  const [items, tags] = await Promise.all([
    customerTimeline(c.db, c.s.org.id, id),
    c.db.from("customer_tag_links").select("customer_tags(name, color)").eq("customer_id", id),
  ]);
  return ok({ items, tags: (tags.data ?? []).map((t) => t.customer_tags) });
});
