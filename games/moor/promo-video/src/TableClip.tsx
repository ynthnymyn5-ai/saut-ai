import { Audio, Video } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, BODY, C, clamp } from "./theme";

// Landscape 1280×720 clip: the four characters at the table (slowed, watermark removed),
// Gulf-dialect speech bubbles, Moor logo badge, oud music + card SFX, and an end card.
export const TC_W = 1280;
export const TC_H = 720;
const S = 30; // fps
const VID = 9 * S; // slowed table video length
const HOLD = 40; // zoom on the last frame
const END = 120; // end card
export const TC_FRAMES = VID + HOLD + END;

type BubbleProps = { from: number; to: number; who: string; text: string; style: React.CSSProperties; tail: "down" | "up" | "left" | "right"; big?: boolean };

const Bubble: React.FC<BubbleProps> = ({ from, to, who, text, style, tail, big }) => {
  const f = useCurrentFrame();
  if (f < from - 1 || f > to + 8) return null;
  const pop = interpolate(f, [from, from + 9], [0.4, 1], { ...clamp, easing: Easing.bezier(0.2, 1.6, 0.4, 1) });
  const out = interpolate(f, [to, to + 8], [1, 0], clamp);
  const tailStyle: React.CSSProperties = {
    position: "absolute", width: 0, height: 0, borderStyle: "solid",
    ...(tail === "down" && { bottom: -20, left: "50%", marginLeft: -14, borderWidth: "22px 14px 0 14px", borderColor: "#fff8e8 transparent transparent transparent" }),
    ...(tail === "up" && { top: -20, left: "50%", marginLeft: -14, borderWidth: "0 14px 22px 14px", borderColor: "transparent transparent #fff8e8 transparent" }),
    ...(tail === "left" && { left: -20, top: "50%", marginTop: -12, borderWidth: "12px 22px 12px 0", borderColor: "transparent #fff8e8 transparent transparent" }),
    ...(tail === "right" && { right: -20, top: "50%", marginTop: -12, borderWidth: "12px 0 12px 22px", borderColor: "transparent transparent transparent #fff8e8" }),
  };
  return (
    <div style={{ position: "absolute", direction: "rtl", fontFamily: BODY, opacity: out, scale: pop, transformOrigin: "center", ...style }}>
      <div style={{ position: "relative", background: "#fff8e8", color: "#2a1205", borderRadius: 26, padding: big ? "16px 34px 20px" : "10px 22px 14px", border: `4px solid ${C.gold}`, boxShadow: "0 12px 28px rgba(0,0,0,.45)", whiteSpace: "nowrap" }}>
        <div style={{ fontWeight: 800, fontSize: big ? 22 : 18, color: "#9a6512", lineHeight: 1.2 }}>{who}</div>
        <div style={{ fontWeight: 900, fontSize: big ? 58 : 34, lineHeight: 1.25 }}>{text}</div>
        <div style={tailStyle} />
      </div>
    </div>
  );
};

const LogoBadge: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 930, top: 40, width: 300, height: 100, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, direction: "rtl",
      borderRadius: 22, background: "linear-gradient(180deg, rgba(60,14,26,.92), rgba(30,6,12,.92))", border: `3px solid ${C.gold}`, boxShadow: "0 10px 26px rgba(0,0,0,.5)",
      opacity: interpolate(f, [0, 10], [0, 1], clamp) }}>
      <Img src={staticFile("logo.png")} style={{ width: 84, height: 84 }} />
      <div style={{ fontFamily: BODY, color: C.goldSoft, lineHeight: 1.15 }}>
        <div style={{ fontWeight: 900, fontSize: 36 }}>مور</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>بلوت • تركس • طرنيب</div>
      </div>
    </div>
  );
};

