import { z } from "zod";
import { fail, ok, route } from "@/lib/http";
import { inBranch, orgContext } from "@/lib/so/api";
import { computeMetrics, periodRange } from "@/lib/so/bi";
import { PERMISSIONS, resolveEffect, type AgentRole } from "@/lib/so/permissions";
import { ROLE_TEMPLATES } from "@/lib/so/templates";
import { TOOLS } from "@/lib/so/tools";

export const dynamic = "force-dynamic";

/** Agent profile data: config, assigned tools, effective permissions, usage stats, history, activity log. */
export const GET = route("employee-activity", async (_req, ctx) => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: a } = await c.db.from("ai_employees").select("id, name, role, branch_id, status, live_status, live_detail, live_updated_at, speaking_rate, language, dialect, voice, safety_profile, working_hours, template_key, personality, business_info").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!a || !inBranch(c.branchIds, a.branch_id)) return fail(404, "not_found", "Employee not found");
  const [tools, perms, execs, convs, instr] = await Promise.all([
    c.db.from("agent_tools").select("tool_key, enabled").eq("agent_id", id),
    c.db.from("agent_permissions").select("permission, effect").eq("agent_id", id),
    c.db.from("agent_executions").select("id, tool_key, status, error, started_at, duration_ms, attempts, test_mode").eq("agent_id", id).eq("organization_id", c.s.org.id).order("started_at", { ascending: false }).limit(50),
    c.db.from("conversations").select("id, channel, status, summary, started_at, intent").eq("employee_id", id).eq("organization_id", c.s.org.id).order("started_at", { ascending: false }).limit(30),
    c.db.from("ai_employee_instructions").select("content, version").eq("employee_id", id).eq("is_current", true).maybeSingle(),
  ]);
  const role = a.role as AgentRole;
  const assigned = tools.data?.length ? tools.data : (role === "custom" ? [] : ROLE_TEMPLATES[role].tools.map((k) => ({ tool_key: k, enabled: true })));
  const overrides = Object.fromEntries((perms.data ?? []).map((p) => [p.permission, p.effect]));
  const [from, to] = periodRange("this_month");
  const m = await computeMetrics(c.db, c.s.org.id, from, to, null);
  return ok({
    agent: a,
    instructions: instr.data?.content ?? "",
    tools: TOOLS.map((t) => ({ key: t.key, permission: t.permission, description: t.description, enabled: assigned.some((x) => x.tool_key === t.key && x.enabled) })),
    permissions: PERMISSIONS.map((p) => ({ permission: p, override: overrides[p] ?? null, effective: resolveEffect(role, p, overrides) })),
    stats: m.agents.find((x) => x.id === id) ?? null,
    executions: execs.data ?? [],
    conversations: convs.data ?? [],
  });
});
