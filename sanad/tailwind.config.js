/** @type {import('tailwindcss').Config} */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#07040d", 900: "#0d0818", 800: "#150d26", 700: "#1f1436" },
        neon: { purple: "#a855f7", violet: "#7c3aed", orange: "#fb923c", amber: "#f59e0b" },
      },
      fontFamily: {
        sans: ["Inter", "IBM Plex Sans Arabic", "system-ui", "sans-serif"],
        arabic: ["IBM Plex Sans Arabic", "Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(168,85,247,.45)",
        "glow-orange": "0 0 24px rgba(251,146,60,.45)",
      },
    },
  },
  plugins: [],
};
