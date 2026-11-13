import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Audio } from "@remotion/media";
import React from "react";
import { interpolate, staticFile, useVideoConfig } from "remotion";
import { Characters } from "./scenes/Characters";
import { Gameplay } from "./scenes/Gameplay";
import { Games } from "./scenes/Games";
import { Intro } from "./scenes/Intro";
import { Online } from "./scenes/Online";
import { Outro } from "./scenes/Outro";

const Music: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile("moor-oud.mp3")}
      volume={(f) =>
        interpolate(f, [0, 12, durationInFrames - 45, durationInFrames - 1], [0, 0.9, 0.9, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />
  );
};

export const MoorPromo: React.FC = () => (
  <>
  <Music />
  <TransitionSeries>
    <TransitionSeries.Sequence name="Intro" durationInFrames={120}>
      <Intro />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="Games" durationInFrames={150}>
      <Games />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="Characters" durationInFrames={180}>
      <Characters />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="Gameplay" durationInFrames={150}>
      <Gameplay />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({ direction: "from-left" })} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="Online" durationInFrames={150}>
      <Online />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />
    <TransitionSeries.Sequence name="Outro" durationInFrames={120}>
      <Outro />
    </TransitionSeries.Sequence>
  </TransitionSeries>
  </>
);
