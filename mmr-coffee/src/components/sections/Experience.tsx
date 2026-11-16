"use client";
import dynamic from "next/dynamic";
import { useCapability } from "@/lib/capability";
import { LazyCanvas } from "../ui/LazyCanvas";
import { FadeUp, RevealLines } from "../ui/Reveal";
import { media } from "@/lib/media";
import { useLang } from "@/lib/i18n";

const LiquidField = dynamic(() => import("../three/LiquidField").then((m) => m.LiquidField), { ssr: false });

export function Experience() {
  const cap = useCapability();
  const { t, lang } = useLang();
  const moments = t.experience.moments;
  const film = media.experience();
  return (
    <section id="experience" className="relative min-h-[110svh] overflow-hidden bg-roast py-32" aria-labelledby="exp-title">
      {film ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          poster={film.poster}
          autoPlay={!cap.reduced}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
        >
          {film.webm && <source src={film.webm} type="video/webm" />}
          <source src={film.src} type="video/mp4" />
        </video>
      ) : (
        <LazyCanvas
          className="absolute inset-0"
          dpr={0.5}
          camera={{ position: [0, 0, 5], fov: 45 }}
          fallback={<div className="liquid-fallback absolute inset-0" />}
        >
          <LiquidField lite={cap.tier !== "high"} />
        </LazyCanvas>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-void via-transparent to-void" />

      <div className="gutter relative z-10 flex min-h-[80svh] flex-col justify-between gap-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-gold">{t.experience.eyebrow}</p>
        <div id="exp-title">
          <RevealLines
            key={lang}
            lines={t.experience.title}
            className="font-display text-[clamp(44px,9vw,150px)] font-extrabold leading-[0.88] tracking-[-0.03em] text-cream [&>span:last-child]:font-serif [&>span:last-child]:font-normal [&>span:last-child]:italic [&>span:last-child]:tracking-normal [&>span:last-child]:text-gold-soft"
          />
        </div>

        <div className="grid gap-12 md:grid-cols-3 md:gap-8">
          {moments.map((m, i) => (
            <FadeUp key={m.k} delay={i * 0.12} className="flex items-start gap-5">
              <div className={`lens lens-${m.k} h-24 w-24 shrink-0 rounded-full`} data-cursor={t.experience.macro} aria-hidden />
              <div className="min-w-0">
                <div className="flex items-baseline gap-3">
                  <h3 className="font-display text-2xl font-bold uppercase text-cream">{m.title}</h3>
                  <span className="font-mono text-[10px] tracking-[0.2em] text-gold tabular-nums">{m.stat}</span>
                </div>
                <p className="mt-2 text-cream/65">{m.text}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-24 overflow-hidden border-y border-hair py-6" aria-hidden>
        <div className="marquee flex w-max gap-12 whitespace-nowrap font-display text-[clamp(40px,7vw,100px)] font-extrabold uppercase leading-none">
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k} className="flex gap-12">
              {t.experience.marquee.map((w) => (
                <span key={w} className="flex items-center gap-12">
                  <span className="outline-text">{w}</span>
                  <span className="text-gold">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
