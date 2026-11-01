"use client";
import { Check, Copy, Loader2, Mic2, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BuiltinVoice } from "@/components/assistant/voice";
import { ErrorNote, useApi, useMutate, useTr } from "@/components/os/shared";
import { Badge, Button, Card, Skeleton } from "@/components/ui/primitives";

type Voice = { id: string; name: string; preview: string | null; gender: string | null; accent: string | null; languages: string[]; arabic: boolean };
type Pair = { voice_ar?: string | null; voice_en?: string | null };
type Data = {
  demo?: boolean; configured: boolean; voices: Voice[]; defaults: Pair; organization: Pair; providerError: string | null; migrationNeeded: boolean;
  employees: { id: string; name: string; voice_ar: string | null; voice_en: string | null }[]; canEditOrg: boolean; canEditEmployees: boolean;
};

const SQL = `alter table organizations add column if not exists voice_settings jsonb not null default '{}';`;
const SAMPLE = { ar: "هلا والله! أنا مساعدك الذكي، شلون أقدر أخدمك اليوم؟", en: "Hi! I'm your AI assistant. How can I help you today?" };

/**
 * Settings → Voices. Pick the business's Arabic and English voices from the ElevenLabs
 * account, hear each one (sample clip, or a real line in that voice), and give any AI
 * employee its own voices. Saved choices take effect immediately — no redeploy.
 */
