"use client";
import { useEffect, useRef, useState } from "react";

/** Two-part cursor: a precise dot and a lagging ring that grows and labels interactive targets. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState("");
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    setEnabled(true);
    document.documentElement.classList.add("has-cursor");
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0;
    let scale = 1, target = 1;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cursor], a, button");
      const l = el?.dataset.cursor ?? "";
      target = el ? (l ? 3.2 : 1.8) : 1;
      setLabel(l);
    };
    const loop = () => {
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      scale += (target - scale) * 0.15;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px,${ry}px,0) translate(-50%,-50%) scale(${scale})`;
      if (tag.current) tag.current.style.transform = `translate3d(${rx}px,${ry}px,0) translate(-50%,-50%)`;
      raf = requestAnimationFrame(loop);
    };
    const leave = () => ring.current && (ring.current.style.opacity = "0");
    const enter = () => ring.current && (ring.current.style.opacity = "1");
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("pointerenter", enter);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      document.removeEventListener("pointerenter", enter);
      document.documentElement.classList.remove("has-cursor");
    };
  }, []);

  if (!enabled) return null;
  return (
    <>
      <div ref={ring} aria-hidden className={`pointer-events-none fixed left-0 top-0 z-[9999] h-10 w-10 rounded-full border border-gold/60 transition-[opacity,background-color] duration-300 ${label ? "bg-gold/90" : ""}`} />
      <div ref={tag} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[9999] font-mono text-[10px] uppercase tracking-[0.2em] text-void">
        {label}
      </div>
      <div ref={dot} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[9999] h-1.5 w-1.5 rounded-full bg-gold" />
    </>
  );
}
