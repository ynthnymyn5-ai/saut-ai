import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Manrope, Sora } from "next/font/google";
import "./globals.css";
import { getDict } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorReporter } from "@/components/ErrorReporter";
import { SITE_URL } from "@/lib/site";

// Self-hosted by Next at build time: no render-blocking request to Google, no layout shift on swap.
const sans = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const display = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });

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
