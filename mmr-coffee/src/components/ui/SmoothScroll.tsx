"use client";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import { motionState } from "@/lib/scroll";

/** Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays perfectly in sync. */
export function SmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const onMove = (e: PointerEvent) => {
      motionState.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      motionState.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return () => window.removeEventListener("pointermove", onMove);

    const lenis = new Lenis({ duration: 1.25, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), touchMultiplier: 1.4 });
    motionState.lenis = lenis;
    lenis.on("scroll", (e: Lenis) => {
      motionState.scrollVelocity = e.velocity;
      ScrollTrigger.update();
    });
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      motionState.lenis = null;
      window.removeEventListener("pointermove", onMove);
    };
  }, []);
  return null;
}
