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
  knowledge: "/dashboard/knowledge", customers: "/dashboard/customers", appointments: "/dashboard/appointments",
  pipeline: "/dashboard/pipeline", calls: "/dashboard/calls", conversations: "/dashboard/conversations",
  intelligence: "/dashboard/intelligence", analytics: "/dashboard/analytics", branches: "/dashboard/branches",
  integrations: "/dashboard/integrations", billing: "/dashboard/billing", settings: "/dashboard/settings", support: "/dashboard/support",
} as const;
export type AssistantPage = keyof typeof ASSISTANT_PAGES;

const PAGE_WORDS: [AssistantPage, RegExp][] = [
  ["create_employee", /(موظف|employee).{0,12}(جديد|new)|(أنشئ|انشئ|اصنع|create|new).{0,12}(موظف|employee)/i],
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
  ["integrations", /تكاملات|ربط|واتساب|integration|whatsapp/i],
  ["billing", /فوتر|اشتراك|الدفع|فاتورة|billing|subscription|plan\b|invoice/i],
  ["settings", /إعدادات|الاعدادات|settings|profile|الفريق|team/i],
  ["support", /دعم|مساعدة فنية|support/i],
  ["overview", /الرئيسية|نظرة عامة|لوحة التحكم|home|overview|dashboard/i],
];
// JS \b only understands ASCII word characters, so the verb must be followed by a space or the end.
const NAV_VERB = /^(\s*(من فضلك|لو سمحت|please|يا\s*\S+)\s*)?(افتح|إفتح|روح|رح|ودني|وديني|خذني|اعرض|اظهر|أظهر|انتقل|أنشئ|انشئ|go to|open|show( me)?|take me to|navigate to|create|add)(?=\s|$)/i;

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
