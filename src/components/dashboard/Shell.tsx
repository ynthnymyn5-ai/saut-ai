"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  type LucideIcon, Activity, MoreHorizontal, CalendarDays, BarChart3, BookOpen, Bot, Brain, Building, CreditCard, Gauge, Kanban, LayoutDashboard, LayoutTemplate, LifeBuoy, LogOut, Menu, MessagesSquare, Phone, Plug, Plus, Settings, Shield, ShoppingBag, Users, Workflow, X, Bike, ArrowLeft, ArrowRight } from "lucide-react";
import { NotificationBell } from "@/components/os/NotificationBell";
import { PwaInstall } from "@/components/pwa/Pwa";
import { AssistantLauncher } from "@/components/assistant/AssistantLauncher";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { backTarget } from "@/lib/back-path";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { ButtonLink, DemoBadge } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function DashboardShell({ children, orgName, userName, isAdmin, demo }: { children: React.ReactNode; orgName: string; userName: string; isAdmin: boolean; demo: boolean }) {
  const { t, locale } = useI18n();
  const off = locale === "ar" ? "100%" : "-100%";
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const back = backTarget(path);
  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;
  // Count in-app screen changes: with a previous screen we go back in history, else one level up.
  const visits = useRef(0);
  useEffect(() => { visits.current += 1; }, [path]);
  const goBack = () => { if (visits.current > 1) router.back(); else if (back) router.push(back); };
  const n = t.dash.nav;
  // Grouped navigation: operate → workforce → customers → insight → account
  const groups: [string | null, [string, string, LucideIcon][]][] = [
    [null, [["/dashboard", n.overview, LayoutDashboard], ["/dashboard/command", n.command, Gauge], ["/dashboard/live", n.live, Activity]]],
    [n.gWorkforce, [["/dashboard/employees", n.employees, Bot], ["/dashboard/templates", n.templates, LayoutTemplate], ["/dashboard/automations", n.automations, Workflow], ["/dashboard/knowledge", n.knowledge, BookOpen]]],
    [n.gCustomers, [["/dashboard/customers", n.customers, Users], ["/dashboard/appointments", n.appointments, CalendarDays], ["/dashboard/orders", n.orders, ShoppingBag], ["/dashboard/driver", locale === "ar" ? "توصيلاتي" : "My deliveries", Bike], ["/dashboard/pipeline", n.pipeline, Kanban], ["/dashboard/calls", n.calls, Phone], ["/dashboard/conversations", n.conversations, MessagesSquare]]],
    [n.gInsight, [["/dashboard/intelligence", n.intelligence, Brain], ["/dashboard/analytics", n.analytics, BarChart3]]],
    [n.gBusiness, [["/dashboard/branches", n.branches, Building], ["/dashboard/integrations", n.integrations, Plug], ["/dashboard/billing", n.billing, CreditCard], ["/dashboard/settings", n.settings, Settings], ["/dashboard/support", n.support, LifeBuoy]]],
  ];

  const tabs: [string, string, LucideIcon][] = [
    ["/dashboard", n.overview, LayoutDashboard],
    ["/dashboard/live", locale === "ar" ? "مباشر" : "Live", Activity],
    ["/dashboard/conversations", n.conversations, MessagesSquare],
    ["/dashboard/appointments", n.appointments, CalendarDays],
  ];

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5"><Link href="/"><Logo size={28} /></Link></div>
      <div className="px-3">
        <ButtonLink href="/dashboard/employees/new" className="w-full"><Plus className="h-4 w-4" />{t.dash.create}</ButtonLink>
      </div>
      <ul className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
        {groups.map(([title, items], gi) => (
          <li key={gi} className={gi ? "pt-3" : ""}>
            {title && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70 rtl:tracking-normal">{title}</p>}
            <ul className="space-y-0.5">
              {items.map(([href, label, I]) => {
                const active = href === "/dashboard" ? path === href : path.startsWith(href);
                return (
                  <li key={href}>
                    <Link href={href} onClick={() => setOpen(false)} className={cn("relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition", active ? "text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white")}>
                      {active && <motion.span layoutId="navActive" className="absolute inset-0 rounded-xl border border-violet/30 bg-violet/15" />}
                      <I className="relative h-[18px] w-[18px]" /><span className="relative">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
        {isAdmin && (
          <li className="mt-3 border-t border-line pt-3">
            <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-electric hover:bg-electric/10"><Shield className="h-[18px] w-[18px]" />{n.admin}</Link>
          </li>
        )}
      </ul>
      <div className="border-t border-line p-4">
        <p className="truncate text-sm font-semibold">{orgName}</p>
        <p className="truncate text-xs text-muted">{userName}</p>
        <form action="/auth/signout" method="post" className="mt-3">
          <button className="flex items-center gap-2 text-xs text-muted hover:text-white"><LogOut className="h-3.5 w-3.5 rtl:-scale-x-100" />{n.signOut}</button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink">
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 border-e border-line bg-ink-2/60 backdrop-blur-xl lg:block">{nav}</aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 start-0 z-50 w-72 border-e border-line bg-ink-2 lg:hidden" initial={{ x: off }} animate={{ x: 0 }} exit={{ x: off }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
              <button className="absolute end-3 top-4 p-2" onClick={() => setOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button>
              {nav}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="lg:ps-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-ink/95 px-4 lg:bg-ink/75 lg:backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            {back && (
              <button type="button" onClick={goBack} className="rounded-lg p-2 hover:bg-white/5" aria-label={locale === "ar" ? "رجوع" : "Back"}>
                <BackIcon className="h-5 w-5" />
              </button>
            )}
            <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
            {demo && <DemoBadge />}
          </div>
          <div className="flex items-center gap-2"><PwaInstall /><NotificationBell demo={demo} /><LanguageSwitcher /></div>
        </header>
        <motion.main key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-8 lg:pb-8">
          {children}
        </motion.main>
      </div>
      <AssistantLauncher />
      {/* Phone tab bar: the screens owners check most, one thumb away. "More" opens the full menu. */}
      <nav aria-label={locale === "ar" ? "التنقل السريع" : "Quick navigation"} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map(([href, label, I]) => {
            const active = href === "/dashboard" ? path === href : path.startsWith(href);
            return (
              <li key={href}>
                <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition", active ? "text-white" : "text-white/55")}>
                  <span className={cn("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-violet/20 text-violet-soft")}><I className="h-[18px] w-[18px]" /></span>
                  <span className="max-w-full truncate px-1">{label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-white/55">
              <span className="grid h-7 w-12 place-items-center rounded-full"><MoreHorizontal className="h-[18px] w-[18px]" /></span>
              {locale === "ar" ? "المزيد" : "More"}
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
