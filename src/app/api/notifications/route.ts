import { z } from "zod";
import { ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";

export const dynamic = "force-dynamic";

export const GET = route("notifications", async () => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, items: [] });
  const owner = c.s.role === "owner" || c.s.role === "admin";
  let q = c.db.from("notifications").select("id, kind, title, body, link, read_at, created_at").eq("organization_id", c.s.org.id).order("created_at", { ascending: false }).limit(40);
  q = owner ? q.or(`user_id.eq.${c.s.userId},user_id.is.null`) : q.eq("user_id", c.s.userId);
  const { data } = await q;
  return ok({ items: data ?? [], unread: (data ?? []).filter((n) => !n.read_at).length });
}, { limit: 60 });

export const POST = route("notifications-read", async (req) => {
  const c = await orgContext();
  const { ids } = await parseJson(req, z.object({ ids: z.array(z.string().uuid()).max(100) }));
  if (c.demo) return ok({ demo: true });
  const owner = c.s.role === "owner" || c.s.role === "admin";
  let q = c.db.from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", c.s.org.id).in("id", ids);
  q = owner ? q.or(`user_id.eq.${c.s.userId},user_id.is.null`) : q.eq("user_id", c.s.userId);
  await q;
  return ok({ ok: true });
});
