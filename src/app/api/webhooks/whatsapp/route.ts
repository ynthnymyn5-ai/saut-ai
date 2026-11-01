import { aiAllowance } from "@/lib/so/usage";
import crypto from "node:crypto";
import { providerStatus } from "@/lib/env";
import { inboundText, splitWhatsAppText, type WaInbound } from "@/lib/messaging/wa-core";
import { markWhatsAppRead, sendWhatsAppText, transcribeVoiceNote } from "@/lib/messaging/whatsapp";
import { reportError } from "@/lib/monitoring";
import { engineDb, notify, type DB } from "@/lib/so/context";
import { emitEvent } from "@/lib/so/events";
import { handleMessage } from "@/lib/so/orchestrator";

export const runtime = "nodejs";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && u.searchParams.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(u.searchParams.get("hub.challenge") ?? "");
  }
  return new Response("Forbidden", { status: 403 });
}

type WaValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WaInbound[];
  statuses?: { id: string; status: "sent" | "delivered" | "read" | "failed"; errors?: { title?: string }[] }[];
};

/**
 * Incoming WhatsApp messages & delivery statuses (signature-verified with X-Hub-Signature-256).
 * Message flow: identify org by connected number (phone_number_id, then display number) →
 * identify/create customer (opens the 24 h window) → conversation → read receipt + typing →
 * voice notes transcribed → workflows → SO orchestrator reply (only if AI is configured and
 * no human has taken over) → reply sent (split if long) and recorded only when Meta accepts it.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return new Response("Invalid signature", { status: 401 });

  let db: DB;
  try { db = engineDb(); } catch { return new Response("ok"); }
  try {
    const body = JSON.parse(raw) as { entry?: { changes?: { value: WaValue }[] }[] };
    for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) await handleValue(db, ch.value);
  } catch (e) {
    reportError(e, { scope: "whatsapp-webhook" });
  }
  return new Response("ok"); // always 200 so Meta doesn't retry a payload we've logged as failed
}

async function handleValue(db: DB, v: WaValue) {
  for (const st of v.statuses ?? []) {
    await db.from("messages").update({ delivery_status: st.status }).eq("provider_message_id", st.id);
    if (st.status === "failed") reportError(new Error(`WhatsApp delivery failed: ${st.errors?.[0]?.title ?? "unknown"}`), { scope: "whatsapp-status" });
  }
  if (!v.messages?.length) return;

  // Single-number deployments map to the org whose WhatsApp integration is connected with this display number.
  const display = (v.metadata?.display_phone_number ?? "").replace(/\D/g, "");
  const phoneNumberId = v.metadata?.phone_number_id ?? "";
  const { data: integs } = await db.from("integrations").select("organization_id, config").eq("provider", "whatsapp").eq("status", "connected");
  const cfg = (i: { config: unknown }) => (i.config ?? {}) as { display?: string; phone_number_id?: string };
  const integ = (integs ?? []).find((i) => phoneNumberId && cfg(i).phone_number_id === phoneNumberId)
    ?? (integs ?? []).find((i) => String(cfg(i).display ?? "").replace(/\D/g, "") === display)
    ?? (integs?.length === 1 ? integs[0] : null);
  if (!integ) return;
  const orgId = integ.organization_id as string;

  for (const m of v.messages) {
    const parsed = inboundText(m);
    let text = parsed.text;
    let note = parsed.note;
    const { data: dup } = await db.from("messages").select("id").eq("provider_message_id", m.id).maybeSingle();
    if (dup) continue; // Meta retries; process each message once
    const phone = "+" + m.from.replace(/\D/g, "");
    const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
    const now = new Date().toISOString();
    const { data: existing } = await db.from("customers").select("id, branch_id").eq("organization_id", orgId).eq("phone", phone).maybeSingle();
    const { data: cust } = await db.from("customers").upsert({ organization_id: orgId, phone, ...(name && !existing ? { full_name: name } : {}), whatsapp_last_inbound_at: now, last_contact_at: now }, { onConflict: "organization_id,phone" }).select("id, branch_id").single();
    if (!cust) continue;

    let { data: conv } = await db.from("conversations").select("id, handled_by, branch_id").eq("organization_id", orgId).eq("customer_id", cust.id).eq("channel", "whatsapp").in("status", ["active", "transferred"]).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!conv) {
      const { data: org } = await db.from("organizations").select("retention_days").eq("id", orgId).single();
      ({ data: conv } = await db.from("conversations").insert({ organization_id: orgId, customer_id: cust.id, branch_id: cust.branch_id, channel: "whatsapp", expires_at: new Date(Date.now() + Number(org?.retention_days ?? 90) * 86400000).toISOString() }).select("id, handled_by, branch_id").single());
      await db.from("usage_records").insert({ organization_id: orgId, metric: "conversations", quantity: 1, period_start: now.slice(0, 10) });
    }
    if (!conv) continue;
    await db.from("conversations").update({ last_activity_at: now }).eq("id", conv.id);

    if (conv.handled_by !== "human") await markWhatsAppRead(m.id, providerStatus("openai").configured);
    if (parsed.needsTranscription && providerStatus("openai").configured) {
      try {
        const heard = await transcribeVoiceNote(parsed.needsTranscription);
        if (heard) { text = heard; note = `🎤 ${heard}`; }
      } catch (e) {
        reportError(e, { scope: "whatsapp-voice-note" });
      }
    }
    if (!text) {
      await db.from("messages").insert({ conversation_id: conv.id, organization_id: orgId, role: "customer", content: note, provider_message_id: m.id });
      if (conv.handled_by !== "human") await notify(db, { orgId, kind: "task", title: "WhatsApp message the AI could not read", body: note, link: "/dashboard/live" });
      continue;
    }
    await emitEvent(orgId, "whatsapp_message", { conversation_id: conv.id, customer_id: cust.id, phone, channel: "whatsapp", text, customer_is_new: !existing }, { branchId: conv.branch_id as string | null });

    // Human has taken over, AI unavailable, or the plan's allowance is used up → record only and alert staff.
    const allowance = conv.handled_by === "human" ? { ok: true as const } : await aiAllowance(db, orgId, "whatsapp");
    if (conv.handled_by === "human" || !providerStatus("openai").configured || !allowance.ok) {
      await db.from("messages").insert({ conversation_id: conv.id, organization_id: orgId, role: "customer", content: note.slice(0, 10000), provider_message_id: m.id });
      const why = !allowance.ok ? (allowance.reason === "no_subscription" ? " (AI paused: no active subscription)" : " (AI paused: monthly plan allowance used up)") : "";
      if (conv.handled_by !== "human") await notify(db, { orgId, kind: "task", title: `New WhatsApp message needs a reply${why}`, body: note.slice(0, 200), link: "/dashboard/conversations" });
      continue;
    }

    const r = await handleMessage(db, { orgId, channel: "whatsapp", text, conversationId: conv.id, customerId: cust.id, customerPhone: phone, branchId: conv.branch_id as string | null, test: false });
    // orchestrator stored both turns without provider ids; tag the inbound one for de-duplication
    await db.from("messages").update({ provider_message_id: m.id }).eq("conversation_id", conv.id).eq("role", "customer").is("provider_message_id", null).eq("content", text.slice(0, 10000));
    let sent: Awaited<ReturnType<typeof sendWhatsAppText>> = { ok: false, error: "empty reply" };
    for (const part of splitWhatsAppText(r.reply)) {
      sent = await sendWhatsAppText(phone, part);
      if (!sent.ok) break;
    }
    if (sent.ok) {
      await db.from("messages").update({ provider_message_id: sent.id, delivery_status: "sent" }).eq("conversation_id", conv.id).eq("role", "ai").is("provider_message_id", null).eq("content", r.reply.slice(0, 10000));
      await db.from("usage_records").insert({ organization_id: orgId, employee_id: r.agent.id, metric: "whatsapp_messages", quantity: 1, period_start: now.slice(0, 10) });
    } else {
      await db.from("messages").update({ delivery_status: "failed" }).eq("conversation_id", conv.id).eq("role", "ai").is("provider_message_id", null);
      await notify(db, { orgId, kind: "integration", title: "WhatsApp reply failed to send", body: sent.error, link: "/dashboard/live" });
    }
  }
}
