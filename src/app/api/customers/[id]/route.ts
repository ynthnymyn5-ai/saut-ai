import { OPERATE } from "@/lib/rbac";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const schema = z.object({
  full_name: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Invalid phone number").optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  marketing_consent: z.boolean().optional(),
});

export const PATCH = route("customers-update", async (req, ctx) => {
  const s = await requireApiSession(OPERATE);
  const body = await parseJson(req, schema);
  if (s.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const sb = (await supabaseServer())!;
  const row = { ...body, email: body.email === "" ? null : body.email, phone: body.phone ? (body.phone.startsWith("+") ? "+" : "") + body.phone.replace(/\D/g, "") : undefined };
  const { data, error } = await sb.from("customers").update(row).eq("id", id).eq("organization_id", s.org.id).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") return fail(409, "duplicate", "Another customer already has this phone number");
    throw error;
  }
  if (!data) return fail(404, "not_found", "Customer not found");
  return ok({ ok: true });
});
