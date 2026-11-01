import { cn } from "@/lib/utils";

/** Lightweight CSS soundwave. `active` animates; otherwise it rests low. */
export function Soundwave({ bars = 24, active = true, className }: { bars?: number; active?: boolean; className?: string }) {
  return (
    <div className={cn("flex h-10 items-center gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const h = 30 + Math.abs(Math.sin(i * 1.7)) * 70;
        return (
          <span
            key={i}
            className={cn("w-[3px] rounded-full bg-brand-gradient origin-center", active && "animate-wave")}
            style={{ height: `${h}%`, animationDelay: `${(i % 8) * 0.09}s`, transform: active ? undefined : "scaleY(.25)", opacity: active ? 1 : 0.45 }}
          />
        );
      })}
    </div>
  );
}
