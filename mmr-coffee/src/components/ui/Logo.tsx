/**
 * MMR mark: a coffee bean drawn as a single closed contour whose S-crease
 * doubles as the space between two arches, an abstract "M".
 */
export function Mark({ size = 28, className = "", draw = false }: { size?: number; className?: string; draw?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <ellipse cx="24" cy="24" rx="15" ry="21" stroke="currentColor" strokeWidth="1.6" className={draw ? "draw-path" : ""} pathLength={1} />
      <path d="M24 3.5c-6 8 6 13 0 20.5s6 13 0 20.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={draw ? "draw-path draw-delay" : ""} pathLength={1} />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Mark size={26} className="text-gold" />
      <span className="font-display text-lg font-bold tracking-[0.32em]">MMR</span>
    </span>
  );
}
