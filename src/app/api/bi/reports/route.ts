import { ANY_MEMBER } from "@/lib/rbac";
import { ok, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { computeMetrics, estimates, periodRange, previousRange } from "@/lib/so/bi";

export const dynamic = "force-dynamic";

/** Dashboard data: this month vs. previous period (measured) + saved Q&A reports. */
export const GET = route("bi-reports", async (req) => {
  const c = await orgContext(ANY_MEMBER);
  if (c.demo) return ok({ demo: true });
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch");
  const branchId = branch && (!c.branchIds || c.branchIds.includes(branch)) ? branch : c.branchIds?.length === 1 ? c.branchIds[0] : null;
  const [from, to] = periodRange("this_month");
  const [pFrom, pTo] = previousRange(from, to);
  const [current, previous, { data: reports }] = await Promise.all([
    computeMetrics(c.db, c.s.org.id, from, to, branchId),
    computeMetrics(c.db, c.s.org.id, pFrom, pTo, branchId),
    c.db.from("business_reports").select("id, question, interpretation, created_at, period_start, period_end").eq("organization_id", c.s.org.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return ok({ current, previous, estimated: estimates(current), reports: reports ?? [] });
});
