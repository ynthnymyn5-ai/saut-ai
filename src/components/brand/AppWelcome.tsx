"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { VoiceOrb, type OrbScene } from "./VoiceOrb";

export const WELCOME_SEEN_KEY = "saut-welcome-seen";

const DIALECTS = [
  { en: "Kuwaiti", ar: "الكويتية" },
  { en: "Saudi", ar: "السعودية" },
  { en: "Emirati", ar: "الإماراتية" },
  { en: "MSA", ar: "الفصحى" },
  { en: "English", ar: "English" },
];

const SLIDES = [
  {
    eyebrow: { en: "SAUT AI", ar: "صوت" },
    title: { en: "An employee who speaks your dialect", ar: "موظفك الذي يتكلّم بلهجتك" },
    body: { en: "SAUT answers your customers on calls and WhatsApp, day and night.", ar: "صوت يرد على عملائك بالاتصال وواتساب، ليلاً ونهاراً." },
  },
  {
    eyebrow: { en: "01 · Voice", ar: "٠١ · الصوت" },
    title: { en: "Answers calls 24 hours a day", ar: "يرد على المكالمات ٢٤ ساعة" },
    body: { en: "Every call is understood and answered right away, even while you sleep.", ar: "كل مكالمة تُفهم ويُرد عليها فوراً، حتى وأنت نائم." },
  },
  {
    eyebrow: { en: "02 · Dialects", ar: "٠٢ · اللهجات" },
    title: { en: "Five dialects, one ring each", ar: "خمس لهجات، حلقة لكل لهجة" },
    body: { en: "Tap a dialect to light up its ring.", ar: "اضغط على لهجة لتضيء حلقتها." },
  },
  {
    eyebrow: { en: "03 · Flow", ar: "٠٣ · كيف يعمل" },
    title: { en: "From call to booking", ar: "من المكالمة إلى الحجز" },
    steps: [
      { en: "The customer calls and speaks in their dialect.", ar: "العميل يتصل ويتكلّم بلهجته." },
      { en: "SAUT understands and checks your business info.", ar: "صوت يفهم الطلب ويبحث في معلومات نشاطك." },
      { en: "It books the appointment and sends a confirmation.", ar: "يحجز الموعد ويرسل التأكيد." },
    ],
  },
];

/**
 * First-launch welcome inside the mobile app: four swipeable screens over SAUT's 3D
 * voice orb, ending with sign-up / log-in. Shown once; afterwards the app opens
 * straight to the dashboard.
 */
export function AppWelcome() {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const L = <T,>(v: { en: T; ar: T }) => v[locale];
  const [i, setI] = useState(0);
  const [ring, setRing] = useState(0);
  const [pulse, setPulse] = useState(0);
  const start = useRef<number | null>(null);
  const last = SLIDES.length - 1;
  const slide = SLIDES[i];

  const go = (n: number) => {
    const next = Math.max(0, Math.min(last, n));
    if (next !== i) {
      setI(next);
      setPulse((p) => p + 1);
    }
  };
  const done = () => {
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {}
  };
  // Swipe: in Arabic the next screen comes from the left, like turning a page.
  const onUp = (x: number) => {
    if (start.current === null) return;
    const dx = x - start.current;
    start.current = null;
    if (Math.abs(dx) < 40) return;
    const forward = ar ? dx > 0 : dx < 0;
    go(i + (forward ? 1 : -1));
  };

  return (
    <main
      className="relative flex min-h-[100dvh] touch-pan-y select-none flex-col overflow-hidden bg-ink text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onPointerDown={(e) => (start.current = e.clientX)}
      onPointerUp={(e) => onUp(e.clientX)}
      onPointerCancel={() => (start.current = null)}
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-[34%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/20 blur-[120px]" />
      <VoiceOrb scene={i as OrbScene} ring={ring} pulse={pulse} className="absolute inset-x-0 top-0 h-[62dvh]" />

      <div className="relative flex items-center justify-between px-5 pt-4">
        <span className="font-display text-lg font-semibold text-gradient">SAUT AI</span>
        {i < last ? (
          <button type="button" onClick={() => go(last)} className="rounded-full px-3 py-2 text-sm text-muted hover:text-white">
            {ar ? "تخطي" : "Skip"}
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="relative mt-auto bg-gradient-to-t from-ink via-ink/85 to-transparent px-6 pb-6 pt-16">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="min-h-[200px]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">{L(slide.eyebrow)}</p>
            <h1 className="mt-2 text-balance font-display text-3xl font-bold leading-tight">{L(slide.title)}</h1>
            {"body" in slide && slide.body && <p className="mt-3 text-base leading-relaxed text-muted">{L(slide.body)}</p>}
            {i === 2 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {DIALECTS.map((d, k) => (
                  <button
                    key={d.en}
                    type="button"
                    onClick={() => {
                      setRing(k);
                      setPulse((p) => p + 1);
                    }}
                    aria-pressed={ring === k}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${ring === k ? "border-electric text-electric" : "border-line text-white/80"}`}
                  >
                    {L(d)}
                  </button>
                ))}
              </div>
            )}
            {"steps" in slide && slide.steps && (
              <ol className="mt-4 space-y-2">
                {slide.steps.map((s, k) => (
                  <li key={k} className="flex items-baseline gap-3 border-t border-line pt-2 text-[15px] text-white/85">
                    <span className="font-mono text-xs text-violet-soft">{ar ? `٠${"١٢٣"[k]}` : `0${k + 1}`}</span>
                    {L(s)}
                  </li>
                ))}
              </ol>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 flex items-center justify-center gap-2" role="tablist" aria-label={ar ? "الشاشات" : "Screens"}>
          {SLIDES.map((_, k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === i}
              aria-label={`${k + 1} / ${SLIDES.length}`}
              onClick={() => go(k)}
              className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-electric" : "w-2 bg-white/25"}`}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {i < last ? (
            <button type="button" onClick={() => go(i + 1)} className="h-14 rounded-2xl bg-brand-gradient text-base font-semibold shadow-glow">
              {ar ? "التالي" : "Next"}
            </button>
          ) : (
            <Link href="/signup" onClick={done} className="grid h-14 place-items-center rounded-2xl bg-brand-gradient text-base font-semibold shadow-glow">
              {ar ? "أنشئ حسابك" : "Create your account"}
            </Link>
          )}
          <Link href="/login" onClick={done} className="grid h-12 place-items-center rounded-2xl border border-line text-sm text-white/85">
            {ar ? "لدي حساب · تسجيل الدخول" : "I have an account · Log in"}
          </Link>
        </div>
      </div>
    </main>
  );
}
