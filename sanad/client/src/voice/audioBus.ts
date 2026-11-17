/**
 * Shared, mutable audio level (0..1) read by the orb on every animation
 * frame. Kept outside React state so 60fps updates never re-render the app.
 */
export type OrbState = "idle" | "listening" | "thinking" | "speaking";

export const audioBus = {
  /** smoothed loudness of the mic (listening) or Sanad's voice (speaking) */
  level: 0,
  state: "idle" as OrbState,
};

/** Attach an AnalyserNode and pump its RMS level into the bus until stop() is called. */
export function pumpLevel(analyser: AnalyserNode): () => void {
  const buf = new Uint8Array(analyser.fftSize);
  let raf = 0;
  const loop = () => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    const target = Math.min(1, rms * 4.5);
    audioBus.level += (target - audioBus.level) * 0.35;
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => {
    cancelAnimationFrame(raf);
    audioBus.level = 0;
  };
}
