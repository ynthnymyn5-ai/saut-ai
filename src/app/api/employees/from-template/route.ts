import { MANAGE_AI } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { INDUSTRY_TEMPLATES, ROLE_TEMPLATES, WORKFLOW_TEMPLATES } from "@/lib/so/templates";
import { DIALECTS, VOICES } from "@/lib/validation";

/**
 * Create an AI employee from an industry + role template. The employee starts as a draft,
 * suggested workflows are created DISABLED, and everything stays editable.
 */
export const POST = route("employees-from-template", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const b = await parseJson(req, z.object({
    industry: z.string(), role: z.enum(["receptionist", "sales", "support", "manager", "booking"]),
    name: z.string().trim().min(1).max(60), businessName: z.string().trim().min(2).max(120),
    dialect: z.enum(DIALECTS).default("kuwaiti"), voice: z.enum(VOICES).default("coral"),
    branch_id: z.string().uuid().nullable().optional(), installWorkflows: z.boolean().default(true), locale: z.enum(["ar", "en"]).default("ar"),
  }));
  if (s.demo) return ok({ demo: true });
  const ind = INDUSTRY_TEMPLATES[b.industry];
  if (!ind) return fail(404, "not_found", "Unknown industry template");
  const role = ROLE_TEMPLATES[b.role];
  const sb = (await supabaseServer())!;
  const faqs = ind.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  const { data: emp, error } = await sb.from("ai_employees").insert({
    organization_id: s.org.id, branch_id: b.branch_id ?? null, name: b.name, role: b.role, template_key: `${ind.key}:${b.role}`,
    industry: ind.industry, voice: b.voice, dialect: b.dialect, personality: ind.personality, safety_profile: ind.safetyProfile,
    business_info: { businessName: b.businessName, description: "", address: "", hours: "", faqs }, tasks: ["answer_calls", "answer_faq", "summarize", "escalate"],
    status: "draft", created_by: s.userId,
  }).select("id").single();
  if (error) {
    if (error.message.includes("PLAN_LIMIT")) return fail(402, "plan_limit", error.message.replace("PLAN_LIMIT: ", ""));
    throw error;
  }
  await sb.from("ai_employee_instructions").insert({ employee_id: emp.id, version: 1, content: `${ind.instructions}\n\n${role.instructions}`, created_by: s.userId });
  await sb.from("agent_tools").insert([...new Set([...role.tools, ...ind.extraTools, "remember_preference"])].map((k) => ({ agent_id: emp.id, tool_key: k, enabled: true })));
  if (ind.permissions) await sb.from("agent_permissions").insert(Object.entries(ind.permissions).map(([permission, effect]) => ({ agent_id: emp.id, permission, effect })));

  const created: string[] = [];
  if (b.installWorkflows) {
    const { data: existing } = await sb.from("workflows").select("template_key").eq("organization_id", s.org.id);
    for (const key of ind.workflows.filter((k) => !(existing ?? []).some((w) => w.template_key === k))) {
      const t = WORKFLOW_TEMPLATES[key];
      if (!t) continue;
      const { data: wf } = await sb.from("workflows").insert({ organization_id: s.org.id, branch_id: b.branch_id ?? null, name: t.name[b.locale], trigger: t.trigger, template_key: key, enabled: false, created_by: s.userId }).select("id").single();
      if (wf) {
        await sb.from("workflow_nodes").insert(t.nodes.map((n, i) => ({ workflow_id: wf.id, organization_id: s.org.id, key: n.key, kind: n.kind, type: n.type, config: n.config ?? {}, parent_key: n.parent_key ?? null, branch: n.branch ?? null, position: i })));
        created.push(key);
      }
    }
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "employee.created_from_template", targetType: "ai_employee", targetId: emp.id, metadata: { template: `${ind.key}:${b.role}`, workflows: created } });
  return ok({ id: emp.id, workflows: created, integrations: ind.integrations }, 201);
});
