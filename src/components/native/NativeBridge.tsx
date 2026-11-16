"use client";
import { WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { callNative, isNativeApp, onNative, openInBrowser } from "@/lib/native";
import { backAction, classifyLink, deepLinkPath } from "@/lib/native-core";

/** After this long in the background, data on screen is refreshed when the app comes back. */
const REFRESH_AFTER_MS = 5 * 60_000;

/**
 * Glue between the web app and the Android/iOS shell: status bar, splash, Android back button, App Links,
 * external links in an in-app browser tab, refresh on resume. Also shows an offline banner (web and app).
 */
export function NativeBridge() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.classList.add("native-app");
    void callNative("StatusBar", "setBackgroundColor", { color: "#080812" });
    void callNative("StatusBar", "setStyle", { style: "DARK" });
    void callNative("SplashScreen", "hide", { fadeOutDuration: 200 });

    // full page load for route handlers (/auth/callback) and anything outside the client router
    const open = (path: string) => {
      if (path.startsWith("/auth/") || path.startsWith("/api/")) window.location.assign(path);
      else routerRef.current.push(path);
    };

    const offBack = onNative<{ canGoBack: boolean }>("App", "backButton", ({ canGoBack }) => {
      const a = backAction(window.location.pathname, canGoBack);
      if (a.kind === "history") window.history.back();
      else if (a.kind === "navigate") routerRef.current.replace(a.to);
      else void callNative("App", "minimizeApp");
    });

    const offUrl = onNative<{ url: string }>("App", "appUrlOpen", ({ url }) => {
      const p = deepLinkPath(url);
      if (p) open(p);
    });
    // cold start from a link: the shell loaded /app first, so move to the linked page once
    void callNative<{ url?: string }>("App", "getLaunchUrl").then((r) => {
      const p = r?.url ? deepLinkPath(r.url) : null;
      if (!p) return;
      // only once per app session: later full page loads must not jump back to the launch link
      let seen = false;
      try { const key = `saut_launch_${r!.url}`; seen = sessionStorage.getItem(key) !== null; sessionStorage.setItem(key, "1"); } catch { /* storage blocked */ }
      if (!seen && p !==window.location.pathname + window.location.search + window.location.hash) open(p);
    });

    let hiddenAt = 0;
    const offState = onNative<{ isActive: boolean }>("App", "appStateChange", ({ isActive }) => {
      if (!isActive) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt >= REFRESH_AFTER_MS) { hiddenAt = 0; routerRef.current.refresh(); }
    });

    // links to other sites open in an in-app browser tab instead of replacing the app
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download")) return;
      if (classifyLink(a.href, window.location.host) === "browser") { e.preventDefault(); void openInBrowser(a.href); }
    };
    document.addEventListener("click", onClick, true);
    const nativeOpen = window.open;
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const href = url ? String(url) : "";
      if (href && classifyLink(href, window.location.host) === "browser") { void openInBrowser(new URL(href, window.location.href).href); return null; }
      return nativeOpen.call(window, url, target, features);
    }) as typeof window.open;

    return () => {
      offBack(); offUrl(); offState();
      document.removeEventListener("click", onClick, true);
      window.open = nativeOpen;
      root.classList.remove("native-app");
    };
  }, []);

  return <OfflineBanner />;
}

function OfflineBanner() {
  const { locale } = useI18n();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    // the app's Network plugin also reports Wi-Fi that is connected but has no internet
    const off = onNative<{ connected: boolean }>("Network", "networkStatusChange", (s) => setOffline(!s.connected));
    void callNative<{ connected: boolean }>("Network", "getStatus").then((s) => { if (s) setOffline(!s.connected); });
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); off(); };
  }, []);
  if (!offline) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[110] flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-2 text-center text-xs font-semibold text-black" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{locale === "ar" ? "لا يوجد اتصال بالإنترنت — لن تُحفظ التغييرات حتى يعود" : "You're offline — changes won't save until you reconnect"}</span>
    </div>
  );
}
