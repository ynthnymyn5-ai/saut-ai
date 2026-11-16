/** Static vignette for a photographic finish. No animation and no blend mode, so it costs nothing while scrolling. */
export function Grain() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-[79] bg-[radial-gradient(130%_100%_at_50%_45%,transparent_65%,rgba(0,0,0,.3)_100%)]" />;
}
