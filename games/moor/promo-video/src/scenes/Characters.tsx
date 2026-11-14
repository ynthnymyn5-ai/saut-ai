import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, BODY, C, clamp, Headline } from "../theme";

// [file, name, object-position]
const CH: [string, string, string][] = [
  ["hammoud", "حمّود", "50% 22%"],
  ["umsaleh", "أم صالح", "50% 16%"],
  ["saqr", "صقر", "50% 18%"],
  ["noura", "نورة", "50% 16%"],
  ["abushanab", "أبو شنب", "50% 20%"],
  ["moudi", "موضي", "50% 16%"],
  ["mubarak", "مبارك", "50% 30%"],
  ["nawaf", "نواف", "50% 20%"],
  ["saud", "سعود", "50% 22%"],
  ["bunduq", "البندق", "50% 20%"],
  ["lulu", "بو لولو", "50% 22%"],
  ["salem", "سالم", "50% 20%"],
];

export const Characters: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop seed="chars" />
      <Headline>١٣ شخصية<br />كل وحدة لها طبع</Headline>
      <div
        style={{
          position: "absolute",
          top: 500,
          left: 70,
          right: 70,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 22,
          direction: "rtl",
        }}
      >
        {CH.map(([f, n, pos], i) => {
          const d = 10 + i * 4;
          return (
            <div
              key={f}
              style={{
                borderRadius: 30,
                overflow: "hidden",
                border: `3px solid ${C.gold}`,
                background: "#1b140c",
                boxShadow: "0 18px 40px rgba(0,0,0,.45)",
                opacity: interpolate(frame, [d, d + 6], [0, 1], clamp),
                scale: interpolate(frame, [d, d + 16], [0.5, 1], { ...clamp, easing: Easing.bezier(0.2, 1.6, 0.4, 1) }),
              }}
            >
              <Img src={staticFile(`chars/${f}.webp`)} style={{ width: "100%", height: 250, objectFit: "cover", objectPosition: pos, display: "block" }} />
              <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 40, color: C.ink, textAlign: "center", padding: "6px 0 10px" }}>{n}</div>
            </div>
          );
        })}
      </div>
      {/* speech bubble */}
      <div
        style={{
          position: "absolute",
          bottom: 95,
          left: 120,
          right: 120,
          padding: "26px 34px",
          borderRadius: 40,
          background: "#fff7e6",
          color: "#2a0a0a",
          fontFamily: BODY,
          fontWeight: 900,
          fontSize: 56,
          textAlign: "center",
          direction: "rtl",
          boxShadow: "0 20px 50px rgba(0,0,0,.45)",
          opacity: interpolate(frame, [80, 90], [0, 1], clamp),
          scale: interpolate(frame, [80, 96], [0.7, 1], { ...clamp, easing: Easing.bezier(0.2, 1.6, 0.4, 1) }),
        }}
      >
        «ههههه وجهك يضحك 😂»
      </div>
    </AbsoluteFill>
  );
};
