import { MANAGE_AI } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { runWorkflow } from "@/lib/so/events";
import { validateWorkflow, type WfNode } from "@/lib/so/workflow-core";
import { nodeSchema, TRIGGERS } from "@/lib/so/workflow-schema";

const uuid = z.string().uuid();

export const GET = route("workflow-get", async (_req, ctx) => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true });
  const id = uuid.parse((await ctx.params).id);
  const [{ data: wf }, { data: nodes }, { data: runs }] = await Promise.all([
    c.db.from("workflows").select("*").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle(),
    c.db.from("workflow_nodes").select("key, kind, type, config, parent_key, branch, position").eq("workflow_id", id).eq("organization_id", c.s.org.id).order("position"),
    c.db.from("workflow_executions").select("id, status, steps, error, started_at, finished_at, trigger_event").eq("workflow_id", id).eq("organization_id", c.s.org.id).order("started_at", { ascending: false }).limit(30),
  ]);
  if (!wf) return fail(404, "not_found", "Workflow not found");
  return ok({ workflow: wf, nodes: nodes ?? [], executions: runs ?? [] });
});

/** Save the whole graph (replace nodes) + name/trigger/branch. Bumps the version. */
export const PUT = route("workflow-save", async (req, ctx) => {
  const c = await orgContext(MANAGE_AI);
  const body = await parseJson(req, z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional(), trigger: z.enum(TRIGGERS), branch_id: z.string().uuid().nullable().optional(), nodes: z.array(nodeSchema).min(1).max(50) }));
  if (c.demo) return ok({ demo: true });
  const id = uuid.parse((await ctx.params).id);
  const errors = validateWorkflow(body.nodes as WfNode[]);
  if (errors.length) return fail(422, "invalid_workflow", errors.join(", "));
  const { data: wf } = await c.db.from("workflows").select("version").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!wf) return fail(404, "not_found", "Workflow not found");
  await c.db.from("workflows").update({ name: body.name, description: body.description ?? null, trigger: body.trigger, branch_id: body.branch_id ?? null, version: Number(wf.version) + 1 }).eq("id", id);
  await c.db.from("workflow_nodes").delete().eq("workflow_id", id).eq("organization_id", c.s.org.id);
  const { error } = await c.db.from("workflow_nodes").insert(body.nodes.map((n) => ({ ...n, workflow_id: id, organization_id: c.s.org.id })));
  if (error) throw error;
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "workflow.saved", targetType: "workflow", targetId: id });
  return ok({ ok: true, version: Number(wf.version) + 1 });
});

/** enable / disable / test (dry run: conditions evaluated, actions simulated, nothing written). */
export const POST = route("workflow-action", async (req, ctx) => {
  const c = await orgContext(MANAGE_AI);
  const body = await parseJson(req, z.object({ action: z.enum(["enable", "disable", "test"]), sample: z.record(z.unknown()).optional() }));
  if (c.demo) return ok({ demo: true });
  const id = uuid.parse((await ctx.params).id);
  const { data: wf } = await c.db.from("workflows").select("id, name, branch_id").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!wf) return fail(404, "not_found", "Workflow not found");
  if (body.action === "test") {
    const r = await runWorkflow(c.db, c.s.org.id, id, wf.name as string, { ...(body.sample ?? {}), test: true }, wf.branch_id as string | null, true);
    return ok({ status: r.status, log: r.log, dryRun: true });
  }
  await c.db.from("workflows").update({ enabled: body.action === "enable" }).eq("id", id);
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: `workflow.${body.action}d`, targetType: "workflow", targetId: id });
  return ok({ ok: true });
});

export const DELETE = route("workflow-delete", async (_req, ctx) => {
  const c = await orgContext(MANAGE_AI);
  if (c.demo) return ok({ demo: true });
  const id = uuid.parse((await ctx.params).id);
  await c.db.from("workflows").delete().eq("id", id).eq("organization_id", c.s.org.id);
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "workflow.deleted", targetType: "workflow", targetId: id });
  return ok({ ok: true });
});
