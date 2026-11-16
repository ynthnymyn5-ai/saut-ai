"use client";
import dynamic from "next/dynamic";
import type { CanvasProps } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useCapability } from "@/lib/capability";

// The 3D runtime (three + fiber) loads only when the first canvas is about to appear.
const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });
const PerformanceMonitor = dynamic(() => import("@react-three/drei").then((m) => m.PerformanceMonitor), { ssr: false });

type Props = Omit<CanvasProps, "children"> & {
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
  /** Mount immediately instead of waiting for the viewport */
  eager?: boolean;
};

/**
 * Mounts a WebGL canvas one screen before it scrolls into view (so shaders are ready),
 * renders only while it is actually on screen, caps the pixel ratio, and lowers it
 * further if the device cannot hold a steady frame rate.
 */
export function LazyCanvas({ children, fallback, className, eager, dpr, gl, ...rest }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(!!eager);
  const [visible, setVisible] = useState(!!eager);
  const cap = useCapability();
  const maxDpr = typeof dpr === "number" ? dpr : cap.tier === "high" ? 1.5 : 1;
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const near = new IntersectionObserver(([e]) => e.isIntersecting && setMounted(true), { rootMargin: "100% 0px" });
    const onScreen = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "0px" });
    near.observe(el);
    onScreen.observe(el);
    return () => {
      near.disconnect();
      onScreen.disconnect();
    };
  }, []);

  const showFallback = cap.ready && cap.tier === "none";
  return (
    <div ref={host} className={className}>
      {showFallback ? (
        fallback
      ) : mounted && cap.ready ? (
        <Canvas
          dpr={Math.max(0.5, Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio, maxDpr) * scale)}
          frameloop={visible ? "always" : "never"}
          gl={{ antialias: cap.tier === "high", powerPreference: "high-performance", alpha: false, stencil: false, ...(gl as object) }}
          {...rest}
        >
          <PerformanceMonitor flipflops={3} onDecline={() => setScale((s) => Math.max(0.5, s - 0.25))} onIncline={() => setScale((s) => Math.min(1, s + 0.25))} />
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      ) : (
        fallback
      )}
    </div>
  );
}
