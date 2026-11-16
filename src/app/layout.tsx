import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { getDict } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorReporter } from "@/components/ErrorReporter";
import { SITE_URL } from "@/lib/site";

// Self-hosted from the @fontsource npm packages: no render-blocking request to Google at runtime, and no
// download from Google at build time (next/font/google broke Vercel builds when Google changed its URLs).
const sans = localFont({
  src: [
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/manrope/files/manrope-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-sans", display: "swap", fallback: ["system-ui", "sans-serif"],
});
const display = localFont({
  src: [
    { path: "../../node_modules/@fontsource/sora/files/sora-latin-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/sora/files/sora-latin-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-display", display: "swap", fallback: ["system-ui", "sans-serif"],
});
const arabic = localFont({
  src: [
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2", weight: "400" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2", weight: "500" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2", weight: "600" },
    { path: "../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-arabic", display: "swap", fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "SAUT AI — Your Business. Our Intelligence.", template: "%s · SAUT AI" },
  description: "AI employees that answer calls, book appointments and serve your customers 24/7 — in Kuwaiti, Saudi, Emirati Arabic and English.",
  applicationName: "SAUT AI",
  openGraph: { siteName: "SAUT AI", title: "SAUT AI", description: "Meet your new AI employee.", type: "website" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "SAUT AI", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#080812", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getDict();
  return (
    <html lang={locale} dir={dir} className={`${sans.variable} ${display.variable} ${arabic.variable}`}>
      <body>
        <ErrorReporter />
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
