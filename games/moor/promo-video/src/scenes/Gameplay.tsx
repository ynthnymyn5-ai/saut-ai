import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, clamp, Headline } from "../theme";
import { Phone } from "./Phone";

export const Gameplay: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Backdrop seed="play" />
      <Headline size={88}>العب ضد الكمبيوتر<br />أو مع ربعك أونلاين</Headline>
      <Phone
        src="game.png"
        width={590}
        style={{
          left: (1080 - 626) / 2,
          top: 500,
          translate: interpolate(frame, [6, 34], ["0px 900px", "0px 0px"], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
          rotate: interpolate(frame, [6, 34, 150], ["6deg", "0deg", "-1.5deg"], { ...clamp, easing: [Easing.bezier(0.16, 1, 0.3, 1), Easing.linear] }),
        }}
      />
    </AbsoluteFill>
  );
};
