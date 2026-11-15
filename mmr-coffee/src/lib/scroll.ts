"use client";
import type Lenis from "lenis";

/** Shared, mutable values read inside render loops (no React re-renders). */
export const motionState = {
  pointer: { x: 0, y: 0 },
  scrollVelocity: 0,
  lenis: null as Lenis | null,
};

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (motionState.lenis) motionState.lenis.scrollTo(el, { duration: 1.6 });
  else el.scrollIntoView({ behavior: "smooth" });
}
