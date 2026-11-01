import { z } from "zod";
import { internalAuthorized } from "@/lib/so/internal-auth";
import { understand } from "@/lib/so/brain";
import { engineDb, setLiveStatus } from "@/lib/so/context";
import { emitEvent } from "@/lib/so/events";

export const runtime = "nodejs";

const schema = z.object({
  orgId: z.string().uuid(),
  employeeId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  status: z.enum(["listening", "thinking", "speaking", "waiting", "online", "needs_attention"]),
  detail: z.string().max(200).optional(),
  firstUtterance: z.string().max(2000).optional(),   // sent once per call by the bridge
  phone: z.string().max(20).optional(),
});

/** Voice bridge → live status (and the call_received event with intent). Shared-secret auth. */
export async function POST(req: Request) {
  if (!internalAuthorized(req)) return new Response("Forbidden", { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false }, { status: 422 });
  const db = engineDb();
  const { data: emp } = await db.from("ai_employees").select("id, branch_id").eq("id", p.data.employeeId).eq("organization_id", p.data.orgId).maybeSingle();
  if (!emp) return Response.json({ ok: false }, { status: 404 });
  await setLiveStatus(db, emp.id, p.data.status, p.data.detail);
  if (p.data.conversationId) await db.from("conversations").update({ last_activity_at: new Date().toISOString() }).eq("id", p.data.conversationId).eq("organization_id", p.data.orgId);
  if (p.data.firstUtterance) {
    const intent = await understand(p.data.firstUtterance);
    if (p.data.conversationId) await db.from("conversations").update({ intent: intent.kind, current_task: intent.kind }).eq("id", p.data.conversationId).eq("organization_id", p.data.orgId);
    await emitEvent(p.data.orgId, intent.kind === "complaint" ? "complaint" : "call_received", { conversation_id: p.data.conversationId, phone: p.data.phone, channel: "phone", intent: intent.kind, text: p.data.firstUtterance, booking: undefined }, { branchId: emp.branch_id as string | null });
  }
  return Response.json({ ok: true });
}
