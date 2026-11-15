"use client";
import { useEffect, useState } from "react";

export type Tier = "high" | "low" | "none";
export type Capability = { tier: Tier; reduced: boolean; touch: boolean; ready: boolean };

function detect(): Capability {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  let gl: WebGLRenderingContext | null = null;
  try {
    const c = document.createElement("canvas");
    gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
  } catch {
    gl = null;
  }
  if (!gl) return { tier: "none", reduced, touch, ready: true };
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const small = window.innerWidth < 820;
  const weak = cores <= 4 || mem <= 4;
  const tier: Tier = small || weak || touch ? "low" : "high";
  return { tier, reduced, touch, ready: true };
}

let cached: Capability | null = null;

/** Picks a rendering tier once per visit: full cinematic 3D, lightweight 3D, or a static fallback. */
export function useCapability(): Capability {
  const [cap, setCap] = useState<Capability>(cached ?? { tier: "low", reduced: false, touch: false, ready: false });
  useEffect(() => {
    if (!cached) cached = detect();
    setCap(cached);
  }, []);
  return cap;
}
