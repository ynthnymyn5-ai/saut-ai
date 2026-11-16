"use client";
import { useRef, type ReactNode } from "react";

/** Pulls its child toward the pointer while hovered, then springs back. */
export function Magnetic({ children, strength = 0.35, className = "" }: { children: ReactNode; strength?: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !el.current) return;
    const r = el.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    el.current.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
  };
  const reset = () => el.current && (el.current.style.transform = "translate(0,0)");
  return (
    <span ref={el} onPointerMove={onMove} onPointerLeave={reset} className={`inline-block transition-transform duration-500 ease-lux ${className}`}>
      {children}
    </span>
  );
}

export function LuxButton({ children, onClick, variant = "solid", cursor }: { children: ReactNode; onClick?: () => void; variant?: "solid" | "ghost"; cursor?: string }) {
  return (
    <Magnetic>
      <button
        type="button"
        onClick={onClick}
        data-cursor={cursor}
        className={`lux-btn group relative overflow-hidden rounded-full px-8 py-4 font-mono text-[11px] uppercase tracking-[0.32em] transition-colors duration-500 ${
          variant === "solid" ? "bg-gold text-void" : "border border-cream/25 text-cream hover:border-gold"
        }`}
      >
        <span className="relative z-10 flex items-center gap-3">
          {children}
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" aria-hidden className="transition-transform duration-500 ease-lux group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1">
            <path d="M0 5h12M8 1l4 4-4 4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </span>
        <span aria-hidden className={`absolute inset-0 translate-y-full rounded-full transition-transform duration-700 ease-lux group-hover:translate-y-0 ${variant === "solid" ? "bg-cream" : "bg-gold/15"}`} />
      </button>
    </Magnetic>
  );
}
