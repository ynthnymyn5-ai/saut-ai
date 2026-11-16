import { ImageResponse } from "next/og";

export const alt = "SAUT AI — AI employees that answer calls and book appointments 24/7";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Link-preview card for WhatsApp, X, LinkedIn and search results. Latin text only: no font download needed. */
export default function OpengraphImage() {
  const bars = [18, 34, 56, 80, 56, 92, 64, 40, 72, 48, 28, 16];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "radial-gradient(circle at 75% 20%, #3b2470 0%, #080812 55%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
          {bars.map((h, i) => <div key={i} style={{ width: 10, height: h, borderRadius: 5, background: i % 2 ? "#A78BFA" : "#8B5CF6" }} />)}
          <div style={{ marginLeft: 24, fontSize: 40, fontWeight: 700, letterSpacing: 2 }}>SAUT AI</div>
        </div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 950 }}>Meet your new AI employee.</div>
        <div style={{ marginTop: 28, fontSize: 32, color: "#c4c4d4", maxWidth: 950 }}>Answers calls, replies on WhatsApp and books appointments 24/7 — in Gulf Arabic and English.</div>
      </div>
    ),
    size,
  );
}
