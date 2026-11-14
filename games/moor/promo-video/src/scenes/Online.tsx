import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, BODY, C, clamp, Headline } from "../theme";

const ITEMS = [
  ["🎙️", "دردشة صوتية", "سوالف وضحك وأنتم تلعبون"],
  ["🏛️", "الديوانية", "أندية وترتيب أسبوعي"],
  ["🏆", "كأس المجلس", "بطولة كل أسبوع"],
  ["👑", "رُتب ومواسم", "من المبتدئ إلى ملك المجلس"],
  ["🎁", "مكافآت يومية", "ومهام وإنجازات"],
];

export const Online: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop seed="online" />
      <Headline>المجلس ما يخلص</Headline>
      <div style={{ position: "absolute", top: 440, left: 90, right: 90, display: "flex", flexDirection: "column", gap: 34, direction: "rtl" }}>
        {ITEMS.map(([ic, t, d], i) => {
          const s = 12 + i * 10;
          return (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 36,
                padding: "30px 40px",
                borderRadius: 36,
                background: "rgba(20,8,10,.55)",
                border: `3px solid rgba(227,183,91,.55)`,
                opacity: interpolate(frame, [s, s + 8], [0, 1], clamp),
                translate: interpolate(frame, [s, s + 20], ["-160px 0px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
              }}
            >
              <div style={{ fontSize: 110, width: 140, textAlign: "center" }}>{ic}</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontFamily: BODY, fontWeight: 900, fontSize: 72, color: C.goldSoft, lineHeight: 1.3 }}>{t}</div>
                <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 46, color: C.ink }}>{d}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
