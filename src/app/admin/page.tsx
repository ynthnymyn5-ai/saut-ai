import { AdminPanel, type AdminData } from "@/components/admin/AdminPanel";
import { requirePageAdmin } from "@/lib/auth";
import * as demo from "@/lib/demo-data";
import { allProviderStatus } from "@/lib/env";
import { PLANS } from "@/lib/plans";
import { supabaseService } from "@/lib/supabase/server";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const s = await requirePageAdmin();
  const providers = Object.fromEntries(Object.entries(allProviderStatus()).map(([k, v]) => [k, v.configured]));
  const db = supabaseService();

  let data: AdminData;
  if (s.demo || !db) {
    data = {
      demo: true,
      orgs: demo.demoAdminOrgs,
      payments: demo.demoPayments.map((p) => ({ ...p, org: "Layali Café" })),
      plans: PLANS.map((p) => ({ code: p.code, name: p.name.en, price_monthly: p.monthly, price_annual: p.annual, max_employees: p.maxEmployees, monthly_voice_minutes: p.voiceMinutes, monthly_conversations: p.conversations, is_active: true })),
      coupons: demo.demoCoupons,
      tickets: demo.demoTickets,
      trial: { enabled: true, days: 14, requires_card: false },
      ai: { chat_model: "gpt-4o-mini", realtime_model: "gpt-realtime", max_call_seconds: 600 },
      providers,
      db: "not_configured",
      users: [{ id: "u1", email: "demo@saut.ai", full_name: "Demo Owner", platform_role: "admin", status: "active", created_at: "2026-05-02" }],
      audit: [],
      usage: [],
      failedIntegrations: [],
      costs: { voice_per_min_usd: 0.06, llm_per_1k_tokens_usd: 0.0006, whatsapp_per_msg_usd: 0.03, usd_to_kwd: 0.307 },
      addonPrices: { extra_employee: 9, voice_minutes_500: 12, messages_2000: 5 },
    };
  } else {
    const monthStart = new Date(); monthStart.setUTCDate(1);
    const [orgs, pays, plans, coupons, tickets, settings, users, audit, usage, failed] = await Promise.all([
      db.from("admin_org_overview").select("*").order("created_at", { ascending: false }).limit(500),
      db.from("payments").select("id, created_at, amount, currency, status, method, provider, organizations(name)").order("created_at", { ascending: false }).limit(100),
      db.from("subscription_plans").select("code, name_en, price_monthly, price_annual, max_employees, monthly_voice_minutes, monthly_conversations, is_active").order("sort_order"),
      db.from("coupons").select("code, percent_off, amount_off, times_redeemed, max_redemptions, expires_at, is_active"),
      db.from("support_tickets").select("id, subject, status, priority, created_at, organizations(name)").order("created_at", { ascending: false }).limit(100),
      db.from("platform_settings").select("key, value"),
      db.from("users").select("id, email, full_name, platform_role, status, created_at").order("created_at", { ascending: false }).limit(300),
      db.from("audit_logs").select("id, organization_id, actor_id, action, target_type, target_id, created_at").order("created_at", { ascending: false }).limit(150),
      db.from("admin_usage_by_org").select("organization_id, name, metric, quantity").gte("month", monthStart.toISOString().slice(0, 10)),
      db.from("admin_failed_integrations").select("organization_id, name, provider, last_error, updated_at").limit(100),
    ]);
    const setting = (k: string) => settings.data?.find((x) => x.key === k)?.value;
    data = {
      demo: false,
      orgs: (orgs.data ?? []).map((o) => ({ id: o.id, name: o.name, country: o.country, plan: o.plan ?? "—", status: o.status === "suspended" ? "suspended" : (o.subscription_status ?? "no plan"), users: o.members, mrr: Number(o.mrr ?? 0), created: String(o.created_at).slice(0, 10) })),
      payments: (pays.data ?? []).map((p) => ({ id: p.id, date: p.created_at.slice(0, 10), amount: Number(p.amount), currency: p.currency, status: p.status, method: p.method ?? "—", provider: p.provider, org: (p.organizations as unknown as { name: string })?.name ?? "—" })),
      plans: (plans.data ?? []).map((p) => ({ ...p, name: p.name_en, price_monthly: Number(p.price_monthly), price_annual: Number(p.price_annual) })),
      coupons: (coupons.data ?? []).map((c) => ({ code: c.code, off: c.percent_off ? `${c.percent_off}%` : `${c.amount_off} KWD`, redeemed: c.times_redeemed, max: c.max_redemptions ?? 0, expires: c.expires_at?.slice(0, 10) ?? "—", active: c.is_active })),
      tickets: (tickets.data ?? []).map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, at: t.created_at, org: (t.organizations as unknown as { name: string })?.name ?? "—" })),
      trial: (setting("trial") as AdminData["trial"]) ?? { enabled: true, days: 14, requires_card: false },
      ai: (setting("ai") as AdminData["ai"]) ?? { chat_model: "gpt-4o-mini", realtime_model: "gpt-realtime", max_call_seconds: 600 },
      providers,
      db: orgs.error ? "down" : "ok",
      users: (users.data ?? []).map((u) => ({ ...u, created_at: String(u.created_at).slice(0, 10) })),
      audit: (audit.data ?? []).map((a) => ({ ...a, id: String(a.id) })),
      usage: (usage.data ?? []).map((u) => ({ org: u.name, metric: u.metric, quantity: Number(u.quantity) })),
      failedIntegrations: (failed.data ?? []).map((f) => ({ org: f.name, provider: f.provider, error: f.last_error, at: f.updated_at })),
      costs: (setting("provider_costs") as AdminData["costs"]) ?? { voice_per_min_usd: 0.06, llm_per_1k_tokens_usd: 0.0006, whatsapp_per_msg_usd: 0.03, usd_to_kwd: 0.307 },
      addonPrices: (setting("addon_prices") as AdminData["addonPrices"]) ?? { extra_employee: 9, voice_minutes_500: 12, messages_2000: 5 },
    };
  }
  return <AdminPanel data={data} />;
}
