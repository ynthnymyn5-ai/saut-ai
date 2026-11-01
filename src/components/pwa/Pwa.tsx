"use client";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * Registers the service worker (production only) and shows an "Install app" button when the
 * browser offers installation (Chrome/Edge/Samsung on Android and desktop). On iPhone, Safari
 * installs from Share → Add to Home Screen; the manifest and apple-touch-icon make that work.
 */
export function PwaInstall({ className }: { className?: string }) {
  const { locale } = useI18n();
  const [evt, setEvt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!evt) return null;
  return (
    <button
      type="button"
      className={className ?? "flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-white/80 hover:border-violet/50 hover:text-white"}
      onClick={async () => { await evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); }}
    >
      <Download className="h-3.5 w-3.5" />{locale === "ar" ? "ثبّت التطبيق" : "Install app"}
    </button>
  );
}
