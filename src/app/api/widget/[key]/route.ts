import { after } from "next/server";
import { z } from "zod";
import { providerStatus } from "@/lib/env";
import { fail, ok, route } from "@/lib/http";
import { engineDb, notify } from "@/lib/so/context";
import { aiAllowance } from "@/lib/so/usage";
import { loadWidget } from "@/lib/widget";
import { isSessionId } from "@/lib/widget-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Only the widget page (same origin) may call this API; browsers send Sec-Fetch-Site. */
const sameOrigin = (req: Request) => { const s = req.headers.get("sec-fetch-site"); return !s || s === "same-origin"; };

async function conversationFor(db: ReturnType<typeof engineDb>, orgId: string, session: string, create: boolean) {
  const { data: c } = await db.from("conversations").select("id, handled_by, customer_id, branch_id, status").eq("organization_id", orgId).eq("web_session_id", session).maybeSingle();
  if (c || !create) return c;
  const { data: org } = await db.from("organizations").select("retention_days").eq("id", orgId).single();
  const { data: created, error } = await db.from("conversations").insert({
    organization_id: orgId, channel: "web_chat", web_session_id: session,
    expires_at: new Date(Date.now() + Number(org?.retention_days ?? 90) * 86400000).toISOString(),
  }).select("id, handled_by, customer_id, branch_id, status").single();
  if (error?.code === "23505") return (await db.from("conversations").select("id, handled_by, customer_id, branch_id, status").eq("organization_id", orgId).eq("web_session_id", session).single()).data; // two tabs raced
  if (error) throw error;
  await db.from("usage_records").insert({ organization_id: orgId, metric: "conversations", quantity: 1, period_start: new Date().toISOString().slice(0, 10) });
  return created;
}

/** Messages of this visitor's conversation (for staff replies to show up in the widget). */
export const GET = route("widget-poll", async (req, { params }) => {
  const { key } = await params;
  const u = new URL(req.url);
  const session = u.searchParams.get("session") ?? "";
  const after = u.searchParams.get("after");
  if (!isSessionId(session) || !sameOrigin(req)) return fail(400, "invalid_input", "Invalid session");
  const db = engineDb();
  const w = await loadWidget(db, key);
  if (!w) return fail(404, "not_found", "Widget not found");
  const c = await conversationFor(db, w.orgId, session, false);
  if (!c) return ok({ messages: [] });
  let q = db.from("messages").select("id, role, content, created_at").eq("conversation_id", c.id).eq("organization_id", w.orgId).in("role", ["customer", "ai", "human"]).order("created_at").limit(100);
  if (after && !Number.isNaN(Date.parse(after))) q = q.gt("created_at", after);
  const { data } = await q;
  return ok({ messages: data ?? [] });
}, { limit: 40 });

const postSchema = z.object({ session: z.string().refine(isSessionId), text: z.string().trim().min(1).max(2000), lang: z.enum(["ar", "en"]).default("ar") });

/** Visitor sends a message → the AI employee replies (or staff are alerted when the AI can't). */
export const POST = route("widget-message", async (req, { params }) => {
  const { key } = await params;
  if (!sameOrigin(req)) return fail(403, "forbidden", "Forbidden");
  const b = postSchema.parse(await req.json().catch(() => ({})));
  const db = engineDb();
  const w = await loadWidget(db, key);
  if (!w) return fail(404, "not_found", "Widget not found");
  const conv = await conversationFor(db, w.orgId, b.session, true);
  if (!conv) return fail(500, "internal_error", "Could not start the conversation");
  if (conv.status === "completed") await db.from("conversations").update({ status: "active", ended_at: null }).eq("id", conv.id);
  const now = new Date().toISOString();
  await db.from("conversations").update({ last_activity_at: now }).eq("id", conv.id);

  const allowance = conv.handled_by === "human" ? { ok: true as const } : await aiAllowance(db, w.orgId, "web_chat");
  if (conv.handled_by === "human" || !providerStatus("openai").configured || !allowance.ok) {
    const { data: m } = await db.from("messages").insert({ conversation_id: conv.id, organization_id: w.orgId, role: "customer", content: b.text }).select("id, created_at").single();
    if (conv.handled_by !== "human") {
      const why = !allowance.ok ? " (AI paused: plan allowance)" : !providerStatus("openai").configured ? " (AI not configured)" : "";
      await notify(db, { orgId: w.orgId, kind: "task", title: `Website chat needs a reply${why}`, body: b.text.slice(0, 200), link: "/dashboard/conversations" });
    }
    return ok({ reply: null, queued: true, customerMessageId: m?.id, at: m?.created_at });
  }

  const { handleMessage } = await import("@/lib/so/orchestrator");
  const r = await handleMessage(db, { orgId: w.orgId, channel: "web_chat", text: b.text, conversationId: conv.id, customerId: (conv.customer_id as string | null) ?? undefined, branchId: conv.branch_id as string | null, test: false });
  const { data: last } = await db.from("messages").select("id, role, created_at").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(2);
  const ai = last?.find((m) => m.role === "ai"), cm = last?.find((m) => m.role === "customer");
  if (r.transfer) after(() => notify(db, { orgId: w.orgId, kind: "task", title: "Website visitor asked for a person", body: b.text.slice(0, 200), link: "/dashboard/conversations" }));
  return ok({ reply: r.reply, replyId: ai?.id, customerMessageId: cm?.id, at: ai?.created_at ?? now, transfer: r.transfer });
}, { limit: 20 });
