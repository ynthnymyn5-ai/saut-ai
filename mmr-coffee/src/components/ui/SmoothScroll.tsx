"use client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import { motionState } from "@/lib/scroll";

/**
 * Native browser scrolling (fastest and most familiar on every device) plus a
 * passive pointer tracker that the 3D scenes read for their parallax.
 */
export function SmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        motionState.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
        motionState.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
