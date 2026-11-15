"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import { CURRENCY, products } from "@/lib/data";
import { useCapability } from "@/lib/capability";
import { LazyCanvas } from "../ui/LazyCanvas";
import { LuxButton } from "../ui/Magnetic";
import { RevealLines } from "../ui/Reveal";
import { StageFallback } from "../ui/Fallbacks";

const CollectionScene = dynamic(() => import("../three/CollectionScene").then((m) => m.CollectionScene), { ssr: false });
const ease = [0.16, 1, 0.3, 1] as const;

export function Collection({ go }: { go: (id: string) => void }) {
  const cap = useCapability();
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState(false);
  const drag = useRef(0);
  const start = useRef<{ x: number; d: number } | null>(null);
  const p = products[active];

  const step = useCallback((d: number) => setActive((a) => (a + d + products.length) % products.length), []);

  return (
    <section id="collection" className="relative overflow-hidden bg-void py-28 md:py-36" aria-labelledby="collection-title">
      <div className="gutter relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-gold">The Signature Collection</p>
          <RevealLines lines={["Four expressions.", "One obsession."]} className="mt-4 font-display text-[clamp(36px,6vw,84px)] font-bold leading-[0.95] tracking-[-0.02em] text-cream" />
        </div>
        <p className="max-w-xs font-serif text-lg text-cream/60" id="collection-title">
          Presented like the objects they are. Drag the piece to turn it in the light.
        </p>
      </div>

      <div className="relative mt-10 grid min-h-[78svh] grid-cols-1 lg:grid-cols-12">
        {/* giant index numeral, centred behind the product */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 grid h-[56svh] place-items-center overflow-hidden lg:inset-y-0 lg:right-auto lg:h-auto lg:w-7/12">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={p.index}
              className="outline-num col-start-1 row-start-1 select-none font-display text-[56vw] font-extrabold leading-none lg:text-[26vw]"
              initial={{ opacity: 0, scale: 0.9, filter: "blur(12px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 1.08, filter: "blur(12px)" }}
              transition={{ duration: 1, ease }}
            >
              {p.index}
            </motion.span>
          </AnimatePresence>
        </div>

        <div
          className="relative h-[56svh] touch-pan-y lg:col-span-7 lg:h-auto"
          data-cursor="Drag"
          onPointerDown={(e) => (start.current = { x: e.clientX, d: drag.current })}
          onPointerMove={(e) => {
            if (start.current) drag.current = start.current.d + (e.clientX - start.current.x) * 0.01;
          }}
          onPointerUp={() => (start.current = null)}
          onPointerLeave={() => (start.current = null)}
        >
          <LazyCanvas className="absolute inset-0" camera={{ fov: 30, position: [0, 1.55, 7.4], rotation: [-0.19, 0, 0] }} gl={{ alpha: true }} fallback={<StageFallback label={p.name} />}>
            <CollectionScene active={active} drag={drag} lite={cap.tier !== "high"} />
          </LazyCanvas>
        </div>

        <div className="gutter relative z-10 flex flex-col justify-center gap-8 lg:col-span-5 lg:pl-0">
          <AnimatePresence mode="wait">
            <motion.div key={p.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.8, ease }} className="flex flex-col gap-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-smoke">
                {p.index} / 0{products.length} — {p.size}
              </p>
              <h3 className="font-display text-[clamp(34px,3.6vw,60px)] font-extrabold leading-[0.92] tracking-[-0.02em] text-cream">{p.name}</h3>
              <p className="font-serif text-2xl italic text-gold-soft">{p.tagline}</p>
              <p className="max-w-md text-base leading-relaxed text-cream/70">{p.description}</p>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.2em] text-cream/80">
                {p.notes.map((n) => (
                  <li key={n} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-gold" />
                    {n}
                  </li>
                ))}
              </ul>
              <div className="flex items-end gap-6 border-t border-hair pt-6">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">From</p>
                  <p className="font-display text-5xl font-bold tabular-nums text-cream">
                    <span className="mr-1 align-top text-xl text-gold">{CURRENCY}</span>
                    {p.price}
                  </p>
                </div>
                <LuxButton onClick={() => setDetail(true)}>Discover product</LuxButton>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center gap-2" role="tablist" aria-label="Choose a product">
            {products.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
                className={`group flex-1 border-t pt-3 text-left transition-colors duration-500 ${i === active ? "border-gold" : "border-hair hover:border-cream/40"}`}
              >
                <span className={`block font-mono text-[10px] tracking-[0.2em] ${i === active ? "text-gold" : "text-smoke"}`}>{x.index}</span>
                <span className={`hidden font-mono text-[10px] uppercase tracking-[0.2em] sm:block ${i === active ? "text-cream" : "text-smoke group-hover:text-cream/80"}`}>{x.short}</span>
              </button>
            ))}
            <div className="ml-3 flex gap-2">
              <button type="button" aria-label="Previous product" onClick={() => step(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-hair text-cream hover:border-gold">←</button>
              <button type="button" aria-label="Next product" onClick={() => step(1)} className="grid h-10 w-10 place-items-center rounded-full border border-hair text-cream hover:border-gold">→</button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {detail && (
          <motion.div className="fixed inset-0 z-[85] flex justify-end bg-void/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDetail(false)}>
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={p.name}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-lg flex-col gap-8 overflow-y-auto border-l border-hair bg-roast px-8 py-10"
              style={{ paddingBottom: "max(40px, env(safe-area-inset-bottom))" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.8, ease }}
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gold">{p.index} — Product sheet</p>
                <button type="button" onClick={() => setDetail(false)} className="rounded-full border border-hair px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-cream hover:border-gold">
                  Close
                </button>
              </div>
              <h3 className="font-display text-5xl font-extrabold leading-[0.9] text-cream">{p.name}</h3>
              <p className="font-serif text-2xl italic text-gold-soft">{p.tagline}</p>
              <p className="text-cream/70">{p.description}</p>
              <dl className="grid grid-cols-3 gap-4 border-y border-hair py-6">
                {p.spec.map((s) => (
                  <div key={s.label}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">{s.label}</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-cream">{s.value}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">Tasting notes</p>
                <p className="mt-2 font-serif text-2xl text-cream">{p.notes.join(" · ")}</p>
              </div>
              <div className="mt-auto flex items-end justify-between gap-4">
                <p className="font-display text-5xl font-bold tabular-nums text-cream">
                  <span className="mr-1 align-top text-xl text-gold">{CURRENCY}</span>
                  {p.price}
                </p>
                <LuxButton
                  onClick={() => {
                    setDetail(false);
                    go("menu");
                  }}
                >
                  See it on the menu
                </LuxButton>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
