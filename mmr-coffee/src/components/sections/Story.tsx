"use client";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { LazyCanvas } from "../ui/LazyCanvas";
import { FadeUp, RevealLines } from "../ui/Reveal";
import { StageFallback } from "../ui/Fallbacks";
import { media } from "@/lib/media";

const Sculpture = dynamic(() => import("../three/Sculpture").then((m) => m.Sculpture), { ssr: false });

const recipe = [
  { k: "Dose", v: "18 g" },
  { k: "Yield", v: "36 g" },
  { k: "Time", v: "28 s" },
  { k: "Water", v: "93 °C" },
];

export function Story() {
  const drag = useRef(0);
  const start = useRef<{ x: number; d: number } | null>(null);
  const photo = media.story();
  return (
    <section id="story" className="relative bg-void" aria-labelledby="story-title">
      <div className="grid min-h-[100svh] grid-cols-1 lg:grid-cols-2">
        <div className="gutter flex flex-col justify-center gap-10 py-28 lg:pr-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.34em] text-gold">Our Story</p>
          <div id="story-title">
            <RevealLines lines={["IT STARTS", "WITH A PASSION."]} className="font-display text-[clamp(40px,5vw,84px)] font-extrabold leading-[0.9] tracking-[-0.03em] text-cream" />
          </div>
          <FadeUp>
            <p className="max-w-lg font-serif text-2xl leading-snug text-cream/80 md:text-[28px]">
              At MMR, coffee is more than a daily ritual. It&apos;s an art of craftsmanship, a journey of flavor, and a moment worth remembering.
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <p className="max-w-md text-cream/60">
              We buy in small lots, roast in small batches and taste every one before it reaches a cup. The house espresso is dialled in each morning to the same four numbers.
            </p>
          </FadeUp>
          <FadeUp delay={0.2}>
            <dl className="grid max-w-md grid-cols-4 border-t border-hair pt-6">
              {recipe.map((r) => (
                <div key={r.k}>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">{r.k}</dt>
                  <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-cream md:text-3xl">{r.v}</dd>
                </div>
              ))}
            </dl>
          </FadeUp>
        </div>
        <div
          className="relative h-[70svh] touch-pan-y lg:h-auto"
          data-cursor={photo ? undefined : "Drag"}
          onPointerDown={(e) => (start.current = { x: e.clientX, d: drag.current })}
          onPointerMove={(e) => {
            if (start.current) drag.current = start.current.d + (e.clientX - start.current.x) * 0.012;
          }}
          onPointerUp={() => (start.current = null)}
          onPointerLeave={() => (start.current = null)}
        >
          {photo ? (
            <div className="absolute inset-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} width={photo.width} height={photo.height} alt="An Mmar paper cup on the counter" loading="lazy" decoding="async" className="story-kenburns h-full w-full object-cover" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-void via-transparent to-transparent" />
            </div>
          ) : (
            <LazyCanvas className="absolute inset-0" camera={{ position: [0, 0, 9.5], fov: 35 }} fallback={<StageFallback />}>
              <Sculpture drag={drag} />
            </LazyCanvas>
          )}
          <div className="pointer-events-none absolute bottom-8 left-8 right-8 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">
            <span>{photo ? "Fig. 01 — Mmar, to go" : "Fig. 01 — Arabica, roasted & raw gold"}</span>
            {!photo && <span>Drag to turn</span>}
          </div>
        </div>
      </div>
    </section>
  );
}
