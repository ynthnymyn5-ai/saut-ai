import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * WhatsApp Business Cloud API. Returns the provider message id only when Meta accepts it.
 * Outside the 24-hour customer-service window Meta requires an approved template.
 */
export async function sendWhatsAppText(to: string, text: string) {
  const token = serverEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = serverEnv("WHATSAPP_PHONE_NUMBER_ID");
  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "text", text: { body: text } }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false as const, error: `WhatsApp unreachable: ${e instanceof Error ? e.message : "network error"}`, retryable: true };
  }
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok || !data.messages?.[0]?.id) {
    return { ok: false as const, error: data.error?.message ?? `WhatsApp API error ${res.status}`, retryable: res.status === 429 || res.status >= 500 };
  }
  return { ok: true as const, id: data.messages[0].id };
}

/** Approved-template message (required outside the 24-hour customer-service window). */
export async function sendWhatsAppTemplate(to: string, name: string, language: string, params: string[]) {
  const token = serverEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = serverEnv("WHATSAPP_PHONE_NUMBER_ID");
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: to.replace(/[^\d]/g, ""), type: "template",
      template: { name, language: { code: language }, components: params.length ? [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }] : [] },
    }),
  });
  const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
  if (!res.ok || !data.messages?.[0]?.id) return { ok: false as const, error: data.error?.message ?? `WhatsApp API error ${res.status}` };
  return { ok: true as const, id: data.messages[0].id };
}

/** Health probe used by the integration center and admin panel. */
export async function whatsappHealth() {
  const token = serverEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = serverEnv("WHATSAPP_PHONE_NUMBER_ID");
  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,quality_rating,verified_name`, { headers: { Authorization: `Bearer ${token}` } });
  const d = (await r.json()) as { display_phone_number?: string; quality_rating?: string; verified_name?: string; error?: { message: string } };
  return r.ok ? { ok: true as const, ...d } : { ok: false as const, error: d.error?.message ?? String(r.status) };
}

/** Marks an inbound message as read and shows the typing indicator while the AI replies. */
export async function markWhatsAppRead(messageId: string, typing = true) {
  const token = serverEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneId = serverEnv("WHATSAPP_PHONE_NUMBER_ID");
  await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, ...(typing ? { typing_indicator: { type: "text" } } : {}) }),
  }).catch(() => null); // cosmetic: never block a reply on this
}

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

/** Downloads inbound media (two-step Graph API: media id → short-lived URL → bytes). */
export async function downloadWhatsAppMedia(mediaId: string) {
  const token = serverEnv("WHATSAPP_ACCESS_TOKEN");
  const meta = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${token}` } });
  const m = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number; error?: { message: string } };
  if (!meta.ok || !m.url) throw new Error(`WhatsApp media lookup failed: ${m.error?.message ?? meta.status}`);
  if (m.file_size && m.file_size > MAX_MEDIA_BYTES) throw new Error("WhatsApp media too large");
  const file = await fetch(m.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!file.ok) throw new Error(`WhatsApp media download failed: ${file.status}`);
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_MEDIA_BYTES) throw new Error("WhatsApp media too large");
  return { buf, mime: m.mime_type ?? "application/octet-stream" };
}

/** Speech-to-text for a WhatsApp voice note (Gulf Arabic or English). */
export async function transcribeVoiceNote(mediaId: string): Promise<string> {
  const { buf, mime } = await downloadWhatsAppMedia(mediaId);
  const { openai, models } = await import("@/lib/ai/openai");
  const { toFile } = await import("openai");
  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mpeg") ? "mp3" : mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("amr") ? "amr" : "ogg";
  const r = await openai().audio.transcriptions.create({ file: await toFile(buf, `voice.${ext}`, { type: mime }), model: models.stt() });
  return (r.text ?? "").trim();
}
