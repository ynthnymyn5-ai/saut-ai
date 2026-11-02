import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { MANAGE_AI } from "@/lib/rbac";
import { hoursSaved, satisfaction } from "@/lib/reports/weekly-format";
import { buildWeeklyReport, sendWeeklyReports } from "@/lib/reports/weekly";
import { engineDb } from "@/lib/so/context";

export const dynamic = "force-dynamic";

/** This week so far (last 7 days), computed live from real records. */
export const GET = route("weekly-report-get", async () => {
  const s = await requireApiSession(MANAGE_AI);
  if (s.demo) return ok({ demo: true });
  const data = await buildWeeklyReport(engineDb(), s.org.id);
  return ok({ ...data, hoursSaved: hoursSaved(data), satisfaction: satisfaction(data) });
}, { limit: 30 });

/** Send this week's report now (to owners/admins/managers who kept email alerts on). */
export const POST = route("weekly-report-send", async () => {
  const s = await requireApiSession(MANAGE_AI);
  if (s.demo) return ok({ demo: true });
  const r = await sendWeeklyReports(engineDb(), { orgId: s.org.id, force: true });
  await audit({ orgId: s.org.id, actorId: s.userId, action: "report.weekly_sent" });
  return ok(r);
}, { limit: 5 });
