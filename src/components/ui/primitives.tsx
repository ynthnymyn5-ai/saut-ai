"use client";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

type BtnVariant = "primary" | "ghost" | "outline" | "danger";
const btn: Record<BtnVariant, string> = {
  primary: "bg-violet text-white shadow-glow hover:bg-violet-soft hover:shadow-[0_0_0_1px_rgba(167,139,250,.6),0_10px_50px_-6px_rgba(139,92,246,.8)]",
  ghost: "text-white/80 hover:bg-white/5 hover:text-white",
  outline: "border border-line bg-white/[0.03] text-white hover:border-violet/50 hover:bg-white/[0.06]",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
};
const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/60";

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }>(
  ({ variant = "primary", size = "md", className, ...p }, ref) => (
    <button ref={ref} className={cn(base, btn[variant], size === "lg" && "px-6 py-3.5 text-base", size === "sm" && "px-3 py-1.5 text-xs", className)} {...p} />
  ),
);
Button.displayName = "Button";

export function ButtonLink({ href, variant = "primary", size = "md", className, children }: { href: string; variant?: BtnVariant; size?: "sm" | "md" | "lg"; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(base, btn[variant], size === "lg" && "px-6 py-3.5 text-base", size === "sm" && "px-3 py-1.5 text-xs", className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass p-5", className)} {...p}>
      {children}
    </div>
  );
}

const badgeTone = {
  violet: "bg-violet/15 text-violet-soft border-violet/30",
  blue: "bg-electric/10 text-electric border-electric/30",
  green: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  amber: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  red: "bg-rose-400/10 text-rose-300 border-rose-400/30",
  gray: "bg-white/5 text-muted border-line",
};
export function Badge({ tone = "gray", className, children }: { tone?: keyof typeof badgeTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", badgeTone[tone], className)}>{children}</span>;
}

export const statusTone = (s: string): keyof typeof badgeTone =>
  ({ active: "green", completed: "green", succeeded: "green", connected: "green", resolved: "green", trialing: "blue", in_progress: "blue", pending: "amber", paused: "amber", waiting: "amber", past_due: "amber", transferred: "violet", open: "violet", draft: "gray", missed: "red", failed: "red", suspended: "red", canceled: "gray", error: "red", urgent: "red", high: "amber" } as Record<string, keyof typeof badgeTone>)[s] ?? "gray";

export function DemoBadge() {
  const { t } = useI18n();
  return (
    <Badge tone="amber" className="uppercase tracking-wider">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> {t.dash.demoBadge}
    </Badge>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-violet/10 text-violet-soft">{icon}</div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ConfirmDialog({
  open, title, body, confirmLabel, danger, onConfirm, onClose,
}: { open: boolean; title: string; body?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog" aria-modal="true"
            className="glass w-full max-w-md bg-ink-2/95 p-6"
            initial={{ y: 20, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 10, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-semibold">{title}</h3>
            {body && <p className="mt-2 text-sm text-muted">{body}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
              <Button variant={danger ? "danger" : "primary"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel ?? t.common.confirm}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PageHeader({ title, subtitle, actions, demo }: { title: string; subtitle?: string; actions?: React.ReactNode; demo?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {demo && <DemoBadge />}
        </div>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
