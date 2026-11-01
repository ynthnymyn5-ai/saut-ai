import crypto from "node:crypto";
import { reportError } from "@/lib/monitoring";
import { engineDb } from "@/lib/so/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the job refuses to run. */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

/**
 * Daily maintenance (scheduled in vercel.json):
 *  1. purge conversations/recordings older than each business's retention period;
 *  2. move subscriptions whose paid period lapsed to past_due → canceled (after grace).
 * Each step reports its own result; one failing doesn't stop the other.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Forbidden", { status: 403 });
  const db = engineDb();
  const out: Record<string, unknown> = {};
  for (const [key, fn] of [["purged", "purge_expired_conversations"], ["subscriptions", "expire_lapsed_subscriptions"]] as const) {
    const { data, error } = await db.rpc(fn);
    if (error) { out[key] = { error: error.message }; reportError(new Error(`${fn}: ${error.message}`), { scope: "cron-maintenance" }); }
    else out[key] = data;
  }
  console.info(JSON.stringify({ level: "info", scope: "cron-maintenance", ...out }));
  return Response.json({ ok: true, ...out });
}
