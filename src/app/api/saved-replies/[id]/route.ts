import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/http";
import { OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const DELETE = route("replies-delete", async (_req, { params }) => {
  const s = await requireApiSession(OPERATE);
  const id = z.string().uuid().parse((await params).id);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("saved_replies").delete().eq("id", id).eq("organization_id", s.org.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Reply not found");
  return ok({ ok: true });
}, { limit: 30 });
