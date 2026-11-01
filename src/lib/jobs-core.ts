/** Outbound delivery retry policy (pure; unit-tested). */
export const BASE_DELAY_MS = 30_000;
export const MAX_DELAY_MS = 6 * 3600_000;

/** Delay before attempt n+1 after n failed attempts: 30 s, 2 min, 8 min, 32 min, ~2 h, capped at 6 h. */
export function retryDelayMs(failedAttempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 4 ** Math.max(0, failedAttempts - 1));
}

/** After a failed attempt: retry later, or give up ("dead") when out of attempts or the error is permanent. */
export function afterFailure(job: { attempts: number; max_attempts: number }, retryable: boolean, now = Date.now()):
  { status: "pending"; attempts: number; next_attempt_at: string } | { status: "dead"; attempts: number } {
  const attempts = job.attempts + 1;
  if (!retryable || attempts >= job.max_attempts) return { status: "dead", attempts };
  return { status: "pending", attempts, next_attempt_at: new Date(now + retryDelayMs(attempts)).toISOString() };
}
