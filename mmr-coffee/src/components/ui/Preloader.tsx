"use client";
import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { ArabicName, MmarLogo } from "./Logo";
import { useLang } from "@/lib/i18n";

/**
 * Opening sequence (~3s): the bean mark draws itself, a counter fills like an extraction,
 * the Mmar wordmark and مرمر rise in, then the screen parts.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const { t } = useLang();
  const [count, setCount] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem("mmar-intro") === "1";
      sessionStorage.setItem("mmar-intro", "1");
    } catch {}
    const finish = () => setGone(true);
    if (seen) {
      onDone();
      finish();
      return;
    }
    if (reduced) {
      const t = setTimeout(() => {
        onDone();
        finish();
      }, 500);
      return () => clearTimeout(t);
    }
    const ctx = gsap.context(() => {
      const c = { v: 0 };
      const tl = gsap.timeline();
      tl.to(c, { v: 100, duration: 1.0, ease: "power2.inOut", onUpdate: () => setCount(Math.round(c.v)) }, 0)
        .to(".pl-fill", { scaleX: 1, duration: 1.0, ease: "power2.inOut" }, 0)
        .from(".pl-logo .logo-glyph", { y: 120, duration: 0.8, ease: "expo.out", stagger: 0.05 }, 0.1)
        .from(".pl-logo .logo-accent", { x: -40, opacity: 0, duration: 0.6, ease: "expo.out", stagger: 0.06 }, 0.45)
        .from(".pl-ar", { yPercent: 110, duration: 0.7, ease: "expo.out" }, 0.5)
        .from(".pl-tag", { opacity: 0, y: 10, duration: 0.5, ease: "power2.out" }, 0.6)
        .to(".pl-meta", { opacity: 0, duration: 0.2 }, 1.05)
        .to(".pl-brand", { y: -30, opacity: 0, duration: 0.45, ease: "expo.in" }, 1.15)
        .add(() => onDone(), 1.35)
        .to(".pl-top", { yPercent: -100, duration: 0.8, ease: "expo.inOut" }, 1.35)
        .to(".pl-bottom", { yPercent: 100, duration: 0.8, ease: "expo.inOut" }, 1.35)
        .add(finish);
    }, root);
    return () => ctx.revert();
  }, [onDone]);

  if (gone) return null;
  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[100]" role="status" aria-label={t.preloader.loading}>
      <div className="pl-top absolute inset-x-0 top-0 h-1/2 bg-void">
        <svg className="absolute -bottom-px left-0 h-10 w-full text-void" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
          <path d="M0 0 H100 V4 Q75 10 50 5 T0 6 Z" fill="currentColor" />
        </svg>
      </div>
      <div className="pl-bottom absolute inset-x-0 bottom-0 h-1/2 bg-void" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="pl-brand flex flex-col items-center gap-6">
          <MmarLogo className="pl-logo w-[min(520px,72vw)] text-cream" />
          <span className="block overflow-hidden pb-2">
            <ArabicName className="pl-ar block text-[clamp(36px,7vw,72px)] text-gold" />
          </span>
          <p className="pl-tag font-mono text-[10px] uppercase tracking-mega text-gold">{t.preloader.tag}</p>
        </div>
      </div>
      <div className="pl-meta absolute inset-x-0 bottom-10 mx-auto flex w-[min(420px,80vw)] flex-col gap-3">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">
          <span>{t.preloader.extracting}</span>
          <span className="tabular-nums text-cream">{String(count).padStart(3, "0")}%</span>
        </div>
        <div className="h-px w-full bg-hair">
          <div className="pl-fill h-px w-full origin-left scale-x-0 bg-gradient-to-r from-crema via-gold to-gold-soft" />
        </div>
      </div>
    </div>
  );
}
