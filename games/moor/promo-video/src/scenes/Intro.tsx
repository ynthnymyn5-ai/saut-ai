import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, BODY, C, clamp } from "../theme";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop seed="intro" />
      {/* glow */}
      <div
        style={{
          position: "absolute",
          left: 90,
          top: 420,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(246,220,147,.45), transparent 62%)",
          opacity: interpolate(frame, [8, 40, 110], [0, 1, 0.7], clamp),
        }}
      />
      <Img
        src={staticFile("logo.png")}
        style={{
          position: "absolute",
          left: 150,
          top: 470,
          width: 780,
          height: 780,
          filter: "drop-shadow(0 30px 60px rgba(0,0,0,.6))",
          opacity: interpolate(frame, [0, 14], [0, 1], clamp),
          scale: interpolate(frame, [0, 36, 120], [0.55, 1, 1.05], {
            ...clamp,
            easing: [Easing.bezier(0.16, 1.4, 0.3, 1), Easing.linear],
          }),
          rotate: interpolate(frame, [0, 36], ["-8deg", "0deg"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 1340,
          left: 80,
          right: 80,
          textAlign: "center",
          direction: "rtl",
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 68,
          color: C.ink,
          opacity: interpolate(frame, [34, 50], [0, 1], clamp),
          translate: interpolate(frame, [34, 56], ["0px 40px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
        }}
      >
        لعبة الورق الخليجية
        <div style={{ fontSize: 50, fontWeight: 700, color: C.gold, marginTop: 14 }}>جمعة الربع… في جوالك</div>
      </div>
    </AbsoluteFill>
  );
};
