import { requireApiSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { MANAGE_ORG } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The business's audit log (owners/admins; also restricted by RLS). Newest first, ?before=<id> to page. */
export const GET = route("audit-list", async (req) => {
  const s = await requireApiSession(MANAGE_ORG);
  if (s.demo) return ok({ demo: true, entries: [] });
  const before = Number(new URL(req.url).searchParams.get("before")) || null;
  const sb = (await supabaseServer())!;
  let q = sb.from("audit_logs").select("id, action, target_type, target_id, metadata, created_at, actor_id").eq("organization_id", s.org.id).order("id", { ascending: false }).limit(50);
  if (before) q = q.lt("id", before);
  const { data, error } = await q;
  if (error) throw error;
  const actors = [...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean))] as string[];
  const { data: people } = actors.length ? await sb.from("memberships").select("user_id, users(full_name, email)").eq("organization_id", s.org.id).in("user_id", actors) : { data: [] };
  const name = new Map((people ?? []).map((p) => { const u = p.users as unknown as { full_name: string | null; email: string } | null; return [p.user_id as string, u?.full_name ?? u?.email ?? null]; }));
  return ok({ entries: (data ?? []).map((e) => ({ id: e.id, action: e.action, target: e.target_type, at: e.created_at, actor: e.actor_id ? name.get(e.actor_id) ?? "Former member" : "System / AI" })) });
}, { limit: 30 });
