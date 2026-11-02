/**
 * Only same-site paths are allowed after sign-in. Browsers treat "\" and tabs/newlines like "/",
 * so "/\evil.com" would leave the site — resolve the URL and require the same origin.
 */
export function safeNext(next: string | null | undefined, origin: string, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || /[\\\t\r\n]/.test(next) || next.startsWith("//")) return fallback;
  try {
    const u = new URL(next, origin);
    return u.origin === origin ? u.pathname + u.search + u.hash : fallback;
  } catch {
    return fallback;
  }
}

/** Rejects URLs aimed at this server's own network (localhost, private and link-local addresses). */
export function isPublicHost(raw: string): boolean {
  let h: string;
  try { h = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, ""); } catch { return false; }
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") && !h.includes(":")) return false;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
    return true;
  }
  if (h.includes(":")) return !(h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:"));
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return false; // decimal/hex IP tricks
  return true;
}
