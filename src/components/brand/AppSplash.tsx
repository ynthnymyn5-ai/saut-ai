"use client";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SoScene } from "@/components/brand/SoScene";
import { useI18n } from "@/lib/i18n/client";

/** App launch: SO greets the user while the dashboard loads (kept short: ~1.2 s, never blocks longer than loading). */
export function AppSplash() {
  const router = useRouter();
  const { locale } = useI18n();
  useEffect(() => {
    router.prefetch("/dashboard");
    const t = setTimeout(() => router.replace("/dashboard"), 1200);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-ink px-4">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-violet/20 blur-[120px]" />
      <SoScene size={220} state="listening" />
      <p className="mt-2 font-display text-2xl font-semibold text-gradient">SAUT AI</p>
      <div className="mt-8 h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-violet to-electric" initial={{ width: "8%" }} animate={{ width: "100%" }} transition={{ duration: 1.2, ease: "easeInOut" }} />
      </div>
      <p className="mt-3 text-xs text-muted">{locale === "ar" ? "سو يجهّز مكتبك…" : "SO is getting your desk ready…"}</p>
    </main>
  );
}
