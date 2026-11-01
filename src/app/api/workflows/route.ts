import { MANAGE_AI } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { WORKFLOW_TEMPLATES } from "@/lib/so/templates";
import { validateWorkflow, type WfNode } from "@/lib/so/workflow-core";
import { nodeSchema, TRIGGERS } from "@/lib/so/workflow-schema";

export const GET = route("workflows-list", async () => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, workflows: [] });
  const { data } = await c.db.from("workflows").select("id, name, description, trigger, enabled, branch_id, updated_at, template_key").eq("organization_id", c.s.org.id).order("updated_at", { ascending: false });
  const ids = (data ?? []).map((w) => w.id);
  const { data: ex } = ids.length ? await c.db.from("workflow_executions").select("workflow_id, status, started_at").in("workflow_id", ids).eq("organization_id", c.s.org.id).order("started_at", { ascending: false }).limit(500) : { data: [] };
  return ok({
    workflows: (data ?? []).map((w) => {
      const runs = (ex ?? []).filter((e) => e.workflow_id === w.id);
      return { ...w, runs: runs.length, failures: runs.filter((r) => r.status === "failed").length, lastRun: runs[0]?.started_at ?? null };
    }),
  });
});

/** Create from scratch or from a template (always created disabled so the owner reviews it). */
export const POST = route("workflows-create", async (req) => {
  const c = await orgContext(MANAGE_AI);
  const body = await parseJson(req, z.object({
    template_key: z.string().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    trigger: z.enum(TRIGGERS).optional(),
    branch_id: z.string().uuid().nullable().optional(),
    nodes: z.array(nodeSchema).max(50).optional(),
    locale: z.enum(["ar", "en"]).default("en"),
  }));
  if (c.demo) return ok({ demo: true });
  const tpl = body.template_key ? WORKFLOW_TEMPLATES[body.template_key] : null;
  if (body.template_key && !tpl) return fail(404, "not_found", "Unknown template");
  const nodes: WfNode[] = tpl
    ? tpl.nodes.map((n, i) => ({ key: n.key, kind: n.kind, type: n.type, config: n.config ?? {}, parent_key: n.parent_key ?? null, branch: n.branch ?? null, position: i }))
    : (body.nodes ?? []) as WfNode[];
  const errors = nodes.length ? validateWorkflow(nodes) : [];
  if (errors.length) return fail(422, "invalid_workflow", errors.join(", "));
  const name = body.name ?? (tpl ? tpl.name[body.locale] : "New automation");
  const trigger = (body.trigger ?? tpl?.trigger ?? "call_received") as (typeof TRIGGERS)[number];
  const { data: wf, error } = await c.db.from("workflows").insert({ organization_id: c.s.org.id, name, trigger, branch_id: body.branch_id ?? null, template_key: body.template_key ?? null, created_by: c.s.userId, enabled: false }).select("id").single();
  if (error) throw error;
  if (nodes.length) {
    const { error: nErr } = await c.db.from("workflow_nodes").insert(nodes.map((n) => ({ ...n, workflow_id: wf.id, organization_id: c.s.org.id })));
    if (nErr) throw nErr;
  }
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "workflow.created", targetType: "workflow", targetId: wf.id });
  return ok({ id: wf.id }, 201);
});
