import "server-only";
import { CONTACT_EMAIL } from "@/lib/contact";
import { serverEnv, smtpConfigured } from "@/lib/env";

type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

/** SMTP (e.g. Gmail: smtp.gmail.com, port 465, an app password). Returns ok only when the server accepted it. */
async function sendSmtp(to: string[], subject: string, text: string, html?: string): Promise<SendResult> {
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
  });
  try {
    const info = await transport.sendMail({ from: process.env.EMAIL_FROM || `SAUT AI <${process.env.SMTP_USER}>`, replyTo: CONTACT_EMAIL, to, subject: subject.slice(0, 200), text, ...(html ? { html } : {}) });
    if (!info.accepted?.length) return { ok: false, error: `SMTP rejected all recipients`, retryable: false };
    return { ok: true, id: String(info.messageId ?? "smtp") };
  } catch (e) {
    const err = e as { responseCode?: number; code?: string; message?: string };
    // 4xx and network errors are temporary; 5xx (bad login, rejected address) are not.
    const retryable = !err.responseCode || (err.responseCode >= 400 && err.responseCode < 500) || ["ETIMEDOUT", "ECONNECTION", "ESOCKET"].includes(err.code ?? "");
    return { ok: false, error: `SMTP: ${(err.message ?? "send failed").slice(0, 300)}`, retryable };
  }
}

/** Sends one email through Resend, or SMTP when Resend isn't configured. Never pretends: ok only when accepted. */
export async function sendEmail(to: string | string[], subject: string, text: string, html?: string): Promise<SendResult> {
  if (!process.env.RESEND_API_KEY && smtpConfigured()) return sendSmtp(Array.isArray(to) ? to : [to], subject, text, html);
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${serverEnv("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: serverEnv("EMAIL_FROM"), reply_to: CONTACT_EMAIL, to: Array.isArray(to) ? to : [to], subject: subject.slice(0, 200), text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false as const, error: `Email service unreachable: ${e instanceof Error ? e.message : "network"}`, retryable: true };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) return { ok: false as const, error: data.message ?? `Resend error ${res.status}`, retryable: res.status === 429 || res.status >= 500 };
  return { ok: true as const, id: data.id };
}
