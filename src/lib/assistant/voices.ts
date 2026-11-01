/** Voice ID validation + resolution order (pure, unit-tested). */
export const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
export type VoicePair = { voice_ar?: string | null; voice_en?: string | null };

const clean = (v: unknown) => (typeof v === "string" && VOICE_ID.test(v) ? v : null);

/** Employee choice → business default → server env → null (caller falls back to a built-in voice). */
export function resolveVoice(lang: "ar" | "en", layers: (VoicePair | null | undefined)[]): string | null {
  const key = lang === "ar" ? "voice_ar" : "voice_en";
  for (const l of layers) { const v = clean(l?.[key]); if (v) return v; }
  return null;
}

/** Shapes ElevenLabs' /v1/voices response into what the picker needs. */
export function shapeVoices(raw: unknown) {
  const list = (raw as { voices?: unknown[] })?.voices ?? [];
  return list.flatMap((v) => {
    const x = v as { voice_id?: string; name?: string; preview_url?: string | null; category?: string; labels?: Record<string, string>; verified_languages?: { language?: string; accent?: string }[] };
    if (!x.voice_id || !VOICE_ID.test(x.voice_id)) return [];
    const langs = [...new Set([x.labels?.language, ...(x.verified_languages ?? []).map((l) => l.language)].filter(Boolean) as string[])];
    return [{
      id: x.voice_id,
      name: (x.name ?? "Voice").slice(0, 80),
      preview: x.preview_url && /^https:\/\//.test(x.preview_url) ? x.preview_url : null,
      gender: x.labels?.gender ?? null,
      accent: x.labels?.accent ?? null,
      languages: langs,
      arabic: langs.some((l) => /^ar/i.test(l)) || /arab|gulf|khaleej|saudi|kuwait|emirati/i.test(`${x.labels?.accent ?? ""} ${x.name ?? ""}`),
      category: x.category ?? null,
    }];
  });
}
