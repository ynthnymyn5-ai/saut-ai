"use client";
import { ArabicName, MmarLogo } from "../ui/Logo";
import { links } from "@/lib/data";
import { useLang } from "@/lib/i18n";


export function Footer() {
  const { t } = useLang();
  return (
    <footer id="contact" className="relative overflow-hidden bg-void pt-28" style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
      <div className="gutter">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-6">
            <ArabicName className="footer-float shrink-0 text-[72px] text-gold" />
            <p className="font-serif text-3xl italic text-gold-soft md:text-4xl">{t.footer.tagline}</p>
          </div>
          <nav aria-label={t.footer.nav} className="grid grid-cols-2 gap-x-16 gap-y-3 font-mono text-[11px] uppercase tracking-[0.28em]">
            {links.map((l) => (
              <a key={l.label} href={l.href} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="link-sweep text-cream/70 hover:text-cream">
                {t.footer.links[l.label] ?? l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-16 grid gap-6 border-t border-hair pt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-smoke sm:grid-cols-3">
          <span>{t.footer.open}</span>
          <span className="sm:text-center">{t.footer.neighbourhood}</span>
          <span className="sm:text-end">© {new Date().getFullYear()} Mmar · مرمر</span>
        </div>
      </div>
      <div aria-hidden className="gutter mt-16 flex select-none flex-col items-center gap-[2vw] pb-6">
        <MmarLogo className="w-full max-w-[1200px]" fill="url(#footer-gold)">
          <defs>
            <linearGradient id="footer-gold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="102">
              <stop offset="0" stopColor="#e9d2a6" />
              <stop offset="0.45" stopColor="#d6b37a" />
              <stop offset="1" stopColor="#5a3c22" />
            </linearGradient>
          </defs>
        </MmarLogo>
        <ArabicName className="text-[clamp(40px,9vw,140px)] text-gold opacity-80" />
        <p lang="ar" dir="rtl" className="font-arabic text-lg text-smoke md:text-2xl">قهوة حي مختصة…</p>
      </div>
    </footer>
  );
}
