import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Instrument_Serif, JetBrains_Mono, Manrope, Reem_Kufi, Syne } from "next/font/google";
import "./globals.css";

const display = Syne({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-sans", display: "swap" });
const arabic = Reem_Kufi({ subsets: ["arabic"], weight: ["500", "700"], variable: "--font-arabic", display: "swap" });
const arabicBody = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600"], variable: "--font-arabic-body", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Mmar · مرمر — Specialty Coffee",
  description: "Mmar (مرمر) is a neighbourhood specialty coffee house in Kuwait. قهوة حي مختصة.",
  openGraph: { title: "Mmar · مرمر", description: "Neighbourhood specialty coffee · قهوة حي مختصة", type: "website" },
};

export const viewport: Viewport = { themeColor: "#070605", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable} ${arabic.variable} ${arabicBody.variable}`}>
      <body>{children}</body>
    </html>
  );
}