export function VoicesCard() {
  const tr = useTr();
  const mutate = useMutate();
  const { data, loading, error, reload } = useApi<Data>("/api/voices");
  const [org, setOrg] = useState<Pair>({});
  const [emps, setEmps] = useState<Data["employees"]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const voice = useRef<BuiltinVoice | null>(null);

  useEffect(() => { if (data) { setOrg(data.organization ?? {}); setEmps(data.employees ?? []); } }, [data]);
  useEffect(() => () => { audio.current?.pause(); voice.current?.close(); }, []);

  const stop = () => { audio.current?.pause(); voice.current?.stop(); setPlaying(null); };

  async function play(v: Voice, lang: "ar" | "en") {
    const tag = `${v.id}:${lang}`;
    if (playing === tag) return stop();
    stop();
    setPlaying(tag);
    // A real line in this voice (shows how it handles Arabic); fall back to the stock sample.
    const r = await fetch("/api/assistant/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: SAMPLE[lang], locale: lang, voiceId: v.id }) }).catch(() => null);
    if (r?.ok && r.headers.get("X-Voice-Provider") === "elevenlabs") {
      voice.current ??= new BuiltinVoice();
      await voice.current.speak(new Uint8Array(await r.arrayBuffer())).catch(() => {});
      setPlaying((p) => (p === tag ? null : p));
      return;
    }
    if (v.preview) {
      audio.current ??= new Audio();
      audio.current.src = v.preview;
      audio.current.onended = () => setPlaying(null);
      await audio.current.play().catch(() => setPlaying(null));
    } else setPlaying(null);
  }

  const name = (id?: string | null) => data?.voices.find((v) => v.id === id)?.name;
  const sorted = (lang: "ar" | "en") => [...(data?.voices ?? [])].sort((a, b) => Number(lang === "ar" ? b.arabic : !b.arabic) - Number(lang === "ar" ? a.arabic : !a.arabic) || a.name.localeCompare(b.name));

  function Picker({ lang, value, onChange, inherit, disabled }: { lang: "ar" | "en"; value: string | null | undefined; onChange: (v: string | null) => void; inherit: string; disabled?: boolean }) {
    const current = data?.voices.find((v) => v.id === value);
    return (
      <div className="flex items-center gap-2">
        <select className="input min-w-0 flex-1" value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} aria-label={lang === "ar" ? tr("Arabic voice", "الصوت العربي") : tr("English voice", "الصوت الإنجليزي")}>
          <option value="">{inherit}</option>
          {sorted(lang).map((v) => <option key={v.id} value={v.id}>{v.name}{v.arabic ? " · عربي" : ""}{v.gender ? ` · ${v.gender === "male" ? tr("male", "رجل") : v.gender === "female" ? tr("female", "امرأة") : v.gender}` : ""}</option>)}
        </select>
        <button type="button" disabled={!current} onClick={() => current && play(current, lang)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-white/80 hover:border-violet/50 disabled:opacity-30" aria-label={tr("Listen", "استمع")} title={tr("Listen", "استمع")}>
          {playing === `${value}:${lang}` ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  const bizDefault = (lang: "ar" | "en") => {
    const id = lang === "ar" ? data?.defaults.voice_ar : data?.defaults.voice_en;
    return `${tr("Default", "الافتراضي")}${name(id) ? ` (${name(id)})` : ""}`;
  };
  const empDefault = (lang: "ar" | "en") => {
    const id = (lang === "ar" ? org.voice_ar : org.voice_en) ?? (lang === "ar" ? data?.defaults.voice_ar : data?.defaults.voice_en);
    return `${tr("Business voice", "صوت النشاط")}${name(id) ? ` (${name(id)})` : ""}`;
  };

  return (
    <Card className="xl:col-span-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Mic2 className="h-5 w-5 text-electric" /><h2 className="font-semibold">{tr("Voices", "الأصوات")}</h2>
        {data?.configured && <Badge tone="green" className="ms-auto">ElevenLabs · {data.voices.length}</Badge>}
      </div>
      <p className="mb-5 text-sm text-muted">{tr("Choose how your assistant and AI employees sound in Arabic and English. Changes apply instantly.", "اختر كيف يبدو صوت مساعدك وموظفيك الأذكياء بالعربي والإنجليزي. التغيير يطبّق فوراً.")}</p>
      <ErrorNote error={error} />
      {loading || !data ? <Skeleton className="h-40" /> : !data.configured ? (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm text-amber-100">{tr("Add ELEVENLABS_API_KEY in your hosting settings to use human voices. Until then OpenAI voices are used.", "أضف ELEVENLABS_API_KEY في إعدادات الاستضافة لاستخدام الأصوات البشرية. حتى ذلك الحين تُستخدم أصوات OpenAI.")}</p>
      ) : (
        <div className="space-y-6">
          {data.providerError && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{tr("Couldn't load voices from ElevenLabs", "تعذّر تحميل الأصوات من ElevenLabs")} ({data.providerError}). {tr("Check the API key and its Voices permission.", "تأكد من المفتاح وصلاحية Voices.")}</p>}
          {data.voices.length === 0 && !data.providerError && <p className="text-sm text-muted">{tr("No voices yet. In ElevenLabs open Voices → Explore and add voices to “My voices”, then reload.", "لا توجد أصوات بعد. في ElevenLabs افتح Voices ← Explore وأضف أصواتاً إلى My voices ثم أعد التحميل.")} <button type="button" className="text-electric underline" onClick={reload}>{tr("Reload", "إعادة التحميل")}</button></p>}

          {data.migrationNeeded && (
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm">
              <p className="mb-2 text-amber-100">{tr("One-time step: run this in Supabase → SQL Editor to save business voices.", "خطوة لمرة واحدة: شغّل هذا في Supabase ← SQL Editor لحفظ أصوات النشاط.")}</p>
              <div className="flex items-center gap-2"><code dir="ltr" className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/40 px-3 py-2 text-xs">{SQL}</code>
                <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line" onClick={() => { navigator.clipboard?.writeText(SQL); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label={tr("Copy", "نسخ")}>{copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}</button></div>
            </div>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold">{tr("Business voices (assistant SO + all employees)", "أصوات النشاط (المساعد SO وكل الموظفين)")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="label">{tr("Arabic", "العربي")}</p><Picker lang="ar" value={org.voice_ar} onChange={(v) => setOrg({ ...org, voice_ar: v })} inherit={bizDefault("ar")} disabled={!data.canEditOrg || data.migrationNeeded} /></div>
              <div><p className="label">{tr("English", "الإنجليزي")}</p><Picker lang="en" value={org.voice_en} onChange={(v) => setOrg({ ...org, voice_en: v })} inherit={bizDefault("en")} disabled={!data.canEditOrg || data.migrationNeeded} /></div>
            </div>
            {data.canEditOrg ? <Button className="mt-4" disabled={data.migrationNeeded} onClick={async () => { if (await mutate("/api/voices", "PUT", { scope: "organization", voice_ar: org.voice_ar ?? null, voice_en: org.voice_en ?? null }, tr("Voices saved", "تم حفظ الأصوات"))) reload(); }}>{tr("Save business voices", "حفظ أصوات النشاط")}</Button>
              : <p className="mt-2 text-xs text-muted">{tr("Only owners and admins can change business voices.", "فقط المالك ومدير النظام يغيّرون أصوات النشاط.")}</p>}
          </section>

          {emps.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">{tr("Per AI employee (optional)", "لكل موظف ذكي (اختياري)")}</h3>
              <p className="mb-3 text-xs text-muted">{tr("Used when you test an employee and for its spoken replies. Live phone calls use the fast real-time voice set on the employee.", "يُستخدم عند تجربة الموظف وفي ردوده الصوتية. المكالمات الهاتفية المباشرة تستخدم الصوت السريع المحدد في صفحة الموظف.")}</p>
              <div className="space-y-3">
                {emps.map((e, i) => (
                  <div key={e.id} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,10rem)_1fr_1fr_auto] sm:items-center">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <Picker lang="ar" value={e.voice_ar} onChange={(v) => setEmps(emps.map((x, j) => (j === i ? { ...x, voice_ar: v } : x)))} inherit={empDefault("ar")} disabled={!data.canEditEmployees} />
                    <Picker lang="en" value={e.voice_en} onChange={(v) => setEmps(emps.map((x, j) => (j === i ? { ...x, voice_en: v } : x)))} inherit={empDefault("en")} disabled={!data.canEditEmployees} />
                    {data.canEditEmployees && <Button variant="outline" size="sm" onClick={() => mutate("/api/voices", "PUT", { scope: "employee", employee_id: e.id, voice_ar: e.voice_ar, voice_en: e.voice_en }, tr(`Saved for ${e.name}`, `تم الحفظ لـ ${e.name}`))}>{tr("Save", "حفظ")}</Button>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {playing && <p className="flex items-center gap-2 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{tr("Playing…", "يتم التشغيل…")}</p>}
        </div>
      )}
    </Card>
  );
}
