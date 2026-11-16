"use client";
/**
 * Calls into the Android/iOS app shell. The site is loaded remotely by Capacitor (mobile/capacitor.config.json →
 * server.url), which injects `window.Capacitor` with `nativePromise` / `addListener`; we call plugins through
 * those directly, so the web bundle needs no Capacitor packages. Everything is a safe no-op in a normal browser.
 */

type Listener = { remove: () => Promise<void> };
type CapBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
  addListener?: (plugin: string, event: string, cb: (data: unknown) => void) => Listener;
};

const cap = (): CapBridge | null => {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: CapBridge }).Capacitor;
  return c?.isNativePlatform?.() ? c : null;
};

export const isNativeApp = () => cap() !== null;
export const nativePlatform = () => cap()?.getPlatform?.() ?? "web";

/** Calls a native plugin method; resolves to null when not in the app or the plugin is missing (older app build). */
export async function callNative<T = unknown>(plugin: string, method: string, options: Record<string, unknown> = {}): Promise<T | null> {
  const c = cap();
  if (!c?.nativePromise) return null;
  try { return (await c.nativePromise(plugin, method, options)) as T; } catch { return null; }
}

/** Subscribes to a native plugin event; returns an unsubscribe function (no-op outside the app). */
export function onNative<T = unknown>(plugin: string, event: string, cb: (data: T) => void): () => void {
  const c = cap();
  if (!c?.addListener) return () => {};
  try {
    const l = c.addListener(plugin, event, (d) => cb(d as T));
    return () => { l?.remove?.().catch(() => {}); };
  } catch { return () => {}; }
}

/** Opens a URL in the in-app browser tab (Chrome Custom Tab); falls back to a new browser tab. */
export async function openInBrowser(url: string) {
  if ((await callNative("Browser", "open", { url, toolbarColor: "#080812" })) === null && !isNativeApp()) {
    window.open(url, "_blank", "noopener");
  }
}

export type HapticKind = "light" | "medium" | "success" | "warning" | "error";
/** Short vibration on the phone app; nothing on the web. */
export function haptic(kind: HapticKind = "light") {
  if (!isNativeApp()) return;
  if (kind === "light" || kind === "medium") void callNative("Haptics", "impact", { style: kind === "light" ? "LIGHT" : "MEDIUM" });
  else void callNative("Haptics", "notification", { type: kind.toUpperCase() });
}

export type ShareResult = "shared" | "cancelled" | "copied" | "failed";
/** Native share sheet in the app, the Web Share API where the browser has it, otherwise copies the link. */
export async function shareLink(data: { title?: string; text?: string; url: string }): Promise<ShareResult> {
  if (isNativeApp()) {
    // the plugin rejects when the person closes the sheet — that's not an error worth reporting
    const c = cap();
    try { await c!.nativePromise!("Share", "share", { ...data, dialogTitle: data.title }); return "shared"; }
    catch (e) { if (/cancel/i.test(String((e as Error)?.message ?? e))) return "cancelled"; }
  } else if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try { await navigator.share(data); return "shared"; }
    catch (e) { if ((e as Error)?.name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(data.url); return "copied"; } catch { return "failed"; }
}

/** True when a share sheet is available (app or Web Share API); use it to label a button "Share" vs "Copy". */
export const canShare = () => isNativeApp() || (typeof navigator !== "undefined" && typeof navigator.share === "function");
