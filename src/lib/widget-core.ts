/**
 * Website chat widget — pure helpers (no I/O; unit-tested).
 * The widget is an iframe served by SAUT AI and locked to the business's own domain with
 * CSP frame-ancestors, so another site can't embed a business's AI employee.
 */
export const WIDGET_KEY_RE = /^wk_[A-Za-z0-9_-]{20,40}$/;
export const SESSION_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** "https://www.Example.com/path" → "example.com"; rejects anything that isn't a plain hostname. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d) ? d : null;
}

/** CSP value allowing only the business's site (apex, www and subdomains) to embed the widget. */
export function frameAncestors(domain: string): string {
  return `frame-ancestors https://${domain} https://*.${domain}`;
}

/** True when the embedding page's address belongs to the configured domain (or a subdomain). */
export function hostAllowed(pageUrl: string | null | undefined, domain: string): boolean {
  if (!pageUrl) return false;
  try {
    const h = new URL(pageUrl).hostname.toLowerCase().replace(/\.$/, "");
    return h === domain || h.endsWith(`.${domain}`);
  } catch { return false; }
}

export const isWidgetKey = (k: string) => WIDGET_KEY_RE.test(k);
export const isSessionId = (s: string) => SESSION_RE.test(s);

/** Theme colour must be a #rrggbb hex (it is written into CSS). */
export const safeColor = (c: unknown, fallback = "#8B5CF6") => (typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback);
