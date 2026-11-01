import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#080812", 2: "#111121", 3: "#181830" },
        violet: { DEFAULT: "#8B5CF6", soft: "#A78BFA" },
        electric: { DEFAULT: "#38BDF8" },
        muted: "#A1A1B5",
        line: "rgba(255,255,255,0.08)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        arabic: ["var(--font-arabic)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(139,92,246,.45), 0 8px 40px -8px rgba(139,92,246,.6)",
        card: "0 1px 0 0 rgba(255,255,255,.05) inset, 0 20px 50px -20px rgba(0,0,0,.6)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg,#8B5CF6 0%,#38BDF8 100%)",
      },
      keyframes: {
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-12px)" } },
        wave: { "0%,100%": { transform: "scaleY(.35)" }, "50%": { transform: "scaleY(1)" } },
        shimmer: { "0%": { backgroundPosition: "-400px 0" }, "100%": { backgroundPosition: "400px 0" } },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        wave: "wave 1.1s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
