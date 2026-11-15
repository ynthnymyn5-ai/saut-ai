"use client";
import dynamic from "next/dynamic";
import { LazyCanvas } from "../ui/LazyCanvas";
import { Mark } from "../ui/Logo";
import { links } from "@/lib/data";

const FooterBean = dynamic(() => import("../three/Sculpture").then((m) => m.FooterBean), { ssr: false });

export function Footer() {
  return (
    <footer id="contact" className="relative overflow-hidden bg-void pt-28" style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
      <div className="gutter">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-6">
            <LazyCanvas className="h-28 w-28 shrink-0" camera={{ position: [0, 0, 3.2], fov: 35 }} gl={{ alpha: true }} fallback={<Mark size={72} className="m-4 text-gold" />}>
              <FooterBean />
            </LazyCanvas>
            <p className="font-serif text-3xl italic text-gold-soft md:text-4xl">Crafted for the moment.</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-16 gap-y-3 font-mono text-[11px] uppercase tracking-[0.28em]">
            {links.map((l) => (
              <a key={l.label} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="link-sweep text-cream/70 hover:text-cream">
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-16 grid gap-6 border-t border-hair pt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-smoke sm:grid-cols-3">
          <span>Open daily · 07:00 — 23:00</span>
          <span className="sm:text-center">Specialty coffee house &amp; roastery</span>
          <span className="sm:text-right">© {new Date().getFullYear()} MMR</span>
        </div>
      </div>
      <p aria-hidden className="footer-word mt-10 select-none text-center font-display font-extrabold leading-[0.78] tracking-[-0.04em]">
        MMR
      </p>
    </footer>
  );
}
