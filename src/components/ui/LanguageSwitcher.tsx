"use client";
import { Languages } from "lucide-react";
import { useI18n, useSetLocale } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale } = useI18n();
  const { setLocale, pending } = useSetLocale();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button
      onClick={() => setLocale(next)}
      disabled={pending}
      className={cn("inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-violet/50 hover:text-white", className)}
      aria-label={next === "en" ? "Switch to English" : "التبديل إلى العربية"}
    >
      <Languages className="h-4 w-4" />
      {next === "en" ? "English" : "العربية"}
    </button>
  );
}
