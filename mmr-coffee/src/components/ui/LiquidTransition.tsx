"use client";
import { gsap } from "gsap";
import { forwardRef, useImperativeHandle, useRef } from "react";

export type LiquidHandle = { play: (midpoint: () => void) => void };

/** A coffee wave that floods the screen, lets the page jump underneath, then drains away. */
export const LiquidTransition = forwardRef<LiquidHandle>(function LiquidTransition(_, ref) {
  const path = useRef<SVGPathElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useImperativeHandle(ref, () => ({
    play(midpoint) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || !path.current || !wrap.current) return midpoint();
      if (busy.current) return;
      busy.current = true;
      const p = path.current;
      const flat0 = "M0 100 Q50 100 100 100 L100 100 L0 100 Z";
      const wave = "M0 40 Q50 -5 100 40 L100 100 L0 100 Z";
      const full = "M0 0 Q50 0 100 0 L100 100 L0 100 Z";
      const waveTop = "M0 0 Q50 0 100 0 L100 60 Q50 105 0 60 Z";
      const flatTop = "M0 0 Q50 0 100 0 L100 0 Q50 0 0 0 Z";
      gsap.timeline({ onComplete: () => { busy.current = false; gsap.set(wrap.current, { autoAlpha: 0 }); } })
        .set(wrap.current, { autoAlpha: 1 })
        .set(p, { attr: { d: flat0 } })
        .to(p, { attr: { d: wave }, duration: 0.45, ease: "power3.in" })
        .to(p, { attr: { d: full }, duration: 0.3, ease: "power2.out" })
        .add(() => midpoint())
        .set(p, { attr: { d: full } }, "+=0.15")
        .to(p, { attr: { d: waveTop }, duration: 0.45, ease: "power3.in" })
        .to(p, { attr: { d: flatTop }, duration: 0.35, ease: "power2.out" });
    },
  }));

  return (
    <div ref={wrap} className="pointer-events-none invisible fixed inset-0 z-[90]" aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="lq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c08a5b" />
            <stop offset="0.12" stopColor="#2a1a12" />
            <stop offset="1" stopColor="#070605" />
          </linearGradient>
        </defs>
        <path ref={path} fill="url(#lq)" d="M0 100 Q50 100 100 100 L100 100 L0 100 Z" />
      </svg>
    </div>
  );
});
