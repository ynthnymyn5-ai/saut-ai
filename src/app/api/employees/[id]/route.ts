import { MANAGE_AI } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

import { PERMISSIONS } from "@/lib/so/permissions";
import { TOOLS } from "@/lib/so/tools";
import { DIALECTS, VOICES } from "@/lib/validation";
import { hoursSchema } from "@/lib/so/workflow-schema";

/** Every field is optional; the original `{ status }` body keeps working unchanged. */
const patch = z.object({
  status: z.enum(["active", "paused", "draft"]).optional(),
  name: z.string().trim().min(1).max(60).optional(),
  role: z.enum(["receptionist", "sales", "support", "manager", "booking", "custom"]).optional(),
  branch_id: z.string().uuid().nullable().optional(),
  avatar_url: z.string().url().max(500).nullable().optional(),
  voice: z.enum(VOICES).optional(),
  dialect: z.enum(DIALECTS).optional(),
  language: z.enum(["ar", "en", "ar+en"]).optional(),
  speaking_rate: z.number().min(0.7).max(1.3).optional(),
  personality: z.object({ warmth: z.number().int().min(0).max(100), formality: z.number().int().min(0).max(100), pace: z.number().int().min(0).max(100), tone: z.enum(["friendly", "professional", "luxury", "energetic"]), general_chat: z.boolean().optional() }).optional(),
  working_hours: z.object({ tz: z.string().max(60), days: hoursSchema }).optional(),
  instructions: z.string().max(20000).optional(),
  business_info: z.object({ businessName: z.string().trim().min(2).max(120), description: z.string().max(2000).default(""), address: z.string().max(300).default(""), hours: z.string().max(300).default(""), faqs: z.string().max(8000).default("") }).optional(),
  tools: z.array(z.object({ key: z.string(), enabled: z.boolean() })).max(40).optional(),
  permissions: z.array(z.object({ permission: z.enum(PERMISSIONS), effect: z.enum(["allow", "confirm", "deny"]) })).max(40).optional(),
});
const uuid = z.string().uuid();

export const PATCH = route("employees-update", async (req, ctx) => {
  const s = await requireApiSession(MANAGE_AI);
  const { tools, permissions, instructions, status, ...fields } = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const id = uuid.parse((await ctx.params).id);
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("ai_employees")
    .update({ ...fields, ...(status ? { status, activated_at: status === "active" ? new Date().toISOString() : undefined } : {}), ...(status === "paused" ? { live_status: "offline" } : {}) })
    .eq("id", id).eq("organization_id", s.org.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Employee not found");
  if (tools) {
    const valid = tools.filter((t) => TOOLS.some((x) => x.key === t.key));
    await sb.from("agent_tools").delete().eq("agent_id", id);
    if (valid.length) await sb.from("agent_tools").insert(valid.map((t) => ({ agent_id: id, tool_key: t.key, enabled: t.enabled })));
  }
  if (permissions) {
    await sb.from("agent_permissions").delete().eq("agent_id", id);
    if (permissions.length) await sb.from("agent_permissions").insert(permissions.map((p) => ({ agent_id: id, ...p })));
  }
  if (instructions !== undefined) {
    const { data: cur } = await sb.from("ai_employee_instructions").select("version").eq("employee_id", id).order("version", { ascending: false }).limit(1).maybeSingle();
    await sb.from("ai_employee_instructions").update({ is_current: false }).eq("employee_id", id).eq("is_current", true);
    await sb.from("ai_employee_instructions").insert({ employee_id: id, version: Number(cur?.version ?? 0) + 1, content: instructions, created_by: s.userId });
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: status ? `employee.${status}` : "employee.updated", targetType: "ai_employee", targetId: id, metadata: { fields: Object.keys(fields), tools: !!tools, permissions: !!permissions } });
  return ok({ ok: true });
});

export const DELETE = route("employees-delete", async (_req, ctx) => {
  const s = await requireApiSession(MANAGE_AI);
  if (s.demo) return ok({ demo: true });
  const id = uuid.parse((await ctx.params).id);
  const sb = (await supabaseServer())!;
  const { error } = await sb.from("ai_employees").delete().eq("id", id).eq("organization_id", s.org.id);
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "employee.deleted", targetType: "ai_employee", targetId: id });
  return ok({ ok: true });
});
