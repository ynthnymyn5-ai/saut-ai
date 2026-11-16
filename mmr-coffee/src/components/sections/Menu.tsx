"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { CURRENCY, formatPrice, menu, type Drink } from "@/lib/data";
import { media } from "@/lib/media";
import { DrinkArt } from "../ui/DrinkArt";
import { RevealLines } from "../ui/Reveal";

const ease = [0.16, 1, 0.3, 1] as const;

export function Menu() {
  const [cat, setCat] = useState(menu[0].id);
  const [hover, setHover] = useState<{ d: Drink; key: string } | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = menu.find((m) => m.id === cat)!;

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !preview.current || !list.current) return;
    const r = list.current.getBoundingClientRect();
    preview.current.style.transform = `translate3d(${e.clientX - r.left}px, ${e.clientY - r.top}px, 0) translate(-50%, -50%)`;
  };

  return (
    <section id="menu" className="relative bg-cream py-28 text-void md:py-36" aria-labelledby="menu-title">
      <div className="gutter">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-baseline gap-4 font-mono text-[11px] uppercase tracking-[0.34em] text-gold-deep">
              The Menu
              <span lang="ar" dir="rtl" className="font-arabic text-base normal-case tracking-normal">قائمة الأسعار</span>
            </p>
            <div id="menu-title">
              <RevealLines lines={["Poured to order."]} className="mt-4 font-display text-[clamp(44px,8vw,128px)] font-extrabold leading-[0.9] tracking-[-0.03em]" />
            </div>
          </div>
          <div className="max-w-xs text-espresso/70">
            <p className="font-serif text-lg">Prices in Kuwaiti dinar (KWD).</p>
            <p lang="ar" dir="rtl" className="mt-1 font-arabic text-base">الأسعار بالدينار الكويتي</p>
          </div>
        </div>

        <div className="mt-14 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]" role="tablist" aria-label="Menu categories">
          {menu.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={cat === m.id}
              aria-controls={`panel-${m.id}`}
              onClick={() => setCat(m.id)}
              className={`relative shrink-0 rounded-full border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.22em] transition-colors duration-500 ${cat === m.id ? "border-void text-cream" : "border-espresso/20 text-espresso hover:border-espresso/60"}`}
            >
              {cat === m.id && <motion.span layoutId="menu-pill" className="absolute inset-0 rounded-full bg-void" transition={{ type: "spring", stiffness: 380, damping: 34 }} />}
              <span className="relative flex items-baseline gap-2">
                {m.label}
                <span lang="ar" dir="rtl" className="font-arabic text-[13px] normal-case tracking-normal">{m.labelAr}</span>
              </span>
            </button>
          ))}
        </div>

        <div ref={list} className="relative mt-10" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <AnimatePresence mode="wait">
            <motion.div key={cat} id={`panel-${cat}`} role="tabpanel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 text-espresso/70">
                <p className="font-serif text-xl italic">{current.intro}</p>
                <p lang="ar" dir="rtl" className="font-arabic text-lg">{current.introAr}</p>
              </div>
              <ul className="border-t border-espresso/15">
                {current.items.map((d, i) => (
                  <motion.li
                    key={d.name}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease, delay: i * 0.07 }}
                    onPointerEnter={() => setHover({ d, key: `${cat}-${i}` })}
                    data-cursor="Taste"
                    className="menu-row group relative grid grid-cols-[64px_1fr_auto] items-center gap-5 border-b border-espresso/15 py-6 md:grid-cols-[88px_1fr_1.2fr_auto] md:gap-8"
                  >
                    <div className="h-16 w-16 transition-transform duration-700 ease-lux group-hover:rotate-[24deg] group-hover:scale-110 md:h-20 md:w-20">
                      <DrinkVisual d={d} id={`${cat}-${i}`} />
                    </div>
                    <div className="min-w-0 transition-transform duration-700 ease-lux group-hover:translate-x-2">
                      <h3 className="font-display text-2xl font-bold uppercase leading-none md:text-4xl">{d.name}</h3>
                      <p lang="ar" dir="rtl" className="mt-2 text-left font-arabic text-xl font-bold leading-none text-gold-deep md:text-2xl">{d.ar}</p>
                      <p className="mt-2 text-sm text-espresso/70 md:hidden">
                        {d.description} <span lang="ar" dir="rtl" className="font-arabic">· {d.descriptionAr}</span>
                      </p>
                    </div>
                    <div className="hidden text-espresso/70 md:block">
                      <p>{d.description}</p>
                      <p lang="ar" dir="rtl" className="mt-1 text-left font-arabic">{d.descriptionAr}</p>
                    </div>
                    <p className="font-display text-2xl font-bold tabular-nums md:text-3xl">
                      {formatPrice(d.price)}
                      <span className="ml-1.5 align-top font-mono text-[10px] tracking-[0.2em] text-gold-deep">{CURRENCY}</span>
                    </p>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          <div ref={preview} aria-hidden className="pointer-events-none absolute left-0 top-0 z-20 hidden h-64 w-64 md:block">
            <AnimatePresence>
              {hover && (
                <motion.div
                  key={hover.key}
                  className={`h-full w-full overflow-hidden rounded-full bg-void shadow-[0_40px_80px_-20px_rgba(42,26,18,.6)] ${media.menu(hover.d.name) ? "" : "p-6"}`}
                  initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
                  transition={{ duration: 0.6, ease }}
                >
                  <DrinkVisual d={hover.d} id={`pv-${hover.key}`} large />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The drink's real photograph when one has been added, otherwise its generated illustration. */
function DrinkVisual({ d, id, large }: { d: Drink; id: string; large?: boolean }) {
  const photo = media.menu(d.name);
  if (!photo) return <DrinkArt look={d.look} id={id} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.src}
      width={photo.width}
      height={photo.height}
      alt={large ? "" : d.name}
      loading="lazy"
      decoding="async"
      sizes={large ? "256px" : "80px"}
      className="h-full w-full rounded-full object-cover"
    />
  );
}
