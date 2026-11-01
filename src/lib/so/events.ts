import "server-only";
import { reportError } from "@/lib/monitoring";
import { engineDb, notify, type DB } from "./context";
import { runTool } from "./engine";
import { runWorkflowTree, type WfContext, type WfNode, type WorkflowTrigger } from "./workflow-core";

/**
 * Event bus → Automation Studio. Every enabled workflow for the trigger (and branch) runs;
 * each run is recorded in workflow_executions with a step log, and failures notify owners.
 */
export async function emitEvent(orgId: string, trigger: WorkflowTrigger, payload: Record<string, unknown>, opts: { branchId?: string | null } = {}) {
  let db: DB;
  try { db = engineDb(); } catch { return []; }
  let q = db.from("workflows").select("id, name, branch_id").eq("organization_id", orgId).eq("trigger", trigger).eq("enabled", true);
  if (opts.branchId) q = q.or(`branch_id.is.null,branch_id.eq.${opts.branchId}`);
  const { data: wfs } = await q;
  const results = [];
  for (const wf of wfs ?? []) results.push(await runWorkflow(db, orgId, wf.id as string, wf.name as string, { ...payload, trigger }, opts.branchId ?? null));
  return results;
}

export async function runWorkflow(db: DB, orgId: string, workflowId: string, name: string, event: Record<string, unknown>, branchId: string | null, dryRun = false) {
  const { data: nodes } = await db.from("workflow_nodes").select("key, kind, type, config, parent_key, branch, position").eq("workflow_id", workflowId).eq("organization_id", orgId);
  const { data: exec } = dryRun ? { data: null } : await db.from("workflow_executions").insert({ workflow_id: workflowId, organization_id: orgId, trigger_event: event }).select("id").single();
  const ctx: WfContext = { ...event };
  const toolCtx = () => ({ db: dryRun ? null : db, orgId, agent: null, actor: "workflow" as const, branchId, conversationId: ctx.conversation_id as string | undefined, customerId: ctx.customer_id as string | undefined, channel: ctx.channel as string | undefined, test: dryRun });

  const out = await runWorkflowTree((nodes ?? []) as WfNode[], ctx, async (n) => {
    const c = n.config as Record<string, unknown>;
    const ph = ctx.phone as string | undefined;
    const call = async (tool: string, args: Record<string, unknown>) => {
      const r = await runTool(toolCtx(), tool, args);
      if (dryRun) return { outcome: "ok" as const, note: `Dry run: ${tool} would run with ${JSON.stringify(args).slice(0, 120)}`, data: undefined };
      return { outcome: r.pending ? ("waiting_confirmation" as const) : r.ok ? ("ok" as const) : ("failed" as const), note: r.note, data: r.data };
    };
    switch (n.type) {
      case "identify_customer": {
        if (!ph) return { outcome: "ok", note: "No phone in event; skipped." };
        const r = await call("lookup_customer", { phone: ph });
        const d = r.data as { is_new?: boolean; customer?: { id: string; tags?: string[] } } | undefined;
        return { ...r, ctx: { customer_is_new: d?.is_new ?? true, customer_id: d?.customer?.id ?? ctx.customer_id, tags: d?.customer?.tags ?? [] } };
      }
      case "check_availability": {
        const date = (ctx.requested_date as string) ?? new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
        const r = await call("check_availability", { date });
        return { ...r, ctx: { available_slots: r.data } };
      }
      case "book_appointment": {
        const b = ctx.booking as Record<string, unknown> | undefined;
        if (!b) return { outcome: "ok", note: "No booking details in this event; the AI employee books during the conversation." };
        return call("book_appointment", b);
      }
      case "save_customer": return ph ? call("save_customer", { phone: ph, name: ctx.customer_name as string | undefined }) : { outcome: "ok", note: "No phone; skipped." };
      case "send_whatsapp": return ph ? call("send_whatsapp", { to: ph, template: c.template as string | undefined, text: c.text as string | undefined, template_params: c.params as string[] | undefined }) : { outcome: "failed", note: "No phone number to message." };
      case "create_lead": return ph ? call("create_lead", { phone: ph, interest: (ctx.text as string)?.slice(0, 300) }) : { outcome: "failed", note: "No phone number for lead." };
      case "update_lead_stage": return ctx.lead_id ? call("update_lead_stage", { lead_id: ctx.lead_id, stage: c.stage }) : { outcome: "failed", note: "No lead in event." };
      case "create_task": return call("create_task", { title: String(c.title ?? name), kind: c.kind ?? "follow_up", due_minutes: c.due_minutes, delegate_to_role: c.delegate_to_role, details: ph ? `Customer: ${ph}` : undefined });
      case "escalate_to_human": return call("transfer_to_human", { reason: String(c.reason ?? name) });
      case "tag_customer": {
        if (!ctx.customer_id) return { outcome: "failed", note: "No customer identified yet (add Identify customer first)." };
        const { tagCustomer } = await import("./crm");
        if (!dryRun) await tagCustomer(db, orgId, ctx.customer_id as string, String(c.value ?? "Tagged"));
        return { outcome: "ok", note: `Tagged ${c.value}.` };
      }
      case "notify_owner":
        if (!dryRun) await notify(db, { orgId, kind: "task", title: String(c.title ?? name), body: ph ? `Customer ${ph}` : undefined, link: "/dashboard/command" });
        return { outcome: "ok", note: "Owner notified." };
      default: return { outcome: "failed", note: `Unsupported action ${n.type}` };
    }
  });

  if (exec) {
    await db.from("workflow_executions").update({ status: out.status, steps: out.log, error: out.status === "failed" ? out.log.find((s) => s.outcome === "failed")?.note ?? "failed" : null, finished_at: new Date().toISOString() }).eq("id", exec.id);
    if (out.status === "failed") {
      await notify(db, { orgId, kind: "workflow_failed", title: `Automation failed: ${name}`, body: out.log.find((s) => s.outcome === "failed")?.note, link: `/dashboard/automations?wf=${workflowId}` }).catch((e) => reportError(e));
    }
  }
  return { workflowId, executionId: exec?.id as string | undefined, ...out };
}
