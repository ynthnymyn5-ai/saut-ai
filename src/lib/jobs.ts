import "server-only";
import { providerStatus } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { notify, type DB } from "@/lib/so/context";
import { afterFailure } from "./jobs-core";

export type JobKind = "whatsapp_text" | "email";
type Job = { id: string; organization_id: string; kind: JobKind; payload: Record<string, unknown>; attempts: number; max_attempts: number; message_id: string | null };
type Result = { ok: true; id?: string } | { ok: false; error: string; retryable: boolean };

async function deliver(job: Job): Promise<Result> {
  if (job.kind === "whatsapp_text") {
    if (!providerStatus("whatsapp").configured) return { ok: false, error: "WhatsApp is not configured", retryable: false };
    const { sendWhatsAppText } = await import("@/lib/messaging/whatsapp");
    const p = job.payload as { to: string; parts: string[] };
    let id: string | undefined;
    for (const part of p.parts) {
      const r = await sendWhatsAppText(p.to, part);
      if (!r.ok) return { ok: false, error: r.error, retryable: !!r.retryable };
      id = r.id;
    }
    return { ok: true, id };
  }
  if (!providerStatus("email").configured) return { ok: false, error: "Email is not configured (RESEND_API_KEY, EMAIL_FROM)", retryable: false };
  const { sendEmail } = await import("@/lib/messaging/email");
  const p = job.payload as { to: string[]; subject: string; text: string };
  const r = await sendEmail(p.to, p.subject, p.text);
  return r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error, retryable: r.retryable };
}

/** Runs one job and records the outcome. Dead WhatsApp replies alert staff so a customer is never silently ignored. */
export async function runJob(db: DB, job: Job) {
  const r = await deliver(job).catch((e): Result => ({ ok: false, error: e instanceof Error ? e.message : "error", retryable: true }));
  if (r.ok) {
    await db.from("outbound_jobs").update({ status: "sent", attempts: job.attempts + 1, sent_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
    if (job.message_id) await db.from("messages").update({ delivery_status: "sent", provider_message_id: r.id ?? null }).eq("id", job.message_id);
    return true;
  }
  const next = afterFailure(job, r.retryable);
  await db.from("outbound_jobs").update({ ...next, last_error: r.error.slice(0, 1000) }).eq("id", job.id);
  if (next.status === "dead") {
    if (job.message_id) await db.from("messages").update({ delivery_status: "failed" }).eq("id", job.message_id);
    if (job.kind === "whatsapp_text") await notify(db, { orgId: job.organization_id, kind: "integration", title: "A WhatsApp reply could not be delivered", body: r.error.slice(0, 300), link: "/dashboard/settings#deliveries" });
  }
  return false;
}

/** Queues a delivery and tries it immediately; failures are retried with backoff by later runs. */
export async function enqueue(db: DB, job: { orgId: string; kind: JobKind; payload: object; conversationId?: string | null; messageId?: string | null; maxAttempts?: number }) {
  const { data, error } = await db.from("outbound_jobs").insert({
    organization_id: job.orgId, kind: job.kind, payload: job.payload, conversation_id: job.conversationId ?? null, message_id: job.messageId ?? null, max_attempts: job.maxAttempts ?? 5,
  }).select("id, organization_id, kind, payload, attempts, max_attempts, message_id").single();
  if (error || !data) { reportError(error ?? new Error("enqueue failed"), { scope: "jobs-enqueue" }); return null; }
  return data as Job;
}

/** Processes due jobs (called after inbound traffic and by the maintenance cron). */
export async function processDueJobs(db: DB, limit = 10) {
  const { data } = await db.from("outbound_jobs").select("id, organization_id, kind, payload, attempts, max_attempts, message_id")
    .eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(limit);
  let sent = 0, failed = 0;
  for (const job of (data ?? []) as Job[]) {
    // claim: only one runner moves it forward (attempts acts as a version number)
    const { data: claimed } = await db.from("outbound_jobs").update({ next_attempt_at: new Date(Date.now() + 120_000).toISOString() })
      .eq("id", job.id).eq("status", "pending").eq("attempts", job.attempts).lte("next_attempt_at", new Date().toISOString()).select("id").maybeSingle();
    if (!claimed) continue;
    if (await runJob(db, job)) sent++; else failed++;
  }
  return { sent, failed };
}
