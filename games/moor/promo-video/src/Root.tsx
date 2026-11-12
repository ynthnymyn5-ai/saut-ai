import React from "react";
import { Composition, Folder } from "remotion";
import { MoorPromo } from "./MoorPromo";
import { Characters } from "./scenes/Characters";
import { Gameplay } from "./scenes/Gameplay";
import { Games } from "./scenes/Games";
import { Intro } from "./scenes/Intro";
import { Online } from "./scenes/Online";
import { Outro } from "./scenes/Outro";
import { FPS, H, W } from "./theme";

const scenes: [string, React.FC, number][] = [
  ["Intro", Intro, 120],
  ["Games", Games, 150],
  ["Characters", Characters, 180],
  ["Gameplay", Gameplay, 150],
  ["Online", Online, 150],
  ["Outro", Outro, 120],
];

export const RemotionRoot: React.FC = () => (
  <>
    <Folder name="MoorPromo-Scenes">
      {scenes.map(([id, comp, d]) => (
        <Composition key={id} id={id} component={comp} width={W} height={H} fps={FPS} durationInFrames={d} />
      ))}
    </Folder>
    {/* 870 frames of scenes minus 5 transitions × 15 frames = 795 frames (26.5 s) */}
    <Composition id="MoorPromo" component={MoorPromo} width={W} height={H} fps={FPS} durationInFrames={795} />
  </>
);
