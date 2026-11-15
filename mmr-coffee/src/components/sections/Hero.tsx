"use client";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useCapability } from "@/lib/capability";
import { LazyCanvas } from "../ui/LazyCanvas";
import { LuxButton } from "../ui/Magnetic";
import { RevealLines } from "../ui/Reveal";
import { StageFallback } from "../ui/Fallbacks";

const HeroScene = dynamic(() => import("../three/HeroScene").then((m) => m.HeroScene), { ssr: false });

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero({ started, go }: { started: boolean; go: (id: string) => void }) {
  const cap = useCapability();
  return (
    <section id="home" className="relative h-[100svh] min-h-[640px] w-full overflow-hidden bg-void">
      <LazyCanvas eager className="absolute inset-0" camera={{ fov: 32, position: [0, 10, 19], near: 0.1, far: 60 }} shadows={cap.tier === "high"} fallback={<StageFallback />}>
        <HeroScene started={started} lite={cap.tier !== "high"} reduced={cap.reduced} />
      </LazyCanvas>

      {/* readability gradients */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-void via-void/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-void/80 to-transparent" />

      {/* side meta */}
      <motion.div
        className="gutter pointer-events-none absolute inset-x-0 top-28 hidden justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-smoke md:flex"
        initial={{ opacity: 0 }}
        animate={started ? { opacity: 1 } : {}}
        transition={{ delay: 1.6, duration: 1.2 }}
      >
        <span>N° 001 — House Signature</span>
        <span className="tabular-nums">93 °C · 9 bar · 28 s</span>
      </motion.div>

      {/* Headline split around the cup: first line above it, second line below it, right-aligned */}
      <RevealLines
        as="h1"
        play={started}
        delay={0.9}
        stagger={0.25}
        lines={["BEYOND THE ORDINARY.", "BEYOND COFFEE."]}
        className="gutter pointer-events-none absolute inset-x-0 top-[13svh] flex flex-col font-display text-[clamp(34px,9.4vw,92px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-cream md:bottom-[clamp(150px,21svh,210px)] md:top-[14svh] md:justify-between md:text-[clamp(40px,5.2vw,92px)] [&>span:last-child]:text-gold md:[&>span:last-child]:text-right"
      />

      <div className="gutter absolute inset-x-0 bottom-0 pb-[max(32px,env(safe-area-inset-bottom))]">
        <motion.div
          className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
          initial={{ opacity: 0, y: 24 }}
          animate={started ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1.7, duration: 1.2, ease }}
        >
          <div className="flex items-end gap-6">
            <span className="relative hidden h-14 w-px shrink-0 overflow-hidden bg-hair md:block" aria-hidden>
              <span className="scroll-cue absolute inset-x-0 top-0 h-1/2 bg-gold" />
            </span>
            <p className="max-w-[26rem] font-serif text-xl leading-snug text-cream/80 md:text-2xl">
              Discover a new dimension of coffee. <em className="text-gold-soft">Crafted with passion.</em> Designed for perfection.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <LuxButton onClick={() => go("journey")}>Explore our world</LuxButton>
            <LuxButton variant="ghost" onClick={() => go("menu")}>Discover the menu</LuxButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
