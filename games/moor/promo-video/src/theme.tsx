import { loadFont } from "@remotion/fonts";
import React from "react";
import { AbsoluteFill, interpolate, random, staticFile, useCurrentFrame } from "remotion";

export const FPS = 30;
export const W = 1080;
export const H = 1920;

export const C = {
  bg: "#160a0c",
  maroonA: "#5c1428",
  maroonB: "#2e0814",
  gold: "#e3b75b",
  goldSoft: "#f6dc93",
  ink: "#f3e7cc",
  muted: "#cdb98f",
};
export const DISPLAY = "ArefRuqaa";
export const BODY = "Cairo";

const fonts = [
  loadFont({ family: DISPLAY, url: staticFile("fonts/aref-ruqaa-arabic-700-normal.woff2"), weight: "700" }),
  ...["700", "800", "900"].map((w) =>
    loadFont({ family: BODY, url: staticFile(`fonts/cairo-arabic-${w}-normal.woff2`), weight: w }),
  ),
  ...["700", "800"].map((w) =>
    loadFont({ family: BODY, url: staticFile(`fonts/cairo-latin-${w}-normal.woff2`), weight: w }),
  ),
];
export const fontsReady = Promise.all(fonts);

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Velvet majlis background with slowly drifting gold dust. */
export const Backdrop: React.FC<{ seed: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const dots = new Array(46).fill(0).map((_, i) => {
    const x = random(`${seed}x${i}`) * W;
    const y0 = random(`${seed}y${i}`) * H;
    const s = 3 + random(`${seed}s${i}`) * 7;
    const speed = 0.6 + random(`${seed}v${i}`) * 1.6;
    const y = (((y0 - frame * speed) % H) + H) % H;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame / 18 + i));
    return { x, y, s, tw };
  });
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 38%, ${C.maroonA} 0%, ${C.maroonB} 58%, ${C.bg} 100%)`,
      }}
    >
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: d.s,
            height: d.s,
            borderRadius: "50%",
            background: C.goldSoft,
            opacity: d.tw * 0.55,
            boxShadow: `0 0 ${d.s * 3}px ${C.gold}`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Big gold headline that rises in. */
export const Headline: React.FC<{ children: React.ReactNode; delay?: number; size?: number; top?: number }> = ({
  children,
  delay = 0,
  size = 96,
  top = 170,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 80,
        right: 80,
        textAlign: "center",
        direction: "rtl",
        fontFamily: BODY,
        fontWeight: 900,
        fontSize: size,
        lineHeight: 1.25,
        color: C.goldSoft,
        textShadow: "0 4px 0 #6b3d10, 0 0 40px rgba(227,183,91,.35)",
        opacity: interpolate(frame, [delay, delay + 12], [0, 1], clamp),
        translate: interpolate(frame, [delay, delay + 18], ["0px 60px", "0px 0px"], {
          ...clamp,
          easing: (t) => 1 - Math.pow(1 - t, 3),
        }),
      }}
    >
      {children}
    </div>
  );
};
