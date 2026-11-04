/**
 * Pure helpers for the in-app assistant (no I/O) — unit-tested in scripts/test-phase2.ts.
 */

// ── Audio ────────────────────────────────────────────────────────────────
/** Resamples little-endian PCM16 mono (e.g. OpenAI TTS 24 kHz → Simli 16 kHz) with linear interpolation. */
export function resamplePcm16(input: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  const n = Math.floor(input.byteLength / 2);
  const src = new DataView(input.buffer, input.byteOffset, n * 2);
  if (fromRate === toRate) return input.slice(0, n * 2);
  const outLen = Math.floor((n * toRate) / fromRate);
  const out = new Uint8Array(outLen * 2);
  const dst = new DataView(out.buffer);
  const step = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, n - 1);
    const f = pos - i0;
    const v = src.getInt16(i0 * 2, true) * (1 - f) + src.getInt16(i1 * 2, true) * f;
    dst.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(v))), true);
  }
  return out;
}

/** RMS level 0..1 of a PCM16 window — drives the fallback face's mouth. */
export function pcmLevel(pcm: Uint8Array, from = 0, to = pcm.byteLength): number {
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let sum = 0, count = 0;
  for (let i = from - (from % 2); i + 1 < Math.min(to, pcm.byteLength); i += 2) { const s = v.getInt16(i, true) / 32768; sum += s * s; count++; }
  return count ? Math.min(1, Math.sqrt(sum / count) * 3.2) : 0;
}

// ── Navigation commands (instant, no model call) ─────────────────────────
export const ASSISTANT_PAGES = {
  overview: "/dashboard", command: "/dashboard/command", live: "/dashboard/live", employees: "/dashboard/employees",
  create_employee: "/dashboard/employees/new", templates: "/dashboard/templates", automations: "/dashboard/automations",
  knowledge: "/dashboard/knowledge", customers: "/dashboard/customers", appointments: "/dashboard/appointments", orders: "/dashboard/orders",
  pipeline: "/dashboard/pipeline", calls: "/dashboard/calls", conversations: "/dashboard/conversations",
  analyst: "/dashboard/analyst", intelligence: "/dashboard/intelligence", analytics: "/dashboard/analytics", branches: "/dashboard/branches",
  integrations: "/dashboard/integrations", whatsapp_setup: "/dashboard/integrations/whatsapp", billing: "/dashboard/billing", settings: "/dashboard/settings", support: "/dashboard/support",
} as const;
export type AssistantPage = keyof typeof ASSISTANT_PAGES;

const PAGE_WORDS: [AssistantPage, RegExp][] = [
  ["analyst", /المحلل|محلل|analyst/i],
  ["create_employee", /(موظف|employee).{0,12}(جديد|new)|(أنشئ|انشئ|اصنع|create|new).{0,12}(موظف|employee)/i],
  ["orders", /الطلبات|طلبات|المنتجات|المنيو|orders?\b|products|menu/i],
  ["appointments", /مواعيد|الموعد|حجوزات|appointment|booking|reservation/i],
  ["conversations", /محادثات|المحادث|رسائل|conversation|messages|chats?\b/i],
  ["calls", /مكالمات|المكالم|calls?\b/i],
  ["live", /مباشر|العمليات|live/i],
  ["command", /مركز القيادة|القيادة|command/i],
  ["customers", /عملاء|العميل|زبائن|customers?\b|crm/i],
  ["pipeline", /المبيعات|مسار|pipeline|leads?\b|sales/i],
  ["automations", /أتمتة|الاتمتة|automation|workflow/i],
  ["knowledge", /المعرفة|مستندات|knowledge|documents?\b/i],
  ["templates", /قوالب|templates?\b/i],
  ["employees", /الموظفين|موظفين|موظفيني|الموظف|employees?\b|agents?\b/i],
  ["intelligence", /ذكاء الأعمال|تقارير|intelligence|reports?\b/i],
  ["analytics", /تحليلات|إحصائيات|analytics|stats/i],
  ["branches", /فروع|الفرع|branch/i],
  ["whatsapp_setup", /(ربط|اربط).{0,6}(واتساب|الواتساب)|connect whatsapp|whatsapp setup/i],
  ["integrations", /تكاملات|ربط|واتساب|integration|whatsapp/i],
  ["billing", /فوتر|اشتراك|الدفع|فاتورة|billing|subscription|plan\b|invoice/i],
  ["settings", /إعدادات|الاعدادات|settings|profile|الفريق|team/i],
  ["support", /دعم|مساعدة فنية|support/i],
  ["overview", /الرئيسية|نظرة عامة|لوحة التحكم|home|overview|dashboard/i],
];
// JS \b only understands ASCII word characters, so the verb must be followed by a space or the end.
const NAV_VERB = /^(\s*(من فضلك|لو سمحت|please|يا\s*\S+)\s*)?(افتح|إفتح|روح|رح|ودني|وديني|خذني|اعرض|اظهر|أظهر|انتقل|أنشئ|انشئ|اربط|go to|open|show( me)?|take me to|navigate to|create|add|connect)(?=\s|$)/i;

