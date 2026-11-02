import { z } from "zod";
import { fail, ok, parseJson, route } from "@/lib/http";
import { engineDb, notify } from "@/lib/so/context";
import { loadWidget } from "@/lib/widget";
import { isSessionId } from "@/lib/widget-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ session: z.string().refine(isSessionId), rating: z.union([z.literal(1), z.literal(-1)]), comment: z.string().trim().max(500).optional() });

/** Visitor rates their chat 👍 / 👎 (optionally with a comment). A 👎 alerts staff. */
export const POST = route("widget-rate", async (req, { params }) => {
  const { key } = await params;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return fail(403, "forbidden", "Forbidden");
  const b = await parseJson(req, schema);
  const db = engineDb();
  const w = await loadWidget(db, key);
  if (!w) return fail(404, "not_found", "Widget not found");
  const { data: c } = await db.from("conversations").select("id, rating").eq("organization_id", w.orgId).eq("web_session_id", b.session).maybeSingle();
  if (!c) return fail(404, "not_found", "Conversation not found");
  await db.from("conversations").update({ rating: b.rating, rating_comment: b.comment ?? null, rated_at: new Date().toISOString() }).eq("id", c.id);
  if (b.rating === -1 && c.rating !== -1) {
    await notify(db, { orgId: w.orgId, kind: "task", title: "A website visitor wasn't happy with a chat 👎", body: b.comment?.slice(0, 200) || "No comment left.", link: "/dashboard/conversations" });
  }
  return ok({ ok: true });
}, { limit: 10 });
