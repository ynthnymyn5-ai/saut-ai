"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { nav } from "@/lib/data";
import { Wordmark } from "../ui/Logo";

export function Nav({ go, visible }: { go: (id: string) => void; visible: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("home");

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > 200 && y > last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -50% 0px" },
    );
    nav.forEach((n) => {
      const el = document.getElementById(n.id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, []);

  const click = (id: string) => {
    setOpen(false);
    go(id);
  };

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[70] transition-[transform,opacity] duration-700 ease-lux ${hidden && !open ? "-translate-y-full" : ""} ${visible ? "opacity-100" : "opacity-0"}`}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="gutter flex items-center justify-between py-6">
          <button type="button" onClick={() => click("home")} aria-label="MMR, back to top" className="text-cream">
            <Wordmark />
          </button>
          <nav aria-label="Primary" className="hidden items-center gap-1 rounded-full border border-hair bg-void/40 px-2 py-1.5 backdrop-blur-md md:flex">
            {nav.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => click(n.id)}
                className={`relative rounded-full px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.24em] transition-colors duration-300 ${active === n.id ? "text-void" : "text-cream/70 hover:text-cream"}`}
              >
                {active === n.id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-gold" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                <span className="relative">{n.label}</span>
              </button>
            ))}
          </nav>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-smoke md:block">07:00 — 23:00</span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-full border border-hair md:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <span className={`h-px w-5 bg-cream transition-transform duration-500 ${open ? "translate-y-[3.5px] rotate-45" : ""}`} />
            <span className={`h-px w-5 bg-cream transition-transform duration-500 ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`} />
          </button>
        </div>
      </header>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            className="fixed inset-0 z-[65] flex flex-col justify-end bg-roast pb-16 md:hidden"
            initial={{ clipPath: "circle(0% at 92% 4%)" }}
            animate={{ clipPath: "circle(150% at 92% 4%)" }}
            exit={{ clipPath: "circle(0% at 92% 4%)" }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
          >
            <ul className="gutter flex flex-col gap-2">
              {nav.map((n, i) => (
                <motion.li key={n.id} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.06, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
                  <button type="button" onClick={() => click(n.id)} className="flex w-full items-baseline justify-between border-b border-hair py-4 text-left">
                    <span className="font-display text-4xl font-bold uppercase text-cream">{n.label}</span>
                    <span className="font-mono text-[10px] text-gold">0{i + 1}</span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
