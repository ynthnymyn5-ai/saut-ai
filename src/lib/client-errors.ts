"use client";
/** Sends a browser error to /api/client-error. At most 5 reports per page load, duplicates skipped. */
import { isClientNoise } from "@/lib/client-noise";

const seen = new Set<string>();
let count = 0;

export function sendClientError(err: unknown, kind: "error" | "unhandledrejection" | "boundary" = "error", digest?: string) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : "Unknown error");
    const key = `${e.name}:${e.message}`;
    if (count >= 5 || seen.has(key) || !e.message) return;
    if (isClientNoise(e.name, e.message, e.stack)) return;
    seen.add(key); count++;
    const payload = JSON.stringify({ name: e.name, message: e.message.slice(0, 1000), stack: e.stack?.slice(0, 8000), path: location.pathname, digest, kind });
    fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
  } catch { /* never let reporting break the page */ }
}