/** "افتح المواعيد" / "open billing" → the page to open, or null when it's a real question. */
export function detectNavigation(text: string): AssistantPage | null {
  const t = text.trim();
  if (!NAV_VERB.test(t) || t.length > 80) return null;
  for (const [page, re] of PAGE_WORDS) if (re.test(t)) return page;
  return null;
}

// ── Emotion ──────────────────────────────────────────────────────────────
export const EMOTIONS = ["neutral", "happy", "thinking", "concerned", "celebrating"] as const;
export type Emotion = (typeof EMOTIONS)[number];
export const asEmotion = (v: unknown): Emotion => (EMOTIONS as readonly string[]).includes(v as string) ? (v as Emotion) : "neutral";

/** Voice direction for the TTS model so the tone (and the face, which follows the audio) matches the emotion. */
export function voiceDirection(e: Emotion, locale: "ar" | "en"): string {
  const base = locale === "ar"
    ? "Speak natural, warm Gulf (Kuwaiti) Arabic like a friendly professional assistant. Clear diction, natural pace."
    : "Speak clear, warm, natural English like a friendly professional assistant.";
  const tone: Record<Emotion, string> = {
    neutral: "Calm and attentive, with a light smile in the voice.",
    happy: "Bright and pleased, smiling as you speak.",
    thinking: "Thoughtful and measured, slightly slower.",
    concerned: "Gentle, reassuring and empathetic; slower and softer.",
    celebrating: "Genuinely delighted and energetic, but still professional.",
  };
  return `${base} ${tone[e]}`;
}

/** Text for TTS: strips markdown/emoji/URLs so the face doesn't "read" symbols. */
export function speakable(text: string, max = 900): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>|~]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ── Voice selection (ElevenLabs) ─────────────────────────────────────────
/** Arabic letters in the reply decide the voice, not the UI language (mixed chats sound right). */
export function speechLanguage(text: string, fallback: "ar" | "en"): "ar" | "en" {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (!letters) return fallback;
  const arabic = (letters.match(/\p{Script=Arabic}/gu) ?? []).length;
  return arabic / letters.length >= 0.3 ? "ar" : "en";
}

/** ElevenLabs voice settings per emotion: lower stability = more expressive delivery. */
export function elevenVoiceSettings(e: Emotion) {
  const base = { similarity_boost: 0.8, use_speaker_boost: true, speed: 1 };
  switch (e) {
    case "celebrating": return { ...base, stability: 0.3, style: 0.55 };
    case "happy": return { ...base, stability: 0.4, style: 0.4 };
    case "concerned": return { ...base, stability: 0.6, style: 0.25, speed: 0.95 };
    case "thinking": return { ...base, stability: 0.65, style: 0.15, speed: 0.95 };
    default: return { ...base, stability: 0.5, style: 0.3 };
  }
}
