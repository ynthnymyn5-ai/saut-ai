/**
 * Error monitoring. Always logs structured JSON (Vercel/Datadog/Fly pick it up). When
 * ERROR_MONITORING_DSN holds a Sentry DSN, errors are also sent to Sentry's envelope API
 * with plain fetch — no SDK needed. Only the error and the small context object are sent:
 * never request bodies, message text, phone numbers or emails.
 */
export function reportError(err: unknown, context: Record<string, unknown> = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(JSON.stringify({ level: "error", message: e.message, stack: e.stack, ...context, at: new Date().toISOString() }));
  const dsn = typeof process !== "undefined" ? process.env.ERROR_MONITORING_DSN : undefined;
  const target = dsn ? parseSentryDsn(dsn) : null;
  if (!target) return;
  const env = buildSentryEnvelope(e, context, { dsn: dsn!, environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "production", release: process.env.VERCEL_GIT_COMMIT_SHA });
  fetch(target.url, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": target.auth }, body: env }).catch(() => {});
}

export function parseSentryDsn(dsn: string): { url: string; auth: string } | null {
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "").split("/").pop();
    if (!u.username || !project || !/^\d+$/.test(project)) return null;
    const prefix = u.pathname.replace(/\/?[^/]+\/?$/, "");
    return {
      url: `${u.protocol}//${u.host}${prefix}/api/${project}/envelope/`,
      auth: `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=saut-ai/1.0`,
    };
  } catch {
    return null;
  }
}

const SAFE_KEY = /^(scope|event|provider|doc|status|code|route|kind)$/;

export function buildSentryEnvelope(e: Error, context: Record<string, unknown>, opts: { dsn: string; environment: string; release?: string }, now = new Date()) {
  const eventId = cryptoRandomHex();
  const tags = Object.fromEntries(Object.entries(context).filter(([k, v]) => SAFE_KEY.test(k) && ["string", "number", "boolean"].includes(typeof v)).map(([k, v]) => [k, String(v).slice(0, 200)]));
  const frames = (e.stack ?? "").split("\n").slice(1, 30).map((l) => l.trim()).filter((l) => l.startsWith("at ")).reverse()
    .map((l) => { const m = /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(l); return m ? { function: m[1] ?? "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) } : { function: l.slice(3) }; });
  const event = {
    event_id: eventId, timestamp: now.getTime() / 1000, platform: "node", level: "error",
    environment: opts.environment, ...(opts.release ? { release: opts.release } : {}), tags,
    exception: { values: [{ type: e.name || "Error", value: e.message.slice(0, 1000), ...(frames.length ? { stacktrace: { frames } } : {}) }] },
  };
  const payload = JSON.stringify(event);
  return [
    JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: opts.dsn }),
    JSON.stringify({ type: "event", content_type: "application/json", length: new TextEncoder().encode(payload).length }),
    payload,
  ].join("\n");
}

function cryptoRandomHex() {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
