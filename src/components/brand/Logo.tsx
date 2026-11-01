import { useId } from "react";
import { cn } from "@/lib/utils";

/** The S-mark: an S whose spine becomes a soundwave. */
export const S_PATH =
  "M44 19 C41 14 23 13 20 21 C18 27 23 29.5 27 30.5 L29 27 L32 36.5 L35 27.5 L37.5 33.5 C41 34.5 46 37 44 43 C41 51 23 50 20 45";

export function LogoMark({ size = 36, variant = "dark", className }: { size?: number; variant?: "dark" | "light"; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="SAUT AI">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={variant === "dark" ? "#1A1834" : "#FFFFFF"} />
          <stop offset="1" stopColor={variant === "dark" ? "#0B0B18" : "#F1EEFF"} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="17" fill={`url(#bg${id})`} stroke={`url(#g${id})`} strokeOpacity=".55" strokeWidth="1.5" />
      <path d={S_PATH} fill="none" stroke={`url(#g${id})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ variant = "dark", className, size = 34 }: { variant?: "dark" | "light"; className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} dir="ltr">
      <LogoMark size={size} variant={variant} />
      <span className={cn("font-display text-[1.15rem] font-semibold tracking-[0.18em]", variant === "dark" ? "text-white" : "text-ink")}>
        SAUT<span className="ms-1.5 bg-brand-gradient bg-clip-text text-transparent">AI</span>
      </span>
    </span>
  );
}