const Hold: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={staticFile("table-last.png")} style={{ width: TC_W, height: TC_H, scale: interpolate(f, [0, HOLD], [1, 1.12], clamp), transformOrigin: "22% 40%" }} />
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: interpolate(f, [0, 10], [0, 1], clamp) }}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <div style={{ width: 1080, height: 1920, scale: 1280 / 1080, transformOrigin: "0 0" }}>
          <Backdrop seed="table" />
        </div>
      </AbsoluteFill>
      <Img src={staticFile("logo.png")} style={{ position: "absolute", left: 90, top: 110, width: 500, height: 500, filter: "drop-shadow(0 26px 50px rgba(0,0,0,.6))",
        scale: interpolate(f, [0, 22], [0.75, 1], { ...clamp, easing: Easing.bezier(0.2, 1.5, 0.4, 1) }) }} />
      <div style={{ position: "absolute", right: 80, top: 180, width: 600, direction: "rtl", textAlign: "center", fontFamily: BODY }}>
        <div style={{ fontWeight: 900, fontSize: 78, color: C.goldSoft, lineHeight: 1.25, opacity: interpolate(f, [10, 22], [0, 1], clamp) }}>جمّع ربعك<br />على الطاولة</div>
        <div style={{ fontWeight: 700, fontSize: 34, color: C.ink, marginTop: 14, opacity: interpolate(f, [18, 30], [0, 1], clamp) }}>مور • بلوت • تركس • طرنيب</div>
        <div style={{ margin: "34px auto 0", width: 420, padding: "18px 0", borderRadius: 999, background: `linear-gradient(180deg, ${C.goldSoft}, ${C.gold})`, color: "#2a1205", fontWeight: 900, fontSize: 44,
          boxShadow: "0 16px 40px rgba(0,0,0,.45)", opacity: interpolate(f, [28, 38], [0, 1], clamp),
          scale: interpolate(f, [28, 42, 62, 78, 96], [0.7, 1, 1.06, 1, 1.06], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) }) }}>قريباً على أندرويد</div>
      </div>
    </AbsoluteFill>
  );
};

export const TableClip: React.FC = () => {
  const t = (s: number) => Math.round(s * S);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={VID}><Video src={staticFile("table-slow.mp4")} muted /></Sequence>
      <Sequence from={VID} durationInFrames={HOLD}><Hold /></Sequence>

      {/* Gulf dialogue */}
      <Bubble from={t(0.3)} to={t(1.9)} who="نواف" text="يلا يا بو شنب… وش عندك؟ 😏" tail="down" style={{ left: 420, top: 20 }} />
      <Bubble from={t(1.9)} to={t(3.2)} who="أبو شنب" text="اصبر… شوف الذوق 😌" tail="down" style={{ left: 40, top: 40 }} />
      <Bubble from={t(4.0)} to={t(6.2)} who="أبو شنب" text="تكوييييش! 👋💥" tail="up" big style={{ left: 380, top: 470 }} />
      <Bubble from={t(6.5)} to={t(7.7)} who="البندق" text="لا لا لا! مو عدل يا جماعة! 😱" tail="right" style={{ left: 330, top: 150 }} />
      <Bubble from={t(7.5)} to={t(9.0)} who="أم صالح" text="ههههه شوفوا وجهه! 😂" tail="up" style={{ left: 760, top: 590 }} />
      <Bubble from={VID + 2} to={VID + HOLD - 4} who="أبو شنب" text="الشنب ما ينكسر يا حبيبي 👑" tail="down" style={{ left: 30, top: 30 }} />

      <Sequence durationInFrames={VID + HOLD}><LogoBadge /></Sequence>
      <Sequence from={VID + HOLD}><EndCard /></Sequence>

      {/* sound */}
      <Audio src={staticFile("moor-oud.mp3")} volume={(f) => interpolate(f, [0, 15, TC_FRAMES - 30, TC_FRAMES], [0, 0.75, 0.75, 0], clamp)} />
      <Sequence from={t(0.6)} durationInFrames={20}><Audio src={staticFile("slap.mp3")} volume={0.45} /></Sequence>
      <Sequence from={t(3.9)} durationInFrames={20}><Audio src={staticFile("slap.mp3")} volume={1} /></Sequence>
      <Sequence from={t(4.15)} durationInFrames={30}><Audio src={staticFile("whoosh.mp3")} volume={0.8} /></Sequence>
      <Sequence from={VID + HOLD + 2} durationInFrames={20}><Audio src={staticFile("slap.mp3")} volume={0.6} /></Sequence>
    </AbsoluteFill>
  );
};
