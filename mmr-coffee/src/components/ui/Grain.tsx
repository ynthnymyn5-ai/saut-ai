/** Film grain + vignette that sit over everything for a photographic finish. */
export function Grain() {
  return (
    <>
      <div aria-hidden className="grain pointer-events-none fixed inset-0 z-[80] opacity-[0.07] mix-blend-overlay" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[79] bg-[radial-gradient(130%_100%_at_50%_45%,transparent_65%,rgba(0,0,0,.35)_100%)]" />
    </>
  );
}
