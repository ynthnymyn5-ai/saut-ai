import type { MetadataRoute } from "next";

/** Web app manifest: lets owners install SAUT AI on their phone home screen like a native app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "SAUT AI — صوت",
    short_name: "SAUT AI",
    description: "AI employees that answer calls and WhatsApp 24/7 — موظفون أذكياء يردّون على المكالمات وواتساب على مدار الساعة",
    start_url: "/dashboard?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#080812",
    theme_color: "#080812",
    lang: "ar",
    dir: "auto",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "العمليات المباشرة · Live", url: "/dashboard/live", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "المحادثات · Conversations", url: "/dashboard/conversations", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "المواعيد · Appointments", url: "/dashboard/appointments", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
