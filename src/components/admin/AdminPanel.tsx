"use client";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, Building2, Cpu, CreditCard, LifeBuoy, Package, Percent, Plug, ScrollText, Search, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Badge, Button, Card, ConfirmDialog, DemoBadge, statusTone } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate, formatMoney } from "@/lib/utils";

export type AdminData = {
  demo: boolean;
  orgs: { id: string; name: string; country: string; plan: string; status: string; users: number; mrr: number; created: string }[];
  payments: { id: string; date: string; amount: number; currency: string; status: string; method: string; provider: string; org: string }[];
  plans: { code: string; name: string; price_monthly: number; price_annual: number; max_employees: number; monthly_voice_minutes: number; monthly_conversations: number; is_active: boolean }[];
  coupons: { code: string; off: string; redeemed: number; max: number; expires: string; active: boolean }[];
  tickets: { id: string; org: string; subject: string; status: string; priority: string; at: string }[];
  trial: { enabled: boolean; days: number; requires_card: boolean };
  ai: { chat_model: string; realtime_model: string; max_call_seconds: number };
  providers: Record<string, boolean>;
  db: string;
  users: { id: string; email: string; full_name: string | null; platform_role: string; status: string; created_at: string }[];
  audit: { id: string; organization_id: string | null; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; created_at: string }[];
  usage: { org: string; metric: string; quantity: number }[];
  failedIntegrations: { org: string; provider: string; error: string | null; at: string }[];
  costs: { voice_per_min_usd: number; llm_per_1k_tokens_usd: number; whatsapp_per_msg_usd: number; usd_to_kwd: number };
  addonPrices: { extra_employee: number; voice_minutes_500: number; messages_2000: number };
};

const TABS = [
  ["overview", Activity, "Overview", "نظرة عامة"],
  ["accounts", Building2, "Accounts", "الحسابات"],
  ["payments", CreditCard, "Subscriptions & payments", "الاشتراكات والمدفوعات"],
  ["plans", Package, "Plans, trial & limits", "الخطط والتجربة والحدود"],
  ["usage", Cpu, "AI usage & costs", "الاستخدام والتكاليف"],
  ["users", Users, "Users", "المستخدمون"],
  ["coupons", Percent, "Coupons", "الكوبونات"],
  ["tickets", LifeBuoy, "Support tickets", "تذاكر الدعم"],
  ["system", Plug, "Integrations & health", "التكاملات وصحة النظام"],
  ["audit", ScrollText, "Audit log", "سجل التدقيق"],
] as const;

