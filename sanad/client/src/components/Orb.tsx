/**
 * The Sanad orb — a canvas of swirling, glowing light rings.
 *
 *   idle       slow breathing pulse
 *   listening  rings expand and ripple with microphone volume
 *   thinking   rings rotate faster, warmer colours
 *   speaking   pulses in sync with Sanad's voice level
 *
 * Parameters ease toward per-state targets every frame so transitions are
 * smooth. The audio level comes from `audioBus` (no React re-renders).
 */
import { useEffect, useRef } from "react";
import { audioBus, type OrbState } from "../voice/audioBus";

interface Params {
  speed: number; // rotation speed
  scale: number; // base radius multiplier
  wobble: number; // ring deformation
  warmth: number; // 0 = purple, 1 = orange-heavy
  glow: number;
}

const TARGETS: Record<OrbState, Params> = {
  idle: { speed: 0.25, scale: 1, wobble: 0.05, warmth: 0.25, glow: 0.75 },
  listening: { speed: 0.5, scale: 1.08, wobble: 0.1, warmth: 0.15, glow: 1 },
  thinking: { speed: 2.4, scale: 0.94, wobble: 0.08, warmth: 0.7, glow: 0.95 },
  speaking: { speed: 0.8, scale: 1.04, wobble: 0.12, warmth: 0.45, glow: 1.1 },
};

const RINGS = 9;
const PARTICLES = 70;

export function Orb({ state, size = 360, onClick, className = "" }: { state: OrbState; size?: number; onClick?: () => void; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    audioBus.state = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const p: Params = { ...TARGETS.idle };
    const rings = Array.from({ length: RINGS }, (_, i) => ({
      tiltX: 0.25 + ((i * 37) % 60) / 100, // vertical squash → 3D ring illusion
      rot: (i / RINGS) * Math.PI,
      dir: i % 2 ? 1 : -1,
      freq: 2 + (i % 4),
      phase: i * 1.7,
      radius: 0.62 + (i % 5) * 0.07,
    }));
    const particles = Array.from({ length: PARTICLES }, (_, i) => ({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.6, s: 0.2 + Math.random() * 0.8, z: Math.random(), i }));

    let t = 0;
    let last = performance.now();
    let level = 0;
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const target = TARGETS[st];
      const ease = 1 - Math.pow(0.02, dt);
      (Object.keys(p) as (keyof Params)[]).forEach((k) => (p[k] += (target[k] - p[k]) * ease));

      // Audio level: real when listening/speaking, synthetic breathing otherwise
      const raw = st === "listening" || st === "speaking" ? audioBus.level : 0;
      level += (raw - level) * 0.25;
      t += dt * (reduceMotion ? 0.3 : 1);

      const breath = st === "idle" ? Math.sin(t * 1.3) * 0.035 : 0;
      const R = (Math.min(w, h) / 2) * 0.62 * (p.scale + breath + level * (st === "listening" ? 0.35 : 0.22));
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Core glow
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      core.addColorStop(0, `rgba(255, 220, 255, ${0.55 * p.glow + level * 0.3})`);
      core.addColorStop(0.18, `rgba(192, 132, 252, ${0.45 * p.glow})`);
      core.addColorStop(0.45, `rgba(124, 58, 237, ${0.22 * p.glow})`);
      core.addColorStop(0.75, `rgba(251, 146, 60, ${0.06 + p.warmth * 0.08})`);
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";

      // Rings
      rings.forEach((ring, i) => {
        const rot = ring.rot + t * p.speed * ring.dir * (0.6 + i * 0.08);
        const mix = (Math.sin(t * 0.5 + ring.phase) + 1) / 2;
        const warm = Math.min(1, p.warmth * 0.9 + mix * 0.35);
        // purple (168,85,247) → orange (251,146,60)
        const r = Math.round(168 + (251 - 168) * warm);
        const g = Math.round(85 + (146 - 85) * warm);
        const b = Math.round(247 + (60 - 247) * warm);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 + 0.35 * p.glow})`;
        ctx.lineWidth = 1.2 + level * 2.2;
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
        ctx.shadowBlur = 14 * p.glow;

        ctx.beginPath();
        const steps = 120;
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * Math.PI * 2;
          const wob = Math.sin(a * ring.freq + t * (1.2 + p.speed) + ring.phase) * (p.wobble + level * 0.18);
          const rr = R * ring.radius * (1 + wob);
          // ring in its own plane, squashed vertically then rotated → 3D feel
          const x0 = Math.cos(a) * rr;
          const y0 = Math.sin(a) * rr * ring.tiltX;
          const x = cx + x0 * Math.cos(rot) - y0 * Math.sin(rot);
          const y = cy + x0 * Math.sin(rot) + y0 * Math.cos(rot);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      });

      // Orbiting particles
      ctx.shadowBlur = 8;
      particles.forEach((pt) => {
        pt.a += dt * pt.s * (0.3 + p.speed * 0.6);
        const rr = R * pt.r * (1 + level * 0.4);
        const x = cx + Math.cos(pt.a) * rr;
        const y = cy + Math.sin(pt.a) * rr * (0.4 + pt.z * 0.6);
        const alpha = 0.25 + 0.6 * Math.abs(Math.sin(t * 2 + pt.i));
        ctx.fillStyle = pt.i % 4 === 0 ? `rgba(251,146,60,${alpha})` : `rgba(216,180,254,${alpha})`;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + pt.z * 1.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Bright centre
      ctx.shadowBlur = 30;
      ctx.shadowColor = "rgba(233, 213, 255, 0.9)";
      const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
      inner.addColorStop(0, `rgba(255,255,255,${0.75 + level * 0.25})`);
      inner.addColorStop(0.4, `rgba(233,213,255,${0.35 + level * 0.3})`);
      inner.addColorStop(1, "rgba(168,85,247,0)");
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role={onClick ? "button" : "img"}
      aria-label={`Sanad — ${state}`}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick?.()}
      className={`block cursor-pointer select-none outline-none ${className}`}
      style={{ width: size, height: size, maxWidth: "100%", aspectRatio: "1 / 1" }}
    />
  );
}
