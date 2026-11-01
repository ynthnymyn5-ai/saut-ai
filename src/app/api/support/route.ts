import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";
import { ticketSchema } from "@/lib/validation";

export const POST = route("support", async (req) => {
  const s = await requireApiSession();
  const t = await parseJson(req, ticketSchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("support_tickets").insert({ organization_id: s.org.id, opened_by: s.userId, subject: t.subject, body: t.body, priority: t.priority }).select("id").single();
  if (error) throw error;
  return ok({ id: data.id }, 201);
}, { limit: 5 });
