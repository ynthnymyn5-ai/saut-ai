"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { timeAgo, useApi, useTr } from "./shared";

type N = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export function NotificationBell({ demo }: { demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const { data, reload } = useApi<{ items: N[]; unread: number }>(demo ? null : "/api/notifications", { pollMs: 20000 });
  const unread = data?.unread ?? 0;
  const markRead = async () => {
    const ids = (data?.items ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length) { await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }); reload(); }
  };
  return (
    <div className="relative">
      <button onClick={() => { setOpen((o) => !o); if (!open) markRead(); }} aria-label={tr("Notifications", "التنبيهات")} className="relative rounded-xl border border-line p-2 text-white/80 hover:border-violet/50 hover:text-white">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums">{unread > 9 ? "9+" : unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="glass absolute end-0 top-12 z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden bg-ink-2/95 p-0">
            <p className="border-b border-line px-4 py-3 text-sm font-semibold">{tr("Notifications", "التنبيهات")}</p>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {demo ? <li className="p-4 text-sm text-muted">{tr("Notifications appear here once your business is live.", "تظهر التنبيهات هنا عند تشغيل نشاطك فعلياً.")}</li>
                : !data?.items.length ? <li className="p-4 text-sm text-muted">{tr("You're all caught up.", "لا توجد تنبيهات جديدة.")}</li>
                : data.items.map((n) => (
                  <li key={n.id}>
                    <Link href={n.link ?? "/dashboard/command"} onClick={() => setOpen(false)} className={cn("block px-4 py-3 hover:bg-white/[0.03]", !n.read_at && "bg-violet/[0.06]")}>
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="line-clamp-2 text-xs text-muted">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted">{timeAgo(n.created_at, locale)}</p>
                    </Link>
                  </li>
                ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