export function AdminPanel({ data }: { data: AdminData }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview");
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState(data.orgs);
  const [confirmOrg, setConfirmOrg] = useState<AdminData["orgs"][number] | null>(null);
  const [plans, setPlans] = useState(data.plans);
  const [trial, setTrial] = useState(data.trial);
  const [ai, setAi] = useState(data.ai);
  const [tickets, setTickets] = useState(data.tickets);
  const [users, setUsers] = useState(data.users);
  const [costs, setCosts] = useState(data.costs);
  const [addonPrices, setAddonPrices] = useState(data.addonPrices);
  const [auditQ, setAuditQ] = useState("");
  // provider cost estimate for this month (USD → KWD), from usage × admin-configured rates
  const usageTotals = data.usage.reduce<Record<string, number>>((a, u) => { a[u.metric] = (a[u.metric] ?? 0) + u.quantity; return a; }, {});
  const costUsd = ((usageTotals.voice_seconds ?? 0) / 60) * costs.voice_per_min_usd + ((usageTotals.ai_tokens ?? 0) / 1000) * costs.llm_per_1k_tokens_usd + (usageTotals.whatsapp_messages ?? 0) * costs.whatsapp_per_msg_usd;

  async function act(body: Record<string, unknown>, success: string) {
    if (data.demo) { toast({ kind: "info", title: ar ? "وضع تجريبي — لم يتغير شيء" : "Demo mode — nothing changed" }); return false; }
    const res = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { toast({ kind: "error", title: d?.error?.message ?? "Failed" }); return false; }
    toast({ kind: "success", title: success });
    return true;
  }

  const mrr = orgs.reduce((a, o) => a + o.mrr, 0);
  const kpis = [
    [ar ? "الحسابات" : "Accounts", orgs.length],
    [ar ? "اشتراكات نشطة" : "Active subscriptions", orgs.filter((o) => o.status === "active").length],
    [ar ? "في التجربة" : "Trialing", orgs.filter((o) => o.status === "trialing").length],
    [ar ? "الإيراد الشهري المتكرر" : "MRR", formatMoney(mrr, "KWD", locale)],
    [ar ? "متأخرة الدفع" : "Past due", orgs.filter((o) => o.status === "past_due").length],
    [ar ? "تذاكر مفتوحة" : "Open tickets", tickets.filter((t) => !["resolved", "closed"].includes(t.status)).length],
    [ar ? "دقائق صوتية هذا الشهر" : "Voice minutes this month", Math.round((usageTotals.voice_seconds ?? 0) / 60).toLocaleString()],
    [ar ? "تكلفة المزوّدين التقديرية" : "Est. provider cost (month)", formatMoney(costUsd * costs.usd_to_kwd, "KWD", locale)],
    [ar ? "تكاملات متعطلة" : "Failed integrations", data.failedIntegrations.length],
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3"><Logo size={28} /><Badge tone="blue">ADMIN</Badge>{data.demo && <DemoBadge />}</div>
          <div className="flex items-center gap-2"><LanguageSwitcher /><Link href="/dashboard" className="flex items-center gap-1 text-xs text-muted hover:text-white"><ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />{ar ? "لوحة العميل" : "Customer dashboard"}</Link></div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-8">
          {TABS.map(([k, I, en, arL]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm", tab === k ? "text-white" : "text-muted hover:text-white")}>
              {tab === k && <motion.span layoutId="adminTab" className="absolute inset-0 rounded-xl bg-white/[0.07]" />}
              <I className="relative h-4 w-4" /><span className="relative">{ar ? arL : en}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        {tab === "overview" && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map(([l, v]) => <Card key={l as string}><p className="text-sm text-muted">{l}</p><p className="mt-2 font-display text-3xl font-semibold">{v}</p></Card>)}
          </div>
        )}

        {tab === "accounts" && (
          <>
            <div className="relative mb-4 max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar ? "بحث" : "Search"} className="input ps-9" /></div>
            <Table head={[ar ? "الحساب" : "Account", ar ? "الدولة" : "Country", ar ? "الخطة" : "Plan", ar ? "الحالة" : "Status", ar ? "المستخدمون" : "Users", "MRR", ar ? "أُنشئ" : "Created", ""]}>
              {orgs.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())).map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-medium">{o.name}</td><td className="px-4 py-3">{o.country}</td><td className="px-4 py-3">{o.plan}</td>
                  <td className="px-4 py-3"><Badge tone={statusTone(o.status)}>{o.status}</Badge></td><td className="px-4 py-3">{o.users}</td>
                  <td className="px-4 py-3">{formatMoney(o.mrr, "KWD", locale)}</td><td className="px-4 py-3 text-muted">{o.created}</td>
                  <td className="px-4 py-3 text-end"><Button size="sm" variant={o.status === "suspended" ? "outline" : "ghost"} onClick={() => setConfirmOrg(o)}>{o.status === "suspended" ? (ar ? "تفعيل" : "Activate") : (ar ? "تعليق" : "Suspend")}</Button></td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {tab === "payments" && (
          <Table head={[ar ? "التاريخ" : "Date", ar ? "الحساب" : "Account", ar ? "المبلغ" : "Amount", ar ? "الطريقة" : "Method", ar ? "المزوّد" : "Provider", ar ? "الحالة" : "Status"]}>
            {data.payments.map((p) => (
              <tr key={p.id}><td className="px-4 py-3">{p.date}</td><td className="px-4 py-3">{p.org}</td><td className="px-4 py-3 font-medium">{formatMoney(p.amount, p.currency, locale)}</td><td className="px-4 py-3 text-muted">{p.method}</td><td className="px-4 py-3 text-muted">{p.provider}</td><td className="px-4 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td></tr>
            ))}
          </Table>
        )}

        {tab === "plans" && (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {plans.map((p, i) => (
                <Card key={p.code}>
                  <div className="flex items-center justify-between"><h3 className="font-display text-lg font-semibold">{p.name}</h3>
                    <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" className="accent-violet" checked={p.is_active} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} />{ar ? "فعّال" : "Active"}</label></div>
                  {([["price_monthly", ar ? "السعر الشهري (د.ك)" : "Monthly price (KWD)"], ["price_annual", ar ? "السعر السنوي (د.ك)" : "Annual price (KWD)"], ["max_employees", ar ? "حد الموظفين" : "Max AI employees"], ["monthly_voice_minutes", ar ? "دقائق صوتية / شهر" : "Voice minutes / month"], ["monthly_conversations", ar ? "محادثات / شهر" : "Conversations / month"]] as const).map(([k, l]) => (
                    <div key={k} className="mt-3"><label className="label">{l}</label><input type="number" step={k.startsWith("price") ? "0.001" : "1"} min={0} value={p[k]} onChange={(e) => setPlans(plans.map((x, j) => j === i ? { ...x, [k]: Number(e.target.value) } : x))} className="input" /></div>
                  ))}
                  <Button className="mt-4 w-full" onClick={() => act({ action: "plan.update", ...p, name: undefined }, ar ? "تم تحديث الخطة" : "Plan updated")}>{ar ? "حفظ" : "Save plan"}</Button>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h3 className="mb-4 font-semibold">{ar ? "التجربة المجانية" : "Free trial"}</h3>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="accent-violet" checked={trial.enabled} onChange={(e) => setTrial({ ...trial, enabled: e.target.checked })} />{ar ? "تفعيل التجربة" : "Enable trial"}</label>
                <div className="mt-3"><label className="label">{ar ? "عدد الأيام" : "Trial days"}</label><input type="number" min={0} max={90} value={trial.days} onChange={(e) => setTrial({ ...trial, days: Number(e.target.value) })} className="input" /></div>
                <label className="mt-3 flex items-center gap-3 text-sm"><input type="checkbox" className="accent-violet" checked={trial.requires_card} onChange={(e) => setTrial({ ...trial, requires_card: e.target.checked })} />{ar ? "تتطلب بطاقة" : "Require card"}</label>
                <Button className="mt-4" onClick={() => act({ action: "trial.update", ...trial }, ar ? "تم الحفظ" : "Trial saved")}>{ar ? "حفظ" : "Save"}</Button>
              </Card>
              <Card>
                <h3 className="mb-4 font-semibold">{ar ? "نماذج وحدود الذكاء الاصطناعي" : "AI models & usage limits"}</h3>
                <div><label className="label">Chat model</label><input value={ai.chat_model} onChange={(e) => setAi({ ...ai, chat_model: e.target.value })} className="input" dir="ltr" /></div>
                <div className="mt-3"><label className="label">Realtime model</label><input value={ai.realtime_model} onChange={(e) => setAi({ ...ai, realtime_model: e.target.value })} className="input" dir="ltr" /></div>
                <div className="mt-3"><label className="label">{ar ? "أقصى مدة للمكالمة (ثانية)" : "Max call length (seconds)"}</label><input type="number" min={30} max={3600} value={ai.max_call_seconds} onChange={(e) => setAi({ ...ai, max_call_seconds: Number(e.target.value) })} className="input" /></div>
                <Button className="mt-4" onClick={() => act({ action: "ai.limits", ...ai }, ar ? "تم الحفظ" : "Saved")}>{ar ? "حفظ" : "Save"}</Button>
              </Card>
            </div>
          </div>
        )}

        {tab === "usage" && (
          <div className="space-y-6">
            <Table head={[ar ? "الحساب" : "Account", ar ? "المقياس" : "Metric", ar ? "الكمية هذا الشهر" : "This month"]}>
              {data.usage.length === 0 ? <tr><td className="px-4 py-6 text-muted" colSpan={3}>{ar ? "لا يوجد استخدام مسجّل هذا الشهر." : "No usage recorded this month."}</td></tr> : data.usage.sort((a, b) => b.quantity - a.quantity).map((u, i) => (
                <tr key={i}><td className="px-4 py-3">{u.org}</td><td className="px-4 py-3 text-muted">{u.metric}</td><td className="px-4 py-3 tabular-nums">{u.metric === "voice_seconds" ? `${Math.round(u.quantity / 60).toLocaleString()} min` : u.quantity.toLocaleString()}</td></tr>
              ))}
            </Table>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h3 className="mb-1 font-semibold">{ar ? "أسعار تكلفة المزوّدين" : "Provider cost rates"}</h3>
                <p className="mb-4 text-xs text-muted">{ar ? "تُستخدم لتقدير التكلفة فقط؛ الفواتير الفعلية من المزوّدين." : "Used for estimates only; actual bills come from each provider."}</p>
                {(Object.keys(costs) as (keyof typeof costs)[]).map((k) => <div key={k} className="mt-3"><label className="label">{k}</label><input type="number" step="0.0001" min={0} value={costs[k]} onChange={(e) => setCosts({ ...costs, [k]: Number(e.target.value) })} className="input" /></div>)}
                <Button className="mt-4" onClick={() => act({ action: "provider.costs", ...costs }, ar ? "تم الحفظ" : "Saved")}>{ar ? "حفظ" : "Save"}</Button>
              </Card>
              <Card>
                <h3 className="mb-1 font-semibold">{ar ? "أسعار الإضافات (د.ك)" : "Add-on prices (KWD)"}</h3>
                <p className="mb-4 text-xs text-muted">{ar ? "تظهر للعملاء في صفحة الفوترة." : "Shown to customers on the billing page."}</p>
                {(Object.keys(addonPrices) as (keyof typeof addonPrices)[]).map((k) => <div key={k} className="mt-3"><label className="label">{k}</label><input type="number" step="0.001" min={0} value={addonPrices[k]} onChange={(e) => setAddonPrices({ ...addonPrices, [k]: Number(e.target.value) })} className="input" /></div>)}
                <Button className="mt-4" onClick={() => act({ action: "addon.prices", ...addonPrices }, ar ? "تم الحفظ" : "Saved")}>{ar ? "حفظ" : "Save"}</Button>
              </Card>
            </div>
          </div>
        )}

        {tab === "users" && (
          <Table head={[ar ? "البريد" : "Email", ar ? "الاسم" : "Name", ar ? "دور المنصة" : "Platform role", ar ? "الحالة" : "Status", ar ? "انضم" : "Joined"]}>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3" dir="ltr">{u.email}</td><td className="px-4 py-3">{u.full_name ?? "—"}</td>
                <td className="px-4 py-3"><select aria-label="role" className="input w-auto py-1 text-xs" value={u.platform_role} onChange={async (e) => { const v = e.target.value; if (await act({ action: "user.update", userId: u.id, platform_role: v }, ar ? "تم" : "Updated")) setUsers(users.map((x) => x.id === u.id ? { ...x, platform_role: v } : x)); }}><option value="user">user</option><option value="admin">admin</option></select></td>
                <td className="px-4 py-3"><button onClick={async () => { const v = u.status === "active" ? "suspended" : "active"; if (await act({ action: "user.update", userId: u.id, status: v }, ar ? "تم" : "Updated")) setUsers(users.map((x) => x.id === u.id ? { ...x, status: v } : x)); }}><Badge tone={statusTone(u.status)}>{u.status}</Badge></button></td>
                <td className="px-4 py-3 text-muted">{u.created_at}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "audit" && (
          <>
            <div className="relative mb-4 max-w-sm"><Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={auditQ} onChange={(e) => setAuditQ(e.target.value)} placeholder={ar ? "تصفية حسب الإجراء" : "Filter by action"} className="input ps-9" /></div>
            <Table head={[ar ? "الوقت" : "Time", ar ? "الإجراء" : "Action", ar ? "الهدف" : "Target", ar ? "المنفّذ" : "Actor", ar ? "الحساب" : "Org"]}>
              {data.audit.filter((a) => a.action.includes(auditQ)).map((a) => (
                <tr key={a.id}><td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted">{formatDate(a.created_at, locale)}</td><td className="px-4 py-2.5 font-mono text-xs">{a.action}</td><td className="px-4 py-2.5 text-xs text-muted">{a.target_type ?? ""} {a.target_id?.slice(0, 8) ?? ""}</td><td className="px-4 py-2.5 font-mono text-xs text-muted">{a.actor_id?.slice(0, 8) ?? "system"}</td><td className="px-4 py-2.5 font-mono text-xs text-muted">{a.organization_id?.slice(0, 8) ?? "—"}</td></tr>
              ))}
            </Table>
          </>
        )}

        {tab === "coupons" && <Coupons coupons={data.coupons} act={act} />}

        {tab === "tickets" && (
          <Table head={[ar ? "الموضوع" : "Subject", ar ? "الحساب" : "Account", ar ? "الأولوية" : "Priority", ar ? "الحالة" : "Status", ar ? "التاريخ" : "Opened"]}>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-medium">{t.subject}</td><td className="px-4 py-3 text-muted">{t.org}</td>
                <td className="px-4 py-3"><Badge tone={statusTone(t.priority)}>{t.priority}</Badge></td>
                <td className="px-4 py-3">
                  <select value={t.status} onChange={async (e) => { const v = e.target.value; if (await act({ action: "ticket.status", ticketId: t.id, status: v }, ar ? "تم التحديث" : "Updated")) setTickets(tickets.map((x) => x.id === t.id ? { ...x, status: v } : x)); }} className="input w-auto py-1.5 text-xs">
                    {["open", "in_progress", "waiting", "resolved", "closed"].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-muted">{formatDate(t.at, locale)}</td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "system" && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card><p className="text-sm text-muted">{ar ? "قاعدة البيانات" : "Database"}</p><Badge tone={data.db === "ok" ? "green" : data.db === "down" ? "red" : "amber"} className="mt-3">{data.db}</Badge></Card>
            {Object.entries(data.providers).map(([k, v]) => (
              <Card key={k}><p className="text-sm capitalize text-muted">{k}</p><Badge tone={v ? "green" : "amber"} className="mt-3">{v ? (ar ? "مُعد" : "configured") : (ar ? "غير مُعد" : "not configured")}</Badge></Card>
            ))}
            <Card className="sm:col-span-2 xl:col-span-4">
              <h3 className="mb-3 font-semibold">{ar ? "تكاملات متعطلة" : "Failed integrations"}</h3>
              {data.failedIntegrations.length === 0 ? <p className="text-sm text-muted">{ar ? "لا توجد تكاملات متعطلة." : "No failing integrations."}</p> : (
                <ul className="space-y-1.5">{data.failedIntegrations.map((f, i) => <li key={i} className="flex flex-wrap gap-2 text-sm"><Badge tone="red">{f.provider}</Badge><span>{f.org}</span><span className="text-muted">{f.error}</span></li>)}</ul>
              )}
            </Card>
            <Card className="sm:col-span-2 xl:col-span-4"><p className="text-sm text-muted">{ar ? "نقطة فحص الصحة العامة:" : "Public health endpoint:"} <code className="text-electric" dir="ltr">/api/health</code></p></Card>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmOrg} onClose={() => setConfirmOrg(null)} danger={confirmOrg?.status !== "suspended"}
        title={confirmOrg?.status === "suspended" ? (ar ? `تفعيل ${confirmOrg?.name}؟` : `Activate ${confirmOrg?.name}?`) : (ar ? `تعليق ${confirmOrg?.name}؟` : `Suspend ${confirmOrg?.name}?`)}
        body={confirmOrg?.status === "suspended" ? undefined : (ar ? "سيتوقف موظفوهم الأذكياء عن الرد ولن يتمكنوا من الدخول." : "Their AI employees stop answering and members lose access.")}
        onConfirm={async () => {
          if (!confirmOrg) return;
          const status = confirmOrg.status === "suspended" ? "active" : "suspended";
          if (await act({ action: "org.status", orgId: confirmOrg.id, status }, ar ? "تم" : "Done")) setOrgs(orgs.map((o) => o.id === confirmOrg.id ? { ...o, status } : o));
        }}
      />
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-line text-xs text-muted"><tr>{head.map((h, i) => <th key={i} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </Card>
  );
}

function Coupons({ coupons, act }: { coupons: AdminData["coupons"]; act: (b: Record<string, unknown>, s: string) => Promise<boolean> }) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const [list, setList] = useState(coupons);
  const [form, setForm] = useState({ code: "", kind: "percent", value: 10, max: 100, expires: "" });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Table head={[ar ? "الكود" : "Code", ar ? "الخصم" : "Discount", ar ? "الاستخدام" : "Redeemed", ar ? "ينتهي" : "Expires", ar ? "الحالة" : "Status"]}>
        {list.map((c) => (
          <tr key={c.code}>
            <td className="px-4 py-3 font-mono">{c.code}</td><td className="px-4 py-3">{c.off}</td><td className="px-4 py-3">{c.redeemed}{c.max ? ` / ${c.max}` : ""}</td><td className="px-4 py-3 text-muted">{c.expires}</td>
            <td className="px-4 py-3"><button onClick={async () => { if (await act({ action: "coupon.toggle", code: c.code, is_active: !c.active }, "OK")) setList(list.map((x) => x.code === c.code ? { ...x, active: !x.active } : x)); }}><Badge tone={c.active ? "green" : "gray"}>{c.active ? "active" : "inactive"}</Badge></button></td>
          </tr>
        ))}
      </Table>
      <Card>
        <h3 className="mb-4 font-semibold">{ar ? "كوبون جديد" : "New coupon"}</h3>
        <div className="space-y-3">
          <input placeholder="CODE" dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="input font-mono" />
          <div className="flex gap-2">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="input"><option value="percent">%</option><option value="amount">KWD</option></select>
            <input type="number" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} className="input" />
          </div>
          <input type="number" min={1} value={form.max} onChange={(e) => setForm({ ...form, max: Number(e.target.value) })} className="input" aria-label="Max redemptions" />
          <input type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} className="input" />
          <Button className="w-full" disabled={form.code.length < 3} onClick={async () => {
            const ok = await act({ action: "coupon.create", code: form.code, [form.kind === "percent" ? "percent_off" : "amount_off"]: form.value, max_redemptions: form.max, expires_at: form.expires ? new Date(form.expires).toISOString() : undefined }, ar ? "تم إنشاء الكوبون" : "Coupon created");
            if (ok) setList([...list, { code: form.code, off: form.kind === "percent" ? `${form.value}%` : `${form.value} KWD`, redeemed: 0, max: form.max, expires: form.expires || "—", active: true }]);
          }}>{ar ? "إنشاء" : "Create"}</Button>
        </div>
      </Card>
    </div>
  );
}
