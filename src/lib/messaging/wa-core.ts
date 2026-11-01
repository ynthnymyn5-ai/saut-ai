/** Pure WhatsApp helpers (no I/O) — unit-tested in scripts/test-engine.ts. */

export const WA_MAX_TEXT = 4096;
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Splits a reply into WhatsApp-sized parts, preferring paragraph, then sentence, then word breaks. */
export function splitWhatsAppText(text: string, max = WA_MAX_TEXT): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = window.lastIndexOf("\n\n");
    if (cut < max * 0.5) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("، "), window.lastIndexOf("؟ "), window.lastIndexOf("! "), window.lastIndexOf("\n")) + 1;
    if (cut < max * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Free-form messages are allowed only within 24 h of the customer's last inbound message. */
export function insideServiceWindow(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const t = Date.parse(lastInboundAt);
  return Number.isFinite(t) && now - t < WA_WINDOW_MS && t <= now + 60_000;
}

export type WaInbound = {
  id: string; from: string; type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  audio?: { id: string; mime_type?: string; voice?: boolean };
  image?: { id: string; caption?: string };
  video?: { id: string; caption?: string };
  document?: { id: string; caption?: string; filename?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
};

/**
 * What the AI should read for an inbound message. Voice notes return `needsTranscription`
 * (the caller downloads + transcribes); media with a caption uses the caption; other media
 * becomes a short bracketed note so staff see it in the transcript.
 */
export function inboundText(m: WaInbound): { text: string | null; note: string; needsTranscription?: string } {
  const plain = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  if (plain) return { text: plain, note: plain };
  if (m.type === "audio" && m.audio?.id) return { text: null, note: "[voice note]", needsTranscription: m.audio.id };
  const media = m.image ?? m.video ?? m.document;
  if (media?.caption) return { text: media.caption, note: `[${m.type}] ${media.caption}` };
  if (m.type === "location" && m.location) {
    const where = [m.location.name, m.location.address].filter(Boolean).join(", ");
    return { text: `My location: ${where || `${m.location.latitude},${m.location.longitude}`}`, note: `[location] ${where}` };
  }
  return { text: null, note: `[${m.type} message]` };
}
