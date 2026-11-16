"use client";

/** Shared, mutable values read inside render loops (no React re-renders). */
export const motionState = {
  pointer: { x: 0, y: 0 },
};

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}
