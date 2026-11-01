import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

/** Full message history of one conversation; marks it read for staff (operators only — viewers don't change state). */
export const GET = route("conversation-get", async (_req, { params }) => {
  const s = await requireApiSession(ANY_MEMBER);
  const id = idSchema.parse((await params).id);
  if (s.demo) return fail(404, "not_found", "Conversation not found");
  const sb = (await supabaseServer())!;
  const { data: c, error } = await sb.from("conversations")
    .select("id, channel, status, summary, sentiment, intent, started_at, ended_at, handled_by, assigned_user, transferred_to, customer_id, customers(full_name, phone, whatsapp_last_inbound_at), ai_employees(name)")
    .eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (error) throw error;
  if (!c) return fail(404, "not_found", "Conversation not found");
  const { data: msgs, error: mErr } = await sb.from("messages").select("id, role, content, created_at, delivery_status")
    .eq("conversation_id", id).eq("organization_id", s.org.id).order("created_at").limit(500);
  if (mErr) throw mErr;
  if (["owner", "admin", "manager", "employee", "agent"].includes(s.role ?? "")) {
    await sb.from("conversations").update({ staff_read_at: new Date().toISOString() }).eq("id", id).eq("organization_id", s.org.id);
  }
  const cu = c.customers as unknown as { full_name: string | null; phone: string | null; whatsapp_last_inbound_at: string | null } | null;
  return ok({
    conversation: {
      id: c.id, channel: c.channel, status: c.status, summary: c.summary, sentiment: c.sentiment, intent: c.intent, started_at: c.started_at, ended_at: c.ended_at,
      handledBy: c.handled_by, assignedUser: c.assigned_user, transferredTo: c.transferred_to,
      customer: { id: c.customer_id, name: cu?.full_name ?? null, phone: s.role === "viewer" ? null : cu?.phone ?? null },
      employee: (c.ai_employees as unknown as { name: string } | null)?.name ?? null,
      whatsappWindowOpen: !!cu?.whatsapp_last_inbound_at && Date.now() - new Date(cu.whatsapp_last_inbound_at).getTime() < 86400000,
    },
    messages: msgs ?? [],
  });
}, { limit: 120 });

const patch = z.object({
  assigned_user: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "completed"]).optional(),
}).refine((v) => v.assigned_user !== undefined || v.status !== undefined, "Nothing to update");

/** Assign to a team member (must belong to this organization) or reopen/close. */
export const PATCH = route("conversation-update", async (req, { params }) => {
  const s = await requireApiSession(OPERATE);
  const id = idSchema.parse((await params).id);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  if (b.assigned_user) {
    const { data: m } = await sb.from("memberships").select("id").eq("organization_id", s.org.id).eq("user_id", b.assigned_user).maybeSingle();
    if (!m) return fail(422, "invalid_input", "That person is not a member of this business");
  }
  const upd: Record<string, unknown> = {};
  if (b.assigned_user !== undefined) upd.assigned_user = b.assigned_user;
  if (b.status) { upd.status = b.status; if (b.status === "completed") upd.ended_at = new Date().toISOString(); }
  const { data, error } = await sb.from("conversations").update(upd).eq("id", id).eq("organization_id", s.org.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Conversation not found");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "conversation.updated", targetType: "conversation", targetId: id, metadata: upd });
  return ok({ ok: true });
}, { limit: 60 });
