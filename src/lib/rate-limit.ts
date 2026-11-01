import "server-only";

/**
 * Rate limiting.
 *  - With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN: a fixed-window counter in Redis,
 *    shared by every server instance/region (needed on Vercel, where instances don't share memory).
 *  - Otherwise (or if Redis is unreachable): in-memory sliding window per instance.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) hits.clear();
  return { ok: true, retryAfter: 0 };
}

export async function checkRateLimit(key: string, limit = 30, windowMs = 60_000): Promise<{ ok: boolean; retryAfter: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return rateLimit(key, limit, windowMs);
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const k = `rl:${key}:${bucket}`;
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", k], ["PEXPIRE", k, String(windowMs), "NX"]]),
      signal: AbortSignal.timeout(800),
      cache: "no-store",
    });
    const data = (await r.json()) as { result?: unknown }[];
    const count = Number(data?.[0]?.result);
    if (!r.ok || !Number.isFinite(count)) return rateLimit(key, limit, windowMs);
    return count > limit ? { ok: false, retryAfter: Math.ceil(((bucket + 1) * windowMs - now) / 1000) } : { ok: true, retryAfter: 0 };
  } catch {
    return rateLimit(key, limit, windowMs); // Redis down → still protected per instance
  }
}

export function clientKey(req: Request, scope: string) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return `${scope}:${ip}`;
}
