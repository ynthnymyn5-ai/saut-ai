"use client";
import { motion, useReducedMotion } from "framer-motion";
import type { ElementType } from "react";

/** Line-by-line masked text reveal. Each string in `lines` rises from behind its own clip. */
export function RevealLines({ lines, as: Tag = "h2", className = "", delay = 0, stagger = 0.09, play }: { lines: string[]; as?: ElementType; className?: string; delay?: number; stagger?: number; play?: boolean }) {
  const reduce = useReducedMotion();
  const controlled = play !== undefined;
  return (
    <Tag className={className}>
      {lines.map((l, i) => (
        <span key={i} className="reveal-line block overflow-hidden pb-[0.08em]">
          <motion.span
            className="block will-change-transform"
            initial={reduce ? false : { y: "110%", rotate: 3 }}
            {...(controlled
              ? { animate: play ? { y: "0%", rotate: 0 } : undefined }
              : { whileInView: { y: "0%", rotate: 0 }, viewport: { once: true, margin: "-10% 0px" } })}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: delay + i * stagger }}
          >
            {l}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

export function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
