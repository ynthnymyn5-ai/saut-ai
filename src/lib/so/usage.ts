import "server-only";
import { notify, type DB } from "./context";

/** Limits = plan allowance + active add-ons. */
export async function usageVsLimits(db: DB, orgId: string) {
  const monthStart = new Date(); monthStart.setUTCDate(1);
  const period = monthStart.toISOString().slice(0, 10);
  const [{ data: sub }, { data: addons }, { data: usage }, { count: employees }] = await Promise.all([
    db.from("subscriptions").select("subscription_plans(code, max_employees, monthly_voice_minutes, monthly_conversations)").eq("organization_id", orgId).in("status", ["trialing", "active", "past_due"]).maybeSingle(),
    db.from("subscription_addons").select("kind, quantity").eq("organization_id", orgId).eq("status", "active"),
    db.from("usage_records").select("metric, quantity").eq("organization_id", orgId).gte("period_start", period),
    db.from("ai_employees").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
  ]);
  const plan = sub?.subscription_plans as unknown as { code: string; max_employees: number; monthly_voice_minutes: number; monthly_conversations: number } | null;
  const add = (k: string) => (addons ?? []).filter((a) => a.kind === k).reduce((s, a) => s + Number(a.quantity), 0);
  const used = (m: string) => (usage ?? []).filter((u) => u.metric === m).reduce((s, u) => s + Number(u.quantity), 0);
  return {
    period,
    plan: plan?.code ?? null,
    voiceMinutes: { used: Math.round(used("voice_seconds") / 60), limit: (plan?.monthly_voice_minutes ?? 0) + add("voice_minutes") },
    conversations: { used: used("conversations"), limit: plan?.monthly_conversations ?? 0 },
    whatsappMessages: { used: used("whatsapp_messages"), limit: (plan?.monthly_conversations ?? 0) + add("messages") },
    employees: { used: employees ?? 0, limit: (plan?.max_employees ?? 1) + add("extra_employee") },
  };
}

/** Sends each threshold alert (80 %, 100 %) once per metric per month. */
export async function checkUsageAlerts(db: DB, orgId: string) {
  const u = await usageVsLimits(db, orgId);
  const { data: setting } = await db.from("platform_settings").select("value").eq("key", "usage_alert_thresholds").maybeSingle();
  const thresholds = (setting?.value as number[]) ?? [80, 100];
  for (const [metric, v] of Object.entries({ voice_minutes: u.voiceMinutes, conversations: u.conversations, whatsapp_messages: u.whatsappMessages })) {
    if (!v.limit) continue;
    const pct = (v.used / v.limit) * 100;
    for (const t of thresholds.filter((t) => pct >= t)) {
      const { error } = await db.from("usage_alerts").insert({ organization_id: orgId, metric, threshold: t, period_start: u.period });
      if (!error) await notify(db, { orgId, kind: "usage", title: `${metric.replace("_", " ")} at ${t}% of your plan`, body: `${v.used.toLocaleString()} of ${v.limit.toLocaleString()} used this month.`, link: "/dashboard/billing" });
    }
  }
  return u;
}
