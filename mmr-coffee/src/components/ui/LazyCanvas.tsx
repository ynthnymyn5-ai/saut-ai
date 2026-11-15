"use client";
import dynamic from "next/dynamic";
import type { CanvasProps } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useCapability } from "@/lib/capability";

// The 3D runtime (three + fiber) loads only when the first canvas is about to appear.
const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), { ssr: false });

type Props = Omit<CanvasProps, "children"> & {
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
  /** Mount immediately instead of waiting for the viewport */
  eager?: boolean;
};

/**
 * Mounts a WebGL canvas only when it nears the viewport, pauses rendering when it leaves,
 * and shows a designed static fallback on devices without WebGL.
 */
export function LazyCanvas({ children, fallback, className, eager, dpr, gl, ...rest }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(!!eager);
  const [visible, setVisible] = useState(!!eager);
  const cap = useCapability();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setVisible(e.isIntersecting);
        if (e.isIntersecting) setMounted(true);
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const showFallback = cap.ready && cap.tier === "none";
  return (
    <div ref={host} className={className}>
      {showFallback ? (
        fallback
      ) : mounted && cap.ready ? (
        <Canvas
          dpr={dpr ?? (cap.tier === "high" ? [1, 2] : [1, 1.4])}
          frameloop={visible ? "always" : "never"}
          gl={{ antialias: cap.tier === "high", powerPreference: "high-performance", alpha: false, ...(gl as object) }}
          {...rest}
        >
          <Suspense fallback={null}>{children}</Suspense>
        </Canvas>
      ) : (
        fallback
      )}
    </div>
  );
}
