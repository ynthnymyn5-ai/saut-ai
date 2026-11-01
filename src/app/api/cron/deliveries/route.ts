import crypto from "node:crypto";
import { processDueJobs } from "@/lib/jobs";
import { engineDb } from "@/lib/so/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retries due outbound deliveries. Call every few minutes from any scheduler
 * (Supabase pg_cron + pg_net, cron-job.org, GitHub Actions…) with `Authorization: Bearer $CRON_SECRET`.
 * Deliveries are also retried after every incoming WhatsApp webhook and by the daily maintenance job.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response("Forbidden", { status: 403 });
  return Response.json({ ok: true, ...(await processDueJobs(engineDb(), 50)) });
}
