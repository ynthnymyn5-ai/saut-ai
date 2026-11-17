/** App shell: sidebar on desktop, bottom tab bar on phones, toasts. */
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Home, LayoutGrid, History, Activity, Settings, Languages, WifiOff } from "lucide-react";
import { useI18n } from "../i18n";
import { useMira } from "../lib/store";
import { cx } from "./ui";

export function MiraLogo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cx("relative rounded-full", small ? "h-7 w-7" : "h-9 w-9")} style={{ background: "radial-gradient(circle at 35% 30%, #fff 0%, #e9d5ff 18%, #a855f7 45%, #7c3aed 65%, #fb923c 100%)", boxShadow: "0 0 18px rgba(168,85,247,.7)" }} />
      {!small && <span className="text-lg font-semibold tracking-wide">Mira</span>}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const { status, toasts, pending } = useMira();
  const loc = useLocation();
  const items = [
    { to: "/", icon: Home, label: t.nav.home },
    { to: "/dashboard", icon: LayoutGrid, label: t.nav.dashboard },
    { to: "/history", icon: History, label: t.nav.history },
    { to: "/activity", icon: Activity, label: t.nav.activity },
    { to: "/settings", icon: Settings, label: t.nav.settings },
  ];
  const isActive = (to: string) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to) || (to === "/dashboard" && loc.pathname.startsWith("/agents")));

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-white/5 bg-black/20 p-4 backdrop-blur-xl md:flex">
        <div className="mb-8 px-2 pt-2">
          <MiraLogo />
          <p className="mt-1 text-xs text-zinc-500">{t.tagline}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map(({ to, icon: I, label }) => (
            <NavLink key={to} to={to} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition", isActive(to) ? "bg-gradient-to-r from-neon-violet/30 to-transparent text-white shadow-[inset_2px_0_0_#a855f7]" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")}>
              <I className="h-[18px] w-[18px]" />
              {label}
              {to === "/activity" && pending.length > 0 && <span className="ms-auto rounded-full bg-neon-orange px-1.5 text-[10px] font-bold text-black">{pending.length}</span>}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => setLang(lang === "en" ? "ar" : "en")} className="btn-ghost mt-4 justify-start">
          <Languages className="h-4 w-4" /> {lang === "en" ? "العربية" : "English"}
        </button>
        {status && !status.aiConfigured && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-200">
            <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t.chat.offline}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-ink-950/70 px-4 py-3 backdrop-blur-xl md:hidden" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}>
          <MiraLogo />
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-300" aria-label="Toggle language">
            {lang === "en" ? "ع" : "EN"}
          </button>
        </header>
        {status && !status.aiConfigured && <div className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-1.5 text-center text-[11px] text-amber-200 md:hidden">{t.chat.offline}</div>}

        <main className="flex-1 pb-24 md:pb-8">{children}</main>
      </div>

      {/* Mobile tab bar */}
      <nav className="glass-strong pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 md:hidden">
        {items.map(({ to, icon: I, label }) => (
          <NavLink key={to} to={to} className={cx("relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px]", isActive(to) ? "text-white" : "text-zinc-500")}>
            <I className={cx("h-5 w-5", isActive(to) && "drop-shadow-[0_0_8px_#a855f7]")} />
            {label}
            {to === "/activity" && pending.length > 0 && <span className="absolute end-[28%] top-1.5 h-2 w-2 rounded-full bg-neon-orange" />}
          </NavLink>
        ))}
      </nav>

      {/* Toasts */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((x) => (
            <motion.div key={x.id} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} dir="auto" className={cx("glass-strong pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg", x.tone === "error" ? "border-red-400/40 text-red-100" : x.tone === "success" ? "border-emerald-400/40 text-emerald-100" : "text-zinc-100")}>
              {x.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
