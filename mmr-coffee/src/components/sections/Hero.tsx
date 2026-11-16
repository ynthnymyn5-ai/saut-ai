"use client";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { media } from "@/lib/media";
import { ArabicName } from "../ui/Logo";
import { LuxButton } from "../ui/Magnetic";
import { RevealLines } from "../ui/Reveal";

const ease = [0.16, 1, 0.3, 1] as const;

/**
 * Opening: the shop's own photograph of an espresso on the Mmar tray, revealed with a
 * slow cinematic push-in. Plain image + CSS/transform animation only, so it is instant
 * to load and smooth to scroll on every phone.
 */
export function Hero({ started, go }: { started: boolean; go: (id: string) => void }) {
  const photo = media.hero();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);

  return (
    <section ref={ref} id="home" className="relative h-[100svh] min-h-[600px] w-full overflow-hidden bg-void">
      {photo && (
        <motion.div className="absolute inset-0 will-change-transform" style={{ y }}>
          <motion.img
            src={photo.src}
            width={photo.width}
            height={photo.height}
            alt="An Mmar espresso on the tray, with a tasting card and a chocolate bar"
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover object-[38%_45%]"
            initial={reduce ? false : { scale: 1.25, filter: "brightness(0.2) blur(8px)" }}
            animate={started ? { scale: 1.06, filter: "brightness(1) blur(0px)" } : undefined}
            transition={{ duration: 2.2, ease }}
          />
        </motion.div>
      )}

      {/* readability gradients */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,6,5,.75)_0%,rgba(7,6,5,.15)_32%,rgba(7,6,5,.25)_55%,rgba(7,6,5,.92)_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_30%_45%,transparent_40%,rgba(7,6,5,.55)_100%)]" />

      {/* side meta */}
      <motion.div
        className="gutter pointer-events-none absolute inset-x-0 top-28 hidden items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-cream/70 md:flex"
        initial={{ opacity: 0 }}
        animate={started ? { opacity: 1 } : {}}
        transition={{ delay: 1, duration: 1 }}
      >
        <span>
          Neighbourhood specialty coffee · <span lang="ar" className="font-arabic normal-case tracking-normal">قهوة حي مختصة</span>
        </span>
        <span>Espresso · 1.500 KWD</span>
      </motion.div>

      <RevealLines
        as="h1"
        play={started}
        delay={0.5}
        stagger={0.2}
        lines={["BEYOND THE ORDINARY.", "BEYOND COFFEE."]}
        className="gutter pointer-events-none absolute inset-x-0 top-[13svh] flex flex-col font-display text-[clamp(34px,9.4vw,92px)] font-extrabold leading-[0.92] tracking-[-0.03em] text-cream drop-shadow-[0_4px_30px_rgba(0,0,0,.5)] md:bottom-[clamp(150px,21svh,210px)] md:top-[17svh] md:justify-between md:text-[clamp(40px,5.2vw,92px)] [&>span:last-child]:text-gold md:[&>span:last-child]:text-right"
      />

      <div className="gutter absolute inset-x-0 bottom-0 pb-[max(32px,env(safe-area-inset-bottom))]">
        <motion.div
          className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
          initial={{ opacity: 0, y: 24 }}
          animate={started ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.9, duration: 1, ease }}
        >
          <div className="flex items-end gap-5">
            <ArabicName className="hidden shrink-0 text-[56px] text-gold md:inline-block" />
            <p className="max-w-[26rem] font-serif text-xl leading-snug text-cream/85 md:text-2xl">
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
