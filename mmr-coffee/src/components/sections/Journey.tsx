"use client";
import dynamic from "next/dynamic";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import { useCapability } from "@/lib/capability";
import { useLang } from "@/lib/i18n";
import { LazyCanvas } from "../ui/LazyCanvas";
import { StageFallback } from "../ui/Fallbacks";

const JourneyScene = dynamic(() => import("../three/JourneyScene").then((m) => m.JourneyScene), { ssr: false });

/** Scroll windows for the five chapter captions (text comes from strings.ts). */
const windows: [number, number][] = [[0, 0.17], [0.2, 0.37], [0.4, 0.55], [0.58, 0.76], [0.82, 1.01]];
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function Journey() {
  const cap = useCapability();
  const { t, rtl } = useLang();
  const chapters = t.journey.chapters;
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const caps = useRef<(HTMLDivElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const ticks = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: section.current,
      start: "top top",
      end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        progress.current = p;
        windows.forEach((w, i) => {
          const el = caps.current[i];
          if (!el) return;
          const o = ss(w[0] - 0.03, w[0] + 0.03, p) * (1 - ss(w[1] - 0.03, w[1] + 0.01, p));
          el.style.opacity = String(o);
          el.style.transform = `translate3d(0, ${(1 - o) * 30}px, 0)`;
          el.style.visibility = o < 0.01 ? "hidden" : "visible";
          ticks.current[i]?.classList.toggle("is-on", p >= w[0] - 0.03);
        });
        if (bar.current) bar.current.style.transform = `scaleY(${p})`;
      },
    });
    return () => st.kill();
  }, []);

  return (
    <section id="journey" ref={section} className="relative h-[340vh] bg-void" aria-label={t.journey.aria}>
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        <LazyCanvas className="absolute inset-0" camera={{ fov: 35, position: [0, 0, 10] }} fallback={<StageFallback label={t.fallback.journey} />}>
          <JourneyScene progress={progress} lite={cap.tier !== "high"} rtl={rtl} />
        </LazyCanvas>
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(7,6,5,.85)_0%,rgba(7,6,5,.2)_45%,transparent_70%)] rtl:bg-[linear-gradient(270deg,rgba(7,6,5,.85)_0%,rgba(7,6,5,.2)_45%,transparent_70%)]" />

        <div className="gutter pointer-events-none absolute inset-x-0 top-24 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">
          <span>{t.journey.label}</span>
          <span>{t.journey.route}</span>
        </div>

        {chapters.map((c, i) => (
          <div
            key={c.n}
            ref={(el) => {
              caps.current[i] = el;
            }}
            className="gutter pointer-events-none absolute inset-x-0 bottom-[12vh] max-w-[min(640px,46vw)] max-md:max-w-none md:bottom-auto md:top-1/2 md:-translate-y-1/2"
            style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? "visible" : "hidden" }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-gold">
              {t.journey.chapter} {c.n} — {c.meta}
            </p>
            <h2 className="mt-4 font-display text-[clamp(46px,5.6vw,96px)] font-extrabold uppercase leading-[0.85] tracking-[-0.03em] text-cream">{c.title}</h2>
            <p className="mt-6 max-w-md font-serif text-xl leading-snug text-cream/75 md:text-2xl">{c.line}</p>
          </div>
        ))}

        <div className="absolute end-4 top-1/2 hidden -translate-y-1/2 md:block md:pe-6">
        <div aria-hidden className="absolute end-[27px] top-0 h-full w-px bg-hair">
          <div ref={bar} className="h-full w-full origin-top scale-y-0 bg-gold" />
        </div>
        <ol className="relative flex flex-col gap-6" aria-label={t.journey.chaptersAria}>
          {chapters.map((c, i) => (
            <li
              key={c.n}
              ref={(el) => {
                ticks.current[i] = el;
              }}
              className="journey-tick flex items-center justify-end gap-4 font-mono text-[10px] uppercase tracking-[0.3em] text-smoke"
            >
              {c.title}
              <span className="relative z-10 h-2 w-2 rounded-full border border-gold bg-void" />
            </li>
          ))}
        </ol>
        </div>
      </div>
    </section>
  );
}
