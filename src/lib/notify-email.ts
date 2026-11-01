import "server-only";
import { providerStatus, publicEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import type { DB } from "@/lib/so/context";

/** Alerts worth an email (others stay in the in-app bell only). */
const EMAIL_KINDS = new Set(["task", "usage", "integration", "order", "escalation"]);

/**
 * Emails owners/admins/managers who kept "email me" on. Throttled: the same alert is emailed at
 * most once per 15 minutes per business, so a busy WhatsApp line doesn't flood inboxes.
 * Does nothing (and claims nothing) when RESEND_API_KEY / EMAIL_FROM aren't configured.
 */
export async function emailAlert(db: DB, n: { orgId: string; kind: string; title: string; body?: string; link?: string }) {
  if (!EMAIL_KINDS.has(n.kind) || !providerStatus("email").configured) return;
  try {
    const subject = `SAUT AI · ${n.title}`.slice(0, 200);
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db.from("outbound_jobs").select("id", { count: "exact", head: true })
      .eq("organization_id", n.orgId).eq("kind", "email").eq("payload->>subject", subject).gte("created_at", since);
    if (count) return;
    const { data: members } = await db.from("memberships").select("role, notify_email, users(email)").eq("organization_id", n.orgId).in("role", ["owner", "admin", "manager"]).eq("notify_email", true);
    const to = [...new Set((members ?? []).map((m) => (m.users as unknown as { email: string | null } | null)?.email).filter((e): e is string => !!e))].slice(0, 20);
    if (!to.length) return;
    const link = n.link ? `${publicEnv.appUrl}${n.link.startsWith("/") ? n.link : `/${n.link}`}` : `${publicEnv.appUrl}/dashboard`;
    const text = `${n.title}\n\n${n.body ?? ""}\n\n${link}\n\n—\nYou receive this because you manage this business on SAUT AI. Turn these emails off in Settings → Your profile.`;
    const { enqueue, runJob } = await import("@/lib/jobs");
    const job = await enqueue(db, { orgId: n.orgId, kind: "email", payload: { to, subject, text } });
    if (job) await runJob(db, job);
  } catch (e) {
    reportError(e, { scope: "email-alert" });
  }
}
