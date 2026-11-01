"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "completed" | "transfer";

/**
 * SO (سو) — SAUT AI's mascot: a floating glass orb with a friendly face.
 * Expression and light-waves change with the conversation state.
 */
export function SoMascot({ state = "idle", size = 280, hue = 265, className }: { state?: VoiceState; size?: number; hue?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const active = state === "listening" || state === "speaking";
  const c1 = `hsl(${hue} 90% 66%)`;
  const c2 = `hsl(${(hue + 295) % 360} 92% 60%)`;

  return (
    <motion.div
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
      animate={reduce ? undefined : { y: [0, -10, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      aria-label={`SO — ${state}`}
      role="img"
    >
      {/* aura */}
      <div className="absolute inset-[-18%] rounded-full blur-3xl opacity-60" style={{ background: `radial-gradient(circle, ${c1}66 0%, ${c2}33 45%, transparent 70%)` }} />
      {/* light waves */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: i % 2 ? `${c2}55` : `${c1}55` }}
          animate={reduce || !active ? { scale: 1, opacity: 0 } : { scale: [1, 1.45], opacity: [0.6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: "easeOut" }}
        />
      ))}
      <svg viewBox="0 0 200 200" className="relative h-full w-full drop-shadow-[0_30px_60px_rgba(139,92,246,.45)]">
        <defs>
          <radialGradient id={`body${id}`} cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".95" />
            <stop offset=".18" stopColor={c1} />
            <stop offset=".62" stopColor={c2} />
            <stop offset="1" stopColor="#120F2E" />
          </radialGradient>
          <radialGradient id={`face${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#0D0B22" stopOpacity=".92" />
            <stop offset="1" stopColor="#0D0B22" stopOpacity=".55" />
          </radialGradient>
          <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".9" />
            <stop offset=".5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor={c2} stopOpacity=".8" />
          </linearGradient>
          <clipPath id={`clip${id}`}>
            <circle cx="100" cy="100" r="84" />
          </clipPath>
        </defs>

        <circle cx="100" cy="100" r="84" fill={`url(#body${id})`} />
        {/* internal swirling light */}
        <g clipPath={`url(#clip${id})`} opacity=".55">
          <motion.ellipse
            cx="100" cy="130" rx="120" ry="26" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5"
            animate={reduce ? undefined : { rotate: [0, 360] }} style={{ originX: "100px", originY: "100px" }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          />
          <motion.ellipse
            cx="100" cy="70" rx="110" ry="18" fill="none" stroke={c1} strokeOpacity=".6" strokeWidth="1"
            animate={reduce ? undefined : { rotate: [360, 0] }} style={{ originX: "100px", originY: "100px" }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          />
        </g>
        <circle cx="100" cy="100" r="83" fill="none" stroke={`url(#rim${id})`} strokeWidth="1.6" />
        {/* glass highlight */}
        <ellipse cx="72" cy="56" rx="30" ry="17" fill="#fff" opacity=".28" transform="rotate(-28 72 56)" />

        {/* face visor */}
        <rect x="46" y="78" width="108" height="56" rx="28" fill={`url(#face${id})`} stroke="#fff" strokeOpacity=".12" />
        <Eyes state={state} c={c1} reduce={!!reduce} />
        <Mouth state={state} c={c1} reduce={!!reduce} />
      </svg>
    </motion.div>
  );
}

function Eyes({ state, c, reduce }: { state: VoiceState; c: string; reduce: boolean }) {
  const happy = state === "completed";
  if (happy) {
    return (
      <g stroke={c} strokeWidth="5" strokeLinecap="round" fill="none" style={{ filter: `drop-shadow(0 0 6px ${c})` }}>
        <path d="M70 104 q8 -10 16 0" />
        <path d="M114 104 q8 -10 16 0" />
      </g>
    );
  }
  const look = state === "thinking" ? -4 : 0;
  return (
    <motion.g
      fill={c}
      style={{ filter: `drop-shadow(0 0 7px ${c})`, originY: "102px" }}
      animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1, 1] }}
      transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.46, 0.5, 0.54, 1] }}
    >
      <rect x={72 + look} y={state === "thinking" ? 92 : 94} width="13" height="18" rx="6.5" />
      <rect x={115 + look} y={state === "thinking" ? 92 : 94} width="13" height="18" rx="6.5" />
    </motion.g>
  );
}

function Mouth({ state, c, reduce }: { state: VoiceState; c: string; reduce: boolean }) {
  if (state === "speaking") {
    return (
      <g fill={c}>
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.rect
            key={i} x={88 + i * 5.5} y="114" width="3" height="10" rx="1.5"
            style={{ originY: "119px" }}
            animate={reduce ? undefined : { scaleY: [0.3, 1.2, 0.5, 1, 0.3] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.08 }}
          />
        ))}
      </g>
    );
  }
  if (state === "thinking") return <circle cx="100" cy="120" r="3" fill={c} opacity=".8" />;
  if (state === "transfer") return <path d="M90 120 h20" stroke={c} strokeWidth="3.5" strokeLinecap="round" />;
  if (state === "listening") return <ellipse cx="100" cy="120" rx="5" ry="4" fill="none" stroke={c} strokeWidth="3" />;
  return <path d="M89 116 q11 10 22 0" stroke={c} strokeWidth="3.5" strokeLinecap="round" fill="none" />;
}
