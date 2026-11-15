import type { Metadata, Viewport } from "next";
import { Instrument_Serif, JetBrains_Mono, Manrope, Syne } from "next/font/google";
import "./globals.css";

const display = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "MMR — Beyond Coffee",
  description: "MMR is a luxury specialty coffee house. Discover a new dimension of coffee, crafted with passion and designed for perfection.",
  openGraph: { title: "MMR — Beyond Coffee", description: "Discover a new dimension of coffee.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#070605", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
