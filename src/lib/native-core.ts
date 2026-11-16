/**
 * Pure helpers for the Android/iOS app shell (Capacitor). No browser or React imports, so they are unit-tested
 * in scripts/test-native.ts. The browser side lives in src/lib/native.ts and src/components/native/NativeBridge.tsx.
 */

/** Hosts that stay inside the app WebView (keep in sync with mobile/capacitor.config.json → server.allowNavigation). */
export const IN_APP_HOSTS = [
  "www.sautai.company",
  "sautai.company",
  "saut-ai-lons.vercel.app",
  "*.supabase.co",
  "checkout.stripe.com",
  "*.myfatoorah.com",
];

/** Our own hosts: App Links on these open as a page inside the app. */
export const OWN_HOSTS = ["www.sautai.company", "sautai.company", "saut-ai-lons.vercel.app"];

/** Top-level screens: Android back on these leaves the app (to the background) instead of navigating. */
export const ROOT_PATHS = ["/", "/app", "/dashboard", "/login", "/signup", "/onboarding", "/admin"];

export function hostMatches(host: string, patterns: readonly string[]): boolean {
  const h = host.toLowerCase();
  return patterns.some((p) => (p.startsWith("*.") ? h.endsWith(p.slice(1)) && h.length > p.length - 1 : h === p));
}

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export type BackAction = { kind: "history" } | { kind: "navigate"; to: string } | { kind: "minimize" };

/** What the Android back button does on `pathname`; `canGoBack` comes from the WebView history. */
export function backAction(pathname: string, canGoBack: boolean): BackAction {
  const p = trimSlash(pathname || "/");
  if (ROOT_PATHS.includes(p)) return { kind: "minimize" };
  if (canGoBack) return { kind: "history" };
  // opened straight on an inner screen (App Link, notification): go up one level instead of exiting
  if (p.startsWith("/dashboard/")) return { kind: "navigate", to: "/dashboard" };
  if (p.startsWith("/admin/")) return { kind: "navigate", to: "/admin" };
  return { kind: "minimize" };
}

export type LinkKind = "in-app" | "browser" | "system";

/**
 * How the app opens a link: `in-app` (same WebView), `browser` (in-app browser tab, so people don't leave the app),
 * or `system` (mailto:, tel:, WhatsApp and other schemes handed to Android).
 */
export function classifyLink(href: string, currentHost: string): LinkKind {
  let u: URL;
  try { u = new URL(href, `https://${currentHost}/`); } catch { return "in-app"; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return u.protocol === "javascript:" ? "in-app" : "system";
  if (u.host === currentHost || hostMatches(u.hostname, IN_APP_HOSTS)) return "in-app";
  return "browser";
}

/** Path (+ query and hash) to show for an App Link / deep link, or null when the URL isn't ours. */
export function deepLinkPath(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !hostMatches(u.hostname, OWN_HOSTS)) return null;
  const path = `${u.pathname}${u.search}${u.hash}`;
  return path.startsWith("/") && !path.startsWith("//") ? path : null;
}

/** Digital Asset Links statement for /.well-known/assetlinks.json (verifies App Links for the release key). */
export function assetLinks(packageName: string, fingerprints: string): unknown[] {
  const fps = fingerprints
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  if (!fps.length) return [];
  return [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fps },
  }];
}

/** True when the user agent belongs to the SAUT AI app shell. */
export const isAppUserAgent = (ua: string) => /SautAIApp/i.test(ua);
