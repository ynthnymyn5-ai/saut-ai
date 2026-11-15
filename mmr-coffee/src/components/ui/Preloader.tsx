"use client";
import { gsap } from "gsap";
import { useEffect, useRef, useState } from "react";
import { Mark } from "./Logo";

/**
 * Opening sequence (~3s): the bean mark draws itself, a counter fills like an extraction,
 * the MMR letters rise through a gold rule, then the screen parts on a liquid seam.
 */
export function Preloader({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.style.overflow = "hidden";
    const finish = () => {
      document.documentElement.style.overflow = "";
      setGone(true);
    };
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
      tl.to(c, { v: 100, duration: 1.9, ease: "power2.inOut", onUpdate: () => setCount(Math.round(c.v)) }, 0)
        .to(".pl-fill", { scaleX: 1, duration: 1.9, ease: "power2.inOut" }, 0)
        .from(".pl-letter", { yPercent: 120, duration: 1.1, ease: "expo.out", stagger: 0.08 }, 0.7)
        .from(".pl-tag", { opacity: 0, y: 10, duration: 0.8, ease: "power2.out" }, 1.2)
        .to(".pl-meta", { opacity: 0, duration: 0.3 }, 2.0)
        .to(".pl-letter", { yPercent: -120, duration: 0.7, ease: "expo.in", stagger: 0.05 }, 2.15)
        .to(".pl-mark", { scale: 0.6, opacity: 0, duration: 0.6, ease: "expo.in" }, 2.15)
        .add(() => onDone(), 2.55)
        .to(".pl-top", { yPercent: -100, duration: 1.2, ease: "expo.inOut" }, 2.6)
        .to(".pl-bottom", { yPercent: 100, duration: 1.2, ease: "expo.inOut" }, 2.6)
        .add(finish);
    }, root);
    return () => {
      ctx.revert();
      document.documentElement.style.overflow = "";
    };
  }, [onDone]);

  if (gone) return null;
  return (
    <div ref={root} className="fixed inset-0 z-[100]" role="status" aria-label="Loading MMR">
      <div className="pl-top absolute inset-x-0 top-0 h-1/2 bg-void">
        <svg className="absolute -bottom-px left-0 h-10 w-full text-void" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden>
          <path d="M0 0 H100 V4 Q75 10 50 5 T0 6 Z" fill="currentColor" />
        </svg>
      </div>
      <div className="pl-bottom absolute inset-x-0 bottom-0 h-1/2 bg-void" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-8">
          <Mark size={64} draw className="pl-mark text-gold" />
          <div className="flex overflow-hidden font-display text-[clamp(56px,12vw,150px)] font-extrabold leading-none tracking-[0.12em] text-cream">
            {"MMR".split("").map((l, i) => (
              <span key={i} className="pl-letter inline-block">
                {l}
              </span>
            ))}
          </div>
          <p className="pl-tag font-mono text-[10px] uppercase tracking-mega text-gold">Specialty coffee · Crafted for the moment</p>
        </div>
      </div>
      <div className="pl-meta absolute inset-x-0 bottom-10 mx-auto flex w-[min(420px,80vw)] flex-col gap-3">
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">
          <span>Extracting</span>
          <span className="tabular-nums text-cream">{String(count).padStart(3, "0")}%</span>
        </div>
        <div className="h-px w-full bg-hair">
          <div className="pl-fill h-px w-full origin-left scale-x-0 bg-gradient-to-r from-crema via-gold to-gold-soft" />
        </div>
      </div>
    </div>
  );
}
