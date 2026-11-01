/** Retry policy: exponential backoff for transient errors only (network, 429, 5xx). Pure + testable. */
export class PermanentError extends Error {}

export function isTransient(e: unknown) {
  if (e instanceof PermanentError) return false;
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number })?.status;
  if (status && (status === 429 || status >= 500)) return true;
  return /(ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up|timeout|rate limit)/i.test(msg);
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { attempts?: number; baseMs?: number; sleep?: (ms: number) => Promise<void> } = {}) {
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return { value: await fn(i), attempts: i };
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === attempts) break;
      await sleep((opts.baseMs ?? 300) * 2 ** (i - 1));
    }
  }
  throw Object.assign(last instanceof Error ? last : new Error(String(last)), { attemptsMade: attempts });
}
