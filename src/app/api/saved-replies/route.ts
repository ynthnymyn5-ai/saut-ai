import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Saved replies staff insert into a conversation with one tap. */
export const GET = route("replies-list", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, replies: [] });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("saved_replies").select("id, title, body").eq("organization_id", s.org.id).order("title").limit(200);
  if (error) throw error;
  return ok({ replies: data ?? [] });
}, { limit: 60 });

export const POST = route("replies-create", async (req) => {
  const s = await requireApiSession(OPERATE);
  const b = await parseJson(req, z.object({ title: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(2000) }));
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("saved_replies").insert({ ...b, organization_id: s.org.id, created_by: s.userId }).select("id").single();
  if (error) throw error;
  return ok({ id: data.id }, 201);
}, { limit: 30 });
