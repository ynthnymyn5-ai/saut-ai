import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, BODY, C, clamp, DISPLAY, Headline } from "../theme";

const GAMES = [
  { n: "مور", d: "نزول وتكويش", c: ["#a3123f", "#4a0a1c"], s: "♥" },
  { n: "بلوت", d: "صن وحكم", c: ["#1f8f5c", "#0b3d27"], s: "♠" },
  { n: "تركس", d: "ممالك وعقود", c: ["#6b3fc9", "#2a1360"], s: "♦" },
  { n: "طرنيب", d: "مزايدة وطرنيب", c: ["#2b5fb8", "#0d2754"], s: "♣" },
];

export const Games: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop seed="games" />
      <Headline>٤ ألعاب<br />في تطبيق واحد</Headline>
      <div
        style={{
          position: "absolute",
          top: 560,
          left: 90,
          right: 90,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 40,
          direction: "rtl",
        }}
      >
        {GAMES.map((g, i) => {
          const d = 14 + i * 9;
          return (
            <div
              key={g.n}
              style={{
                height: 520,
                borderRadius: 40,
                border: `4px solid ${C.gold}`,
                background: `linear-gradient(160deg, ${g.c[0]}, ${g.c[1]})`,
                boxShadow: "0 30px 60px rgba(0,0,0,.5), inset 0 0 60px rgba(0,0,0,.35)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: interpolate(frame, [d, d + 8], [0, 1], clamp),
                scale: interpolate(frame, [d, d + 20], [0.6, 1], { ...clamp, easing: Easing.bezier(0.2, 1.5, 0.4, 1) }),
                rotate: interpolate(frame, [d, d + 20], [i % 2 ? "10deg" : "-10deg", "0deg"], {
                  ...clamp,
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            >
              <div style={{ fontSize: 150, color: "rgba(246,220,147,.9)", lineHeight: 1 }}>{g.s}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 130, color: C.goldSoft, lineHeight: 1.2, textShadow: "0 4px 0 #3a1a05" }}>
                {g.n}
              </div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 44, color: C.ink }}>{g.d}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
