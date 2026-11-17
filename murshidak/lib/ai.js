// Understands a free-text request ("أبي أجدد إقامة الخادمة") and maps it to a procedure.
// 1) If OPENAI_API_KEY is set, an LLM picks from the library (it may only return a slug
//    that exists; anything else is discarded).
// 2) Otherwise, or if the LLM call fails, a local Arabic/English keyword matcher is used.

/** Normalise Arabic (and English) so dialect spellings compare equal. */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Contains as a whole word sequence, allowing common Arabic prefixes (ال، و، ب، ل، لل)
// and possessive suffixes (خادمتي، جوازي، عيالنا).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SUF = '(ي|ه|ها|نا|كم|هم|ك|وا|ون|ين)?';
function has(text, kw) {
  const k = normalize(kw);
  if (!k) return false;
  const alts = [esc(k) + SUF];
  if (k.endsWith('ه')) alts.push(esc(k.slice(0, -1)) + 'ت' + SUF);
  return new RegExp(`(^|\\s)(ال|و|ب|ل|لل|وال|بال)?(${alts.join('|')})($|\\s)`, 'u').test(text);
}

/** Score every procedure against the text. keywords = {s: subject[], a: action[], x: phrase[]} */
export function scoreAll(text, procedures) {
  const t = normalize(text);
  return procedures
    .map((p) => {
      const kw = p.keywords || {};
      const sHit = (kw.s || []).some((k) => has(t, k));
      const aHit = (kw.a || []).some((k) => has(t, k));
      const xHit = (kw.x || []).some((k) => has(t, k));
      let score = (sHit ? 3 : 0) + (sHit && aHit ? 2 : 0) + (xHit ? 4 : 0);
      if (has(t, p.title_ar) || has(t, p.title_en)) score += 5;
      return { p, score: score + (score ? (p.popular || 0) / 1000 : 0) };
    })
    .filter((r) => r.score >= 3)
    .sort((a, b) => b.score - a.score);
}

const GENERAL = {
  ar: 'لم أجد إجراءً مطابقاً تماماً في المكتبة. جرّب وصف طلبك بكلمات أخرى (مثلاً: «تجديد البطاقة المدنية» أو «نقل ملكية سيارة»)، أو تصفّح المكتبة. ولمساعدة شخصية يمكنك حجز مندوب معتمد يتابع المعاملة عنك.',
  en: 'I could not find an exact match in the library. Try describing it differently (e.g. "renew civil ID" or "transfer car ownership"), or browse the library. For personal help you can book a verified agent to follow up for you.',
};

export function localMatch(text, procedures) {
  const ranked = scoreAll(text, procedures);
  const best = ranked[0];
  // A clear winner needs either a phrase hit or subject+action.
  if (best && best.score >= 5) {
    return { slug: best.p.slug, confidence: Math.min(0.95, 0.5 + best.score / 20), alternatives: ranked.slice(1, 4).map((r) => r.p.slug), source: 'local' };
  }
  return {
    slug: null, confidence: 0, source: 'local',
    alternatives: ranked.slice(0, 3).map((r) => r.p.slug),
    reply: GENERAL,
  };
}

async function llmMatch(text, procedures, lang) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const catalog = procedures.map((p) => `${p.slug} | ${p.title_ar} | ${p.title_en}`).join('\n');
  const system = `You are the request router of "Murshidak", an independent (NOT official) guide to Kuwaiti government procedures.
Map the user's request (often Kuwaiti dialect Arabic) to exactly one procedure slug from the catalog, or null if none fits.
Return JSON only: {"slug": string|null, "confidence": number 0..1, "alternatives": string[] (max 3 slugs), "reply_ar": string, "reply_en": string}.
reply_* is one or two short sentences. When slug is null, give brief general guidance, never invent fees or legal facts, and suggest booking a verified agent (مندوب) or checking the official entity.
Catalog (slug | Arabic | English):
${catalog}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.OPENAI_TIMEOUT_MS || 15000));
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: String(text).slice(0, 500) }],
      }),
    });
    if (!res.ok) throw new Error(`llm_http_${res.status}`);
    const data = await res.json();
    const out = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const slugs = new Set(procedures.map((p) => p.slug));
    const slug = slugs.has(out.slug) ? out.slug : null;
    return {
      slug,
      confidence: Number(out.confidence) || (slug ? 0.8 : 0),
      alternatives: (out.alternatives || []).filter((s) => slugs.has(s) && s !== slug).slice(0, 3),
      reply: slug ? null : { ar: String(out.reply_ar || GENERAL.ar), en: String(out.reply_en || GENERAL.en) },
      source: 'ai',
    };
  } catch (e) {
    console.warn('[ai] LLM match failed, using local matcher:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function interpret(text, procedures, lang = 'ar') {
  return (await llmMatch(text, procedures, lang)) || localMatch(text, procedures);
}
