import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#070605",       // matte black
        roast: "#140d09",      // deepest espresso
        espresso: "#2a1a12",   // deep espresso brown
        crema: "#c08a5b",      // caramel
        cream: "#efe6d8",      // warm cream
        gold: { DEFAULT: "#d6b37a", soft: "#e9d2a6", deep: "#9c7b45" }, // champagne gold
        smoke: "#8a7d70",
        hair: "rgba(239,230,216,0.12)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      letterSpacing: { mega: "0.42em" },
      transitionTimingFunction: { lux: "cubic-bezier(.16,1,.3,1)" },
    },
  },
  plugins: [],
} satisfies Config;
