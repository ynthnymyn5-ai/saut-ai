/**
 * Automation Studio runtime core — pure and dependency-injected so it is unit-testable.
 *
 * A workflow is a tree: root nodes run in `position` order. A condition node evaluates
 * against the event context and runs its `yes` or `no` children (also in position order).
 * Actions may add facts to the context (e.g. customer_id) for later steps.
 */
export type WorkflowTrigger = "call_received" | "missed_call" | "whatsapp_message" | "lead_created" | "appointment_created" | "appointment_canceled" | "complaint" | "payment_confirmed" | "ticket_created";

export interface WfNode { key: string; kind: "condition" | "action"; type: string; config: Record<string, unknown>; parent_key: string | null; branch: "yes" | "no" | null; position: number; }
export type WfContext = Record<string, unknown> & { intent?: string; channel?: string; customer_is_new?: boolean; tags?: string[]; within_hours?: boolean; text?: string };
export interface StepLog { key: string; type: string; kind: string; outcome: "yes" | "no" | "ok" | "failed" | "skipped" | "waiting_confirmation"; note?: string; at: string; }

export const CONDITIONS = ["intent_is", "channel_is", "customer_is_new", "has_tag", "within_hours", "text_contains", "lead_score_at_least"] as const;
export const ACTIONS = ["identify_customer", "check_availability", "book_appointment", "save_customer", "send_whatsapp", "notify_owner", "create_lead", "create_task", "tag_customer", "escalate_to_human", "update_lead_stage"] as const;

export const TRIGGER_CONTEXT: Record<WorkflowTrigger, string[]> = {
  call_received: ["intent", "channel", "customer_is_new", "within_hours", "text"],
  missed_call: ["channel", "customer_is_new", "within_hours"],
  whatsapp_message: ["intent", "channel", "customer_is_new", "tags", "within_hours", "text"],
  lead_created: ["lead_score", "channel", "tags"],
  appointment_created: ["channel", "tags"],
  appointment_canceled: ["channel", "tags"],
  complaint: ["channel", "tags", "text"],
  payment_confirmed: ["tags"],
  ticket_created: ["text"],
};

export function evaluateCondition(type: string, config: Record<string, unknown>, ctx: WfContext): boolean {
  switch (type) {
    case "intent_is": return Array.isArray(config.values) ? (config.values as string[]).includes(String(ctx.intent)) : ctx.intent === config.value;
    case "channel_is": return ctx.channel === config.value;
    case "customer_is_new": return Boolean(ctx.customer_is_new) === (config.value !== false);
    case "has_tag": return (ctx.tags ?? []).map((t) => t.toLowerCase()).includes(String(config.value ?? "").toLowerCase());
    case "within_hours": return Boolean(ctx.within_hours) === (config.value !== false);
    case "text_contains": {
      const words = String(config.value ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
      const text = String(ctx.text ?? "").toLowerCase();
      return words.some((w) => text.includes(w));
    }
    case "lead_score_at_least": return Number(ctx.lead_score ?? 0) >= Number(config.value ?? 0);
    default: throw new Error(`Unknown condition ${type}`);
  }
}

export function childrenOf(nodes: WfNode[], parent: string | null, branch: "yes" | "no" | null) {
  return nodes.filter((n) => n.parent_key === parent && (parent === null || n.branch === branch)).sort((a, b) => a.position - b.position);
}

/** Static validation used by the editor and the API before saving. */
export function validateWorkflow(nodes: WfNode[]) {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const n of nodes) {
    if (keys.has(n.key)) errors.push(`duplicate:${n.key}`);
    keys.add(n.key);
    if (n.kind === "condition" && !(CONDITIONS as readonly string[]).includes(n.type)) errors.push(`unknown_condition:${n.type}`);
    if (n.kind === "action" && !(ACTIONS as readonly string[]).includes(n.type)) errors.push(`unknown_action:${n.type}`);
    if (n.parent_key) {
      const p = nodes.find((x) => x.key === n.parent_key);
      if (!p) errors.push(`missing_parent:${n.key}`);
      else if (p.kind !== "condition") errors.push(`parent_not_condition:${n.key}`);
      if (!n.branch) errors.push(`missing_branch:${n.key}`);
    }
  }
  if (!nodes.some((n) => n.kind === "action")) errors.push("no_actions");
  if (nodes.length > 50) errors.push("too_many_nodes");
  return errors;
}

export type ActionExecutor = (node: WfNode, ctx: WfContext) => Promise<{ outcome: "ok" | "failed" | "waiting_confirmation"; note?: string; ctx?: Partial<WfContext> }>;

/** Walks the tree. Stops on the first failed action (remaining steps are logged as skipped). */
export async function runWorkflowTree(nodes: WfNode[], ctx: WfContext, exec: ActionExecutor, now = () => new Date().toISOString()) {
  const log: StepLog[] = [];
  let failed = false;
  let waiting = false;
  const visit = async (list: WfNode[]) => {
    for (const n of list) {
      if (failed) { log.push({ key: n.key, type: n.type, kind: n.kind, outcome: "skipped", at: now() }); continue; }
      if (n.kind === "condition") {
        let yes = false;
        try { yes = evaluateCondition(n.type, n.config, ctx); } catch (e) { failed = true; log.push({ key: n.key, type: n.type, kind: n.kind, outcome: "failed", note: (e as Error).message, at: now() }); continue; }
        log.push({ key: n.key, type: n.type, kind: n.kind, outcome: yes ? "yes" : "no", at: now() });
        await visit(childrenOf(nodes, n.key, yes ? "yes" : "no"));
      } else {
        try {
          const r = await exec(n, ctx);
          if (r.ctx) Object.assign(ctx, r.ctx);
          if (r.outcome === "failed") failed = true;
          if (r.outcome === "waiting_confirmation") waiting = true;
          log.push({ key: n.key, type: n.type, kind: n.kind, outcome: r.outcome, note: r.note, at: now() });
        } catch (e) {
          failed = true;
          log.push({ key: n.key, type: n.type, kind: n.kind, outcome: "failed", note: (e as Error).message, at: now() });
        }
      }
    }
  };
  await visit(childrenOf(nodes, null, null));
  return { status: failed ? "failed" : waiting ? "waiting_confirmation" : "succeeded", log } as const;
}
