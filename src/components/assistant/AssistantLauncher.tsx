"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { audioContext } from "./voice";

// The panel (face, audio, Simli SDK) is downloaded only when the user opens it.
const AssistantPanel = dynamic(() => import("./AssistantPanel"), { ssr: false });

/** Floating "talk to SO" button. Sits above the phone tab bar; costs ~2 KB until opened. */
export function AssistantLauncher() {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const label = locale === "ar" ? "تحدّث مع SO مساعدك الذكي" : "Talk to SO, your assistant";
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => { audioContext(); setOpen(true); }}
          aria-label={label}
          title={label}
          className="group fixed bottom-[calc(76px+env(safe-area-inset-bottom))] end-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-brand-gradient shadow-glow transition hover:scale-105 active:scale-95 lg:bottom-6 lg:end-6"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-violet/30 [animation-duration:3s]" aria-hidden="true" />
          <svg viewBox="0 0 64 64" className="relative h-9 w-9" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="#0D0B22" fillOpacity=".85" />
            <ellipse cx="24" cy="29" rx="3.2" ry="4.2" fill="#fff" /><ellipse cx="40" cy="29" rx="3.2" ry="4.2" fill="#fff" />
            <path d="M24 40 Q32 46 40 40" stroke="#F0ABFC" strokeWidth="3" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      )}
      {open && <AssistantPanel onClose={() => setOpen(false)} />}
    </>
  );
}
