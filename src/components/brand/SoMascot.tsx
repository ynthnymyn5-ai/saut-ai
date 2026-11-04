"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "completed" | "transfer";

/**
 * SO (سو) — SAUT AI's mascot: a floating pearl robot (antenna, ear pods, dark visor) with a friendly face.
 * Expression and light-waves change with the conversation state.
 */
export function SoMascot({ state = "idle", size = 280, hue = 265, className }: { state?: VoiceState; size?: number; hue?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const prefersReduced = useReducedMotion();
  // Small mascots appear many times in lists: draw them light (no blur, glow or endless loops) so phones stay smooth.
  const lite = size <= 96;
  const reduce = prefersReduced || lite;
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
      {!lite && <div className="absolute inset-[-18%] rounded-full blur-3xl opacity-60" style={{ background: `radial-gradient(circle, ${c1}66 0%, ${c2}33 45%, transparent 70%)` }} />}
      {/* light waves */}
      {!lite && [0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: i % 2 ? `${c2}55` : `${c1}55` }}
          animate={reduce || !active ? { scale: 1, opacity: 0 } : { scale: [1, 1.45], opacity: [0.6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.7, ease: "easeOut" }}
        />
      ))}
      <svg viewBox="0 0 200 200" className={cn("relative h-full w-full", !lite && "drop-shadow-[0_30px_60px_rgba(139,92,246,.45)]")}>
        <defs>
          {/* pearl shell: bright glossy white, tinted by the brand colours at the edges */}
          <radialGradient id={`body${id}`} cx="38%" cy="30%" r="78%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".45" stopColor="#EEF0FF" />
            <stop offset=".8" stopColor={`hsl(${hue} 60% 82%)`} />
            <stop offset="1" stopColor={`hsl(${hue} 55% 62%)`} />
          </radialGradient>
          <radialGradient id={`face${id}`} cx="50%" cy="40%" r="70%">
            <stop offset="0" stopColor="#14112E" />
            <stop offset="1" stopColor="#05040F" />
          </radialGradient>
          <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".95" />
            <stop offset=".55" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor={c2} stopOpacity=".85" />
          </linearGradient>
          <linearGradient id={`ear${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor={`hsl(${hue} 45% 78%)`} />
          </linearGradient>
          <linearGradient id={`glass${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".16" />
            <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* antenna */}
        <line x1="100" y1="10" x2="100" y2="30" stroke={c1} strokeOpacity=".7" strokeWidth="1.5" />
        <motion.circle cx="100" cy="9" r="4.5" fill={c1} style={{ filter: `drop-shadow(0 0 6px ${c1})` }}
          animate={reduce ? undefined : { opacity: [1, 0.35, 1] }} transition={{ duration: 2.4, repeat: Infinity }} />
        <circle cx="100" cy="32" r="3" fill={c1} opacity=".85" />

        {/* ear pods */}
        {[24, 176].map((x) => (
          <g key={x}>
            <rect x={x - 11} y="84" width="22" height="40" rx="11" fill={`url(#ear${id})`} stroke={c1} strokeOpacity=".45" />
            <rect x={x - 4} y="92" width="8" height="24" rx="4" fill={c1} opacity=".35" />
          </g>
        ))}

        {/* shell */}
        <circle cx="100" cy="104" r="72" fill={`url(#body${id})`} />
        <circle cx="100" cy="104" r="71" fill="none" stroke={`url(#rim${id})`} strokeWidth="1.6" />
        <ellipse cx="74" cy="62" rx="26" ry="13" fill="#fff" opacity=".7" transform="rotate(-28 74 62)" />

        {/* visor */}
        <rect x="42" y="74" width="116" height="66" rx="33" fill={`url(#face${id})`} stroke={c1} strokeOpacity=".35" />
        <rect x="46" y="77" width="108" height="30" rx="15" fill={`url(#glass${id})`} />
        <Eyes state={state} c={c1} reduce={!!reduce} />
        <g transform="translate(0 6)"><Mouth state={state} c={c1} reduce={!!reduce} /></g>

        {/* chin light */}
        <ellipse cx="100" cy="172" rx="16" ry="3" fill={c1} opacity=".55" style={{ filter: `drop-shadow(0 0 6px ${c1})` }} />
      </svg>
    </motion.div>
  );
}

function Eyes({ state, c, reduce }: { state: VoiceState; c: string; reduce: boolean }) {
  const happy = state === "completed";
  if (happy) {
    return (
      <g stroke={c} strokeWidth="5" strokeLinecap="round" fill="none" style={{ filter: `drop-shadow(0 0 6px ${c})` }}>
        <path d="M68 104 q9 -12 18 0" />
        <path d="M114 104 q9 -12 18 0" />
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
      <rect x={70 + look} y={state === "thinking" ? 88 : 90} width="15" height="24" rx="7.5" />
      <rect x={115 + look} y={state === "thinking" ? 88 : 90} width="15" height="24" rx="7.5" />
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
