"use client";
import { motion, useReducedMotion } from "framer-motion";
import { SoMascot, type VoiceState } from "@/components/brand/SoMascot";
import { cn } from "@/lib/utils";

/**
 * SO in its "control room": the robot floating over glowing rings, with glass cards
 * (a chat that is typing, a live chart, a task list) drifting around it.
 * Purely decorative — hidden from screen readers except for the mascot's own label.
 */
export function SoScene({ size = 320, state = "speaking", className }: { size?: number; state?: VoiceState; className?: string }) {
  const reduce = useReducedMotion();
  const W = size * 1.75;
  const float = (d: number, y = 8) => (reduce ? {} : { animate: { y: [0, -y, 0] }, transition: { duration: 5 + d, repeat: Infinity, ease: "easeInOut" as const, delay: d } });
  const card = "absolute rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-[0_8px_32px_rgba(0,0,0,.35)] backdrop-blur-md";
  return (
    <div className={cn("relative mx-auto max-w-full overflow-hidden", className)} style={{ width: W, height: size * 1.45 }}>
      {/* orbit ring + base glow rings */}
      <div aria-hidden className="absolute left-1/2 top-[6%] -translate-x-1/2 rounded-full border border-violet/25" style={{ width: size * 1.25, height: size * 1.25 }} />
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2" style={{ bottom: size * 0.04, width: size * 1.3, height: size * 0.3 }}>
        {[1, 0.72, 0.45].map((k, i) => (
          <motion.div key={i} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-electric/40"
            style={{ width: `${k * 100}%`, height: `${k * 100}%`, boxShadow: i === 2 ? "0 0 40px 6px rgba(139,92,246,.45)" : undefined }}
            animate={reduce ? undefined : { opacity: [0.35, 0.9, 0.35] }} transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }} />
        ))}
        <div className="absolute left-1/2 top-1/2 h-[30%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-violet/60 blur-xl" />
      </div>
      {/* light beam */}
      <div aria-hidden className="absolute left-1/2 -translate-x-1/2 bg-gradient-to-b from-electric/0 via-electric/25 to-violet/50 blur-md" style={{ top: size * 0.9, width: size * 0.06, height: size * 0.4 }} />

      {/* the robot */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: size * 0.12 }}>
        <SoMascot size={size} state={state} />
      </div>

      {/* glass cards */}
      <div aria-hidden>
        <motion.div className={card} style={{ left: 0, top: size * 0.12, width: size * 0.42 }} {...float(0)}>
          {[0.8, 0.55, 0.65].map((w, i) => <div key={i} className="mb-1.5 flex items-center gap-1.5 last:mb-0"><span className="h-2 w-2 rounded-full bg-electric/80" /><span className="h-1.5 rounded-full bg-white/25" style={{ width: `${w * 100}%` }} /></div>)}
        </motion.div>
        <motion.div className={cn(card, "flex gap-1.5 rounded-bl-sm")} style={{ left: size * 0.02, top: size * 0.58 }} {...float(0.8, 10)}>
          {[0, 1, 2].map((i) => <motion.span key={i} className="h-2.5 w-2.5 rounded-full bg-electric" animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />)}
        </motion.div>
        <motion.div className={card} style={{ right: 0, top: size * 0.84, width: size * 0.42 }} {...float(1.4)}>
          <svg viewBox="0 0 100 36" className="h-auto w-full"><motion.path d="M0 30 L12 24 L24 27 L38 14 L50 19 L64 8 L78 13 L100 3" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2, ease: "easeOut" }} /><path d="M0 30 L12 24 L24 27 L38 14 L50 19 L64 8 L78 13 L100 3 L100 36 L0 36Z" fill="#38BDF8" opacity=".12" /></svg>
        </motion.div>
        <motion.div className={cn(card, "flex gap-1.5 rounded-br-sm")} style={{ right: size * 0.04, top: size * 0.34 }} {...float(2.1, 6)}>
          {[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-violet-soft" />)}
        </motion.div>
      </div>
    </div>
  );
}
