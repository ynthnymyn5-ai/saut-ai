/**
 * Browser errors that are not ours: extensions, aborted fetches, ResizeObserver warnings, and the
 * bridge scripts that Instagram / Facebook / TikTok in-app browsers inject (e.g. "Java object is gone"
 * from iabjs://navigation_performance_logger_android). Shared by the browser reporter and the
 * /api/client-error route, so already-loaded pages that still send them are dropped too.
 */
const NOISE = /ResizeObserver loop|AbortError|chrome-extension:|moz-extension:|safari-web-extension:|Load failed|NetworkError|Failed to fetch|Java object is gone|iabjs:\/\/|sendDataToNative|Java bridge method invocation error/i;

export function isClientNoise(name: string | undefined, message: string | undefined, stack?: string): boolean {
  return NOISE.test(`${name ?? ""} ${message ?? ""} ${stack ?? ""}`);
}
