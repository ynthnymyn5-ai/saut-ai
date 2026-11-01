import "server-only";
import { serverEnv } from "@/lib/env";

/** Sends one email through Resend. Never pretends: returns ok only when Resend accepted it. */
export async function sendEmail(to: string | string[], subject: string, text: string, html?: string) {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: serverEnv("EMAIL_FROM"), to: Array.isArray(to) ? to : [to], subject: subject.slice(0, 200), text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false as const, error: `Email service unreachable: ${e instanceof Error ? e.message : "network"}`, retryable: true };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) return { ok: false as const, error: data.message ?? `Resend error ${res.status}`, retryable: res.status === 429 || res.status >= 500 };
  return { ok: true as const, id: data.id };
}
