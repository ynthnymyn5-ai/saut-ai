import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio, Video } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Characters } from "./scenes/Characters";
import { Gameplay } from "./scenes/Gameplay";
import { Games } from "./scenes/Games";
import { Online } from "./scenes/Online";
import { Outro } from "./scenes/Outro";
import { TableClip, TC_CLIP } from "./TableClip";
import { Backdrop, BODY, C, clamp, W } from "./theme";

// Vertical 1080×1920 ad: the table scene with Gulf dialogue, then the app tour, then the logo ending.

const TableVertical: React.FC = () => {
  const f = useCurrentFrame();
  const k = W / 1280; // 0.84375
  return (
    <AbsoluteFill style={{ background: "#120406" }}>
      <AbsoluteFill style={{ overflow: "hidden", filter: "blur(28px) brightness(.45)", scale: 1.15 }}>
        <Video src={staticFile("table-slow.mp4")} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {/* header */}
      <div style={{ position: "absolute", top: 210, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, direction: "rtl", fontFamily: BODY,
        opacity: interpolate(f, [0, 12], [0, 1], clamp), translate: `0 ${interpolate(f, [0, 16], [-40, 0], { ...clamp, easing: Easing.out(Easing.cubic) })}px` }}>
        <Img src={staticFile("logo.png")} style={{ width: 210, height: 210, filter: "drop-shadow(0 18px 36px rgba(0,0,0,.6))" }} />
        <div style={{ fontWeight: 900, fontSize: 64, color: C.goldSoft, lineHeight: 1.2, textAlign: "center" }}>سهرة الربع ما تكمل<br />بدون ورق 🎴</div>
      </div>
      {/* the landscape clip */}
      <div style={{ position: "absolute", left: 0, top: 760, width: 1280, height: 720, scale: k, transformOrigin: "0 0", borderRadius: 24, overflow: "hidden",
        boxShadow: "0 30px 70px rgba(0,0,0,.6)", outline: `6px solid ${C.gold}` }}>
        <TableClip clipOnly />
      </div>
      {/* footer */}
      <div style={{ position: "absolute", top: 1420, left: 60, right: 60, textAlign: "center", direction: "rtl", fontFamily: BODY, opacity: interpolate(f, [20, 34], [0, 1], clamp) }}>
        <div style={{ fontWeight: 800, fontSize: 46, color: C.ink, lineHeight: 1.35 }}>مور • بلوت • تركس • طرنيب</div>
        <div style={{ fontWeight: 700, fontSize: 36, color: C.muted, marginTop: 8 }}>كلها في تطبيق واحد… وباللهجة الخليجية</div>
      </div>
    </AbsoluteFill>
  );
};

const FEATS: [string, string, string][] = [
  ["🎯", "تحدي اليوم", "نفس التوزيعة لكل اللاعبين… مين يسويها أحسن؟"],
  ["🗺️", "رحلة الخليج", "من الكويت إلى دبي… واغلب زعيم كل مدينة"],
  ["🍅", "ارمِ عليه", "طماطة، نعال، وردة… على اللي يستاهل 😂"],
  ["🎓", "أبو شنب يعلّمك", "نصايح وقت اللعب لين تصير محترف"],
];

const Features: React.FC = () => {
  const f = useCurrentFrame();
  const pop = (d: number) => interpolate(f, [d, d + 14], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.4, 0.4, 1) });
  return (
    <AbsoluteFill>
      <Backdrop seed="feats" />
      <div style={{ position: "absolute", top: 190, left: 0, right: 0, textAlign: "center", direction: "rtl", fontFamily: BODY, fontWeight: 900, fontSize: 84, color: C.goldSoft, opacity: pop(0) }}>جديد في مور ✨</div>
      {/* featured: animated sticker */}
      <div style={{ position: "absolute", top: 340, left: 90, right: 90, height: 470, borderRadius: 40, background: "linear-gradient(160deg, rgba(227,183,91,.25), rgba(227,183,91,.06))", border: `4px solid ${C.gold}`,
        display: "flex", alignItems: "center", gap: 34, padding: "0 40px", direction: "rtl", scale: pop(6), boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}>
        <div style={{ width: 360, height: 360, borderRadius: 32, overflow: "hidden", flex: "none", border: `4px solid ${C.goldSoft}` }}>
          <Video src={staticFile("stick-angry.mp4")} muted loop style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ fontFamily: BODY, color: C.ink }}>
          <div style={{ fontWeight: 900, fontSize: 58, color: C.goldSoft, lineHeight: 1.2 }}>تعبيرات متحركة 🎭</div>
          <div style={{ fontWeight: 700, fontSize: 36, lineHeight: 1.45, marginTop: 10 }}>عصّب، اضحك، اشمت…<br />وارسلها وقت اللعب!</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 860, left: 90, right: 90, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, direction: "rtl" }}>
        {FEATS.map(([e, t, d], i) => (
          <div key={t} style={{ height: 380, borderRadius: 34, background: "rgba(255,255,255,.07)", border: "2px solid rgba(227,183,91,.55)", padding: "34px 28px", fontFamily: BODY,
            display: "flex", flexDirection: "column", gap: 12, scale: pop(16 + i * 8), boxShadow: "0 18px 40px rgba(0,0,0,.35)" }}>
            <div style={{ fontSize: 90, lineHeight: 1 }}>{e}</div>
            <div style={{ fontWeight: 900, fontSize: 50, color: C.goldSoft, lineHeight: 1.2 }}>{t}</div>
            <div style={{ fontWeight: 700, fontSize: 32, color: C.ink, lineHeight: 1.45 }}>{d}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Music: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio src={staticFile("moor-oud.mp3")} loop
      volume={(f) => interpolate(f, [0, 12, durationInFrames - 45, durationInFrames - 1], [0, 0.8, 0.8, 0], clamp)} />
  );
};

const T = 15;
export const AD_FRAMES = TC_CLIP + 150 + 180 + 180 + 150 + 150 + 150 - 6 * T;

export const MoorAd: React.FC<{ music?: boolean }> = ({ music = true }) => (
  <>
    {music && <Music />}
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={TC_CLIP}><TableVertical /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence durationInFrames={150}><Games /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence durationInFrames={180}><Characters /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence durationInFrames={180}><Features /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence durationInFrames={150}><Gameplay /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence durationInFrames={150}><Online /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />
      <TransitionSeries.Sequence durationInFrames={150}><Outro /></TransitionSeries.Sequence>
    </TransitionSeries>
  </>
);
