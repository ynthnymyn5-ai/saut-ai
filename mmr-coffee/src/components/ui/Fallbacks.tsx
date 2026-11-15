import { Mark } from "./Logo";

/** Static art shown where WebGL is unavailable or while a scene is still loading. */
export function StageFallback({ label = "" }: { label?: string }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <div className="absolute inset-0 bg-[radial-gradient(50%_45%_at_50%_55%,rgba(192,138,91,.28),transparent_70%)]" />
      <div className="absolute left-1/2 top-1/2 h-[46vmin] w-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/20" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-gold/50">
        <Mark size={120} />
      </div>
      {label && <p className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">{label}</p>}
    </div>
  );
}
