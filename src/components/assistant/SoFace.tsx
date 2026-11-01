"use client";
import { forwardRef, useEffect, useImperativeHandle, useId, useRef } from "react";
import type { Emotion } from "@/lib/assistant/core";

export interface SoFaceHandle { setMouth: (open: number) => void }

/**
 * Built-in assistant face (used until a photoreal face is configured). SO's glass orb with
 * eyes, brows and a mouth that opens with the speech level every animation frame. Mouth
 * updates write SVG attributes directly (no React re-render per frame) to stay smooth on phones.
 * Blinks, eye drift and a gentle head bob run on the GPU-friendly transform only.
 */
export const SoFace = forwardRef<SoFaceHandle, { emotion: Emotion; listening?: boolean; size?: number }>(function SoFace({ emotion, listening, size = 220 }, ref) {
  const id = useId().replace(/:/g, "");
  const mouth = useRef<SVGPathElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const level = useRef(0);

  const shape = (open: number) => {
    const smile = emotion === "concerned" ? -3 : emotion === "thinking" ? 1 : emotion === "celebrating" ? 9 : emotion === "happy" ? 7 : 4;
    const w = 15 - open * 3; // mouth narrows slightly as it opens (more natural vowel shapes)
    const top = 128 + smile * 0.25 - open * 3;
    const bottom = 128 + smile + open * 16;
    return `M ${100 - w} ${128} Q 100 ${top} ${100 + w} ${128} Q 100 ${bottom} ${100 - w} ${128} Z`;
  };
  useImperativeHandle(ref, () => ({
    setMouth: (open: number) => {
      level.current = level.current * 0.45 + Math.max(0, Math.min(1, open)) * 0.55; // smoothing
      mouth.current?.setAttribute("d", shape(level.current));
    },
  }), [emotion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { mouth.current?.setAttribute("d", shape(level.current)); }, [emotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Natural blinking every 2.5–6 s
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const blink = () => {
      eyes.current?.animate([{ transform: "scaleY(1)" }, { transform: "scaleY(.08)" }, { transform: "scaleY(1)" }], { duration: 160, easing: "ease-in-out" });
      t = setTimeout(blink, 2500 + Math.random() * 3500);
    };
    t = setTimeout(blink, 1800);
    return () => clearTimeout(t);
  }, []);

  const brow = emotion === "concerned" ? { l: "M70 82 Q80 76 90 80", r: "M110 80 Q120 76 130 82" }
    : emotion === "thinking" ? { l: "M70 80 Q80 75 90 79", r: "M110 76 Q120 72 130 77" }
    : { l: "M70 80 Q80 74 90 78", r: "M110 78 Q120 74 130 80" };
  const ring = emotion === "concerned" ? "#FCD34D" : emotion === "happy" || emotion === "celebrating" ? "#38BDF8" : "#8B5CF6";

  return (
    <div className="so-face relative mx-auto select-none" style={{ width: size, height: size }} role="img" aria-label={`SO — ${emotion}`}>
      <div className="absolute inset-[-14%] rounded-full opacity-60 blur-3xl transition-colors duration-700" style={{ background: `radial-gradient(circle, ${ring}55 0%, transparent 70%)` }} />
      {listening && <div className="absolute inset-[-6%] animate-ping rounded-full border-2 border-electric/50" />}
      <svg viewBox="0 0 200 200" className="so-bob relative h-full w-full drop-shadow-[0_24px_50px_rgba(139,92,246,.45)]">
        <defs>
          <radialGradient id={`b${id}`} cx="35%" cy="28%" r="78%">
            <stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".2" stopColor="#A78BFA" /><stop offset=".64" stopColor="#6D4BD8" /><stop offset="1" stopColor="#120F2E" />
          </radialGradient>
          <radialGradient id={`v${id}`} cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#0D0B22" stopOpacity=".95" /><stop offset="1" stopColor="#0D0B22" stopOpacity=".7" /></radialGradient>
          <linearGradient id={`e${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8B5CF6" /><stop offset="1" stopColor="#38BDF8" /></linearGradient>
        </defs>
        <circle cx="100" cy="100" r="86" fill={`url(#b${id})`} />
        <circle cx="100" cy="100" r="85" fill="none" stroke={ring} strokeOpacity=".5" strokeWidth="1.5" className="transition-[stroke] duration-700" />
        <ellipse cx="72" cy="54" rx="30" ry="16" fill="#fff" opacity=".25" transform="rotate(-28 72 54)" />
        <rect x="46" y="66" width="108" height="88" rx="44" fill={`url(#v${id})`} />
        <path d={brow.l} stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".85" className="transition-all duration-500" />
        <path d={brow.r} stroke="#C4B5FD" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".85" className="transition-all duration-500" />
        <g ref={eyes} className="so-eyes" style={{ transformOrigin: "100px 100px" }}>
          {emotion === "celebrating" || emotion === "happy"
            ? <><path d="M72 102 Q80 92 88 102" stroke={`url(#e${id})`} strokeWidth="5" strokeLinecap="round" fill="none" /><path d="M112 102 Q120 92 128 102" stroke={`url(#e${id})`} strokeWidth="5" strokeLinecap="round" fill="none" /></>
            : <><ellipse cx="80" cy="100" rx="7.5" ry="10" fill={`url(#e${id})`} /><ellipse cx="120" cy="100" rx="7.5" ry="10" fill={`url(#e${id})`} /><circle cx="82.5" cy="96" r="2.4" fill="#fff" /><circle cx="122.5" cy="96" r="2.4" fill="#fff" /></>}
        </g>
        <path ref={mouth} d={shape(0)} fill="#F0ABFC" fillOpacity=".9" stroke="#F5D0FE" strokeWidth="1" />
      </svg>
      <style>{`
        .so-bob{animation:soBob 5s ease-in-out infinite}
        @keyframes soBob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-4px) rotate(-1deg)}}
        @media (prefers-reduced-motion:reduce){.so-bob{animation:none}}
      `}</style>
    </div>
  );
});
