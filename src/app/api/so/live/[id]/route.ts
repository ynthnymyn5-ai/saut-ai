import { OPERATE } from "@/lib/rbac";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { providerStatus } from "@/lib/env";
import { fail, ok, parseJson, route } from "@/lib/http";
import { sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { inBranch, orgContext } from "@/lib/so/api";
import { setLiveStatus } from "@/lib/so/context";
import { twilioClient } from "@/lib/telephony/twilio";

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("reply"), text: z.string().trim().min(1).max(4096) }),
  z.object({ action: z.literal("take_over_call"), phone: z.string().regex(/^\+[0-9]{8,15}$/) }),
  z.object({ action: z.literal("assign_task"), title: z.string().trim().min(2).max(200), assigned_user: z.string().uuid().optional(), due_minutes: z.number().int().min(0).max(43200).optional() }),
  z.object({ action: z.literal("close"), resolution: z.string().max(500).optional() }),
  z.object({ action: z.literal("return_to_ai") }),
]);

/** Human operator actions. Every action is authorized, branch-checked and audited. */
export const POST = route("so-live-action", async (req, ctx) => {
  const c = await orgContext(OPERATE);
  const a = await parseJson(req, action);
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const { data: conv } = await c.db.from("conversations").select("id, channel, status, branch_id, employee_id, customer_id, customers(phone, whatsapp_last_inbound_at)").eq("id", id).eq("organization_id", c.s.org.id).maybeSingle();
  if (!conv || !inBranch(c.branchIds, conv.branch_id)) return fail(404, "not_found", "Conversation not found");
  const cust = conv.customers as unknown as { phone: string | null; whatsapp_last_inbound_at: string | null } | null;
  const now = new Date().toISOString();

  switch (a.action) {
    case "join":
      await c.db.from("conversations").update({ handled_by: "human", assigned_user: c.s.userId, current_task: "Human joined" }).eq("id", id);
      await setLiveStatus(c.db, conv.employee_id, "waiting", "Human operator joined");
      break;
    case "return_to_ai":
      await c.db.from("conversations").update({ handled_by: "ai", assigned_user: null, status: "active" }).eq("id", id);
      await setLiveStatus(c.db, conv.employee_id, "online");
      break;
    case "reply": {
      if (conv.channel === "phone") return fail(409, "unsupported", "Typed replies can't be spoken into a live call. Use Take over call.");
      if (conv.channel === "whatsapp") {
        if (!providerStatus("whatsapp").configured) return fail(503, "provider_not_configured", "WhatsApp is not configured", { variable: "WHATSAPP_ACCESS_TOKEN" });
        if (!cust?.phone) return fail(409, "no_phone", "Customer has no phone number");
        const open = cust.whatsapp_last_inbound_at && Date.now() - new Date(cust.whatsapp_last_inbound_at).getTime() < 86400000;
        if (!open) return fail(409, "window_closed", "The 24-hour WhatsApp window is closed. Send an approved template instead.");
        const r = await sendWhatsAppText(cust.phone, a.text);
        if (!r.ok) return fail(502, "provider_error", r.error);
        await c.db.from("messages").insert({ conversation_id: id, organization_id: c.s.org.id, role: "human", content: a.text, provider_message_id: r.id, delivery_status: "sent" });
      } else {
        await c.db.from("messages").insert({ conversation_id: id, organization_id: c.s.org.id, role: "human", content: a.text });
      }
      await c.db.from("conversations").update({ handled_by: "human", assigned_user: c.s.userId, last_activity_at: now }).eq("id", id);
      break;
    }
    case "take_over_call": {
      const { data: call } = await c.db.from("calls").select("provider_call_sid, status").eq("conversation_id", id).eq("organization_id", c.s.org.id).in("status", ["in_progress", "ringing"]).maybeSingle();
      if (!call?.provider_call_sid) return fail(409, "no_live_call", "There is no live call to take over.");
      await twilioClient().calls(call.provider_call_sid).update({ twiml: `<Response><Say>Connecting you to a team member.</Say><Dial>${a.phone}</Dial></Response>` });
      await c.db.from("calls").update({ status: "transferred" }).eq("provider_call_sid", call.provider_call_sid);
      await c.db.from("conversations").update({ handled_by: "human", assigned_user: c.s.userId, status: "transferred", transferred_to: a.phone.slice(0, -4) + "****" }).eq("id", id);
      await setLiveStatus(c.db, conv.employee_id, "online");
      break;
    }
    case "assign_task":
      await c.db.from("agent_tasks").insert({ organization_id: c.s.org.id, branch_id: conv.branch_id, conversation_id: id, customer_id: conv.customer_id, kind: "follow_up", title: a.title, assigned_user: a.assigned_user ?? c.s.userId, created_by_user: c.s.userId, due_at: a.due_minutes !== undefined ? new Date(Date.now() + a.due_minutes * 60000).toISOString() : null });
      break;
    case "close":
      await c.db.from("conversations").update({ status: "completed", ended_at: now, current_task: a.resolution ?? "Closed by staff" }).eq("id", id);
      await c.db.from("agent_tasks").update({ status: "completed", completed_at: now }).eq("conversation_id", id).eq("organization_id", c.s.org.id).in("status", ["pending", "in_progress"]);
      await setLiveStatus(c.db, conv.employee_id, "online");
      break;
  }
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: `live.${a.action}`, targetType: "conversation", targetId: id });
  return ok({ ok: true });
}, { limit: 60 });
