import React from "react";
import { Img, staticFile } from "remotion";
import { C } from "../theme";

/** A plain phone frame around a 390×844 game screenshot. */
export const Phone: React.FC<{ src: string; style?: React.CSSProperties; width?: number }> = ({ src, style, width = 640 }) => {
  const h = (width * 844) / 390;
  return (
    <div
      style={{
        position: "absolute",
        width: width + 36,
        height: h + 36,
        padding: 18,
        borderRadius: 86,
        background: "linear-gradient(160deg,#2a2018,#0d0907)",
        border: `4px solid ${C.gold}`,
        boxShadow: "0 50px 100px rgba(0,0,0,.6)",
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ width, height: h, borderRadius: 68, display: "block" }} />
    </div>
  );
};
