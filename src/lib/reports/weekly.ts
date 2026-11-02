import "server-only";
import { publicEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import type { DB } from "@/lib/so/context";
import { formatWeeklyReport, hoursSaved, type WeeklyData } from "./weekly-format";

/** Measures one business's last 7 days from real records (test chats excluded). */
export async function buildWeeklyReport(db: DB, orgId: string, end = new Date()): Promise<WeeklyData> {
  const start = new Date(end.getTime() - 7 * 86400000);
  const from = start.toISOString(), to = end.toISOString();
  const [{ data: convs }, { data: orders }, appts, custs, leads, { data: org }] = await Promise.all([
    db.from("conversations").select("channel, status, handled_by, rating").eq("organization_id", orgId).neq("channel", "test").gte("started_at", from).lt("started_at", to).limit(20000),
    db.from("orders").select("total, currency, status").eq("organization_id", orgId).gte("created_at", from).lt("created_at", to).limit(20000),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", from).lt("created_at", to),
    db.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", from).lt("created_at", to),
    db.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", orgId).gte("created_at", from).lt("created_at", to),
    db.from("organizations").select("currency").eq("id", orgId).single(),
  ]);
  const c = convs ?? [];
  const byChannel: Record<string, number> = {};
  for (const x of c) byChannel[x.channel as string] = (byChannel[x.channel as string] ?? 0) + 1;
  const escalated = c.filter((x) => x.status === "transferred" || x.handled_by === "human").length;
  const currency = (org?.currency as string) || "KWD";
  const live = (orders ?? []).filter((o) => o.status !== "canceled");
  return {
    from: from.slice(0, 10), to: to.slice(0, 10),
    conversations: c.length, byChannel, aiHandled: c.length - escalated, escalated,
    orders: live.length, revenue: Math.round(live.filter((o) => o.currency === currency).reduce((s, o) => s + Number(o.total), 0) * 1000) / 1000, currency,
    appointments: appts.count ?? 0, newCustomers: custs.count ?? 0, leads: leads.count ?? 0,
    ratingsUp: c.filter((x) => x.rating === 1).length, ratingsDown: c.filter((x) => x.rating === -1).length,
  };
}

/**
 * Builds, stores and emails the weekly report for every active business (or one, with orgId).
 * Stored once per business per day (unique week_start), so a re-run never double-sends unless forced.
 */
export async function sendWeeklyReports(db: DB, opts: { orgId?: string; force?: boolean } = {}) {
  let q = db.from("organizations").select("id, name").eq("status", "active");
  if (opts.orgId) q = q.eq("id", opts.orgId);
  const { data: orgs } = await q.limit(5000);
  let sent = 0, skipped = 0;
  for (const o of orgs ?? []) {
    try {
      const data = await buildWeeklyReport(db, o.id as string);
      const week_start = data.from;
      if (!opts.force) {
        const { data: exists } = await db.from("weekly_reports").select("id").eq("organization_id", o.id).eq("week_start", week_start).maybeSingle();
        if (exists) { skipped++; continue; }
      }
      if (!opts.force && data.conversations === 0 && data.orders === 0 && data.appointments === 0) { skipped++; continue; } // nothing happened: no empty emails
      const { subject, text } = formatWeeklyReport(data, o.name as string, `${publicEnv.appUrl}/dashboard`);
      const { data: members } = await db.from("memberships").select("notify_email, users(email)").eq("organization_id", o.id).in("role", ["owner", "admin", "manager"]).eq("notify_email", true);
      const to = [...new Set((members ?? []).map((m) => (m.users as unknown as { email: string | null } | null)?.email).filter((e): e is string => !!e))].slice(0, 20);
      let emailed = 0;
      const { providerStatus } = await import("@/lib/env");
      if (to.length && providerStatus("email").configured) {
        const { enqueue, runJob } = await import("@/lib/jobs");
        const job = await enqueue(db, { orgId: o.id as string, kind: "email", payload: { to, subject, text } });
        if (job && (await runJob(db, job))) emailed = to.length;
      }
      await db.from("weekly_reports").upsert({ organization_id: o.id, week_start, data, emailed_to: emailed }, { onConflict: "organization_id,week_start" });
      await db.from("notifications").insert({ organization_id: o.id, kind: "report", title: "Your weekly report is ready", body: `${data.conversations} conversations · ${data.orders} orders · ~${hoursSaved(data)} h saved`, link: "/dashboard/settings#weekly-report" });
      sent++;
    } catch (e) {
      reportError(e, { scope: "weekly-report", org: o.id });
    }
  }
  return { sent, skipped };
}
