import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, BODY, C, clamp } from "../theme";

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop seed="outro" />
      <Img
        src={staticFile("logo.png")}
        style={{
          position: "absolute",
          left: 240,
          top: 360,
          width: 600,
          height: 600,
          filter: "drop-shadow(0 30px 60px rgba(0,0,0,.6))",
          scale: interpolate(frame, [0, 24], [0.8, 1], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) }),
          opacity: interpolate(frame, [0, 10], [0, 1], clamp),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 1060,
          left: 80,
          right: 80,
          textAlign: "center",
          direction: "rtl",
          fontFamily: BODY,
          fontWeight: 900,
          fontSize: 92,
          lineHeight: 1.3,
          color: C.goldSoft,
          opacity: interpolate(frame, [14, 26], [0, 1], clamp),
        }}
      >
        حمّلها الحين
        <div style={{ fontSize: 54, fontWeight: 700, color: C.ink, marginTop: 10 }}>وجمّع ربعك على الطاولة</div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 1430,
          left: 230,
          right: 230,
          padding: "28px 0",
          borderRadius: 999,
          background: `linear-gradient(180deg, ${C.goldSoft}, ${C.gold})`,
          color: "#2a1205",
          fontFamily: BODY,
          fontWeight: 900,
          fontSize: 58,
          textAlign: "center",
          direction: "rtl",
          boxShadow: "0 20px 50px rgba(0,0,0,.45)",
          opacity: interpolate(frame, [26, 36], [0, 1], clamp),
          scale: interpolate(frame, [26, 40, 60, 75, 90], [0.7, 1, 1.06, 1, 1.06], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) }),
        }}
      >
        قريباً على أندرويد
      </div>
    </AbsoluteFill>
  );
};
