import { MANAGE_AI } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { fail, ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { employeeSchema } from "@/lib/validation";

export const POST = route("employees-create", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const input = await parseJson(req, employeeSchema);
  if (s.demo) return ok({ demo: true });

  const sb = (await supabaseServer())!;
  const { data: emp, error } = await sb
    .from("ai_employees")
    .insert({
      organization_id: s.org.id,
      name: input.name,
      industry: input.industry,
      voice: input.voice,
      dialect: input.dialect,
      personality: input.personality,
      business_info: input.businessInfo,
      tasks: input.tasks,
      call_settings: { max_duration_sec: 600, transfer_number: input.transferNumber || null, after_hours: "take_message" },
      status: input.activate ? "active" : "draft",
      activated_at: input.activate ? new Date().toISOString() : null,
      created_by: s.userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.message.includes("PLAN_LIMIT")) return fail(402, "plan_limit", error.message.replace("PLAN_LIMIT: ", ""));
    throw error;
  }
  await sb.from("ai_employee_instructions").insert({ employee_id: emp.id, version: 1, content: input.instructions || buildSystemPrompt(input), created_by: s.userId });
  await audit({ orgId: s.org.id, actorId: s.userId, action: input.activate ? "employee.activated" : "employee.created", targetType: "ai_employee", targetId: emp.id });
  return ok({ id: emp.id }, 201);
});
