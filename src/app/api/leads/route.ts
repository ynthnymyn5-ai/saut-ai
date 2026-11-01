import { OPERATE } from "@/lib/rbac";
import { z } from "zod";
import { ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { maskPhone } from "@/lib/so/context";
import { runTool } from "@/lib/so/engine";

/** Pipeline board data (branch-scoped). */
export const GET = route("leads-list", async () => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, leads: [] });
  let q = c.db.from("leads").select("id, stage, score, score_reasons, source, interest, estimated_value, next_follow_up_at, stage_changed_at, created_at, branch_id, customers(id, full_name, phone)").eq("organization_id", c.s.org.id).order("score", { ascending: false }).limit(500);
  if (c.branchIds) q = q.in("branch_id", c.branchIds);
  const { data } = await q;
  return ok({
    leads: (data ?? []).map((l) => {
      const cust = l.customers as unknown as { id: string; full_name: string | null; phone: string | null } | null;
      return { ...l, customers: undefined, customer: cust ? { id: cust.id, name: cust.full_name, phone: c.canSeeCustomer ? cust.phone : maskPhone(cust.phone) } : null };
    }),
  });
});

/** Manual lead creation goes through the same tool as the AI (validation, scoring, workflows). */
export const POST = route("leads-create", async (req) => {
  const c = await orgContext(OPERATE);
  const body = await parseJson(req, z.object({ phone: z.string(), name: z.string().optional(), interest: z.string().optional(), estimated_value: z.number().optional(), branch_id: z.string().uuid().nullable().optional() }));
  if (c.demo) return ok({ demo: true });
  const r = await runTool({ db: c.db, orgId: c.s.org.id, agent: null, actor: "human", userId: c.s.userId, branchId: body.branch_id ?? c.branchIds?.[0] ?? null, channel: "manual", test: false }, "create_lead", body);
  return r.ok ? ok(r, 201) : ok(r, 422);
});
