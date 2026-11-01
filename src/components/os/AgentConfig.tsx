"use client";
import { Lock, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Skeleton } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDate } from "@/lib/utils";
import { HARD_DENY } from "@/lib/so/permissions";
import { ErrorNote, LiveDot, SourceTag, useApi, useMutate, useStatusLabel, useTr } from "./shared";

const PERSONALITY_DEFAULTS = { warmth: 70, formality: 50, pace: 50, tone: "friendly" as const };

type Resp = {
  agent: { id: string; name: string; role: string; branch_id: string | null; status: string; live_status: string; live_detail: string | null; speaking_rate: number; language: string; safety_profile: string; dialect: string; voice: string;
    personality: { warmth: number; formality: number; pace: number; tone: string }; business_info: { businessName?: string; description?: string; address?: string; hours?: string; faqs?: string } };
  instructions: string;
  tools: { key: string; permission: string; description: string; enabled: boolean }[];
  permissions: { permission: string; override: string | null; effective: "allow" | "confirm" | "deny" }[];
  stats: { conversations: number; calls: number; escalations: number; appointments_booked: number; tool_success_rate: number | null; denied_actions: number } | null;
  executions: { id: string; tool_key: string; status: string; error: string | null; started_at: string; duration_ms: number | null; attempts: number; test_mode: boolean }[];
  conversations: { id: string; channel: string; status: string; summary: string | null; started_at: string; intent: string | null }[];
};

const TABS = [["details", "Details", "التفاصيل"], ["profile", "Role & branch", "الدور والفرع"], ["tools", "Tools & permissions", "الأدوات والصلاحيات"], ["instructions", "Instructions", "التعليمات"], ["activity", "Activity log", "سجل النشاط"]] as const;

export function AgentConfig({ id }: { id: string }) {
  const tr = useTr();
  const { locale } = useI18n();
  const label = useStatusLabel();
  const mutate = useMutate();
  const { data, error, loading, reload } = useApi<Resp>(`/api/employees/${id}/activity`);
  const { data: br } = useApi<{ branches: { id: string; name: string; name_ar: string | null }[] }>("/api/branches");
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("details");
  const [det, setDet] = useState({ name: "", dialect: "kuwaiti", voice: "coral", personality: { warmth: 70, formality: 50, pace: 50, tone: "friendly" }, business_info: { businessName: "", description: "", address: "", hours: "", faqs: "" } });
  const [form, setForm] = useState({ role: "receptionist", branch_id: "", speaking_rate: 1, language: "ar" });
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [perms, setPerms] = useState<Record<string, string>>({});
  const [instr, setInstr] = useState("");

  useEffect(() => {
    if (!data) return;
    setForm({ role: data.agent.role, branch_id: data.agent.branch_id ?? "", speaking_rate: Number(data.agent.speaking_rate), language: data.agent.language });
    setTools(Object.fromEntries(data.tools.map((t) => [t.key, t.enabled])));
    setPerms(Object.fromEntries(data.permissions.filter((p) => p.override).map((p) => [p.permission, p.override!])));
    setInstr(data.instructions);
    const bi = data.agent.business_info ?? {};
    setDet({ name: data.agent.name, dialect: data.agent.dialect, voice: data.agent.voice, personality: { ...PERSONALITY_DEFAULTS, ...(data.agent.personality ?? {}) },
      business_info: { businessName: bi.businessName ?? "", description: bi.description ?? "", address: bi.address ?? "", hours: bi.hours ?? "", faqs: bi.faqs ?? "" } });
  }, [data]);

  if (loading) return <Skeleton className="mt-6 h-64" />;
  if (!data) return <ErrorNote error={error} />;
  const s = data.stats;

  return (
    <Card className="mt-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm"><LiveDot status={data.agent.live_status} />{label(data.agent.live_status)}{data.agent.live_detail ? ` · ${data.agent.live_detail}` : ""}</span>
        {data.agent.safety_profile !== "standard" && <Badge tone="green">{data.agent.safety_profile} {tr("safety", "أمان")}</Badge>}
        <div className="ms-auto flex gap-1 overflow-x-auto rounded-xl border border-line p-1">
          {TABS.map(([k, en, ar]) => <button key={k} onClick={() => setTab(k)} className={cn("shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold", tab === k ? "bg-violet text-white" : "text-muted")}>{locale === "ar" ? ar : en}</button>)}
        </div>
      </div>

      {s && (
        <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[[tr("Conversations", "محادثات"), s.conversations], [tr("Calls", "مكالمات"), s.calls], [tr("Bookings", "حجوزات"), s.appointments_booked], [tr("Escalations", "تصعيدات"), s.escalations], [tr("Action success", "نجاح الإجراءات"), s.tool_success_rate === null ? "—" : `${s.tool_success_rate}%`], [tr("Blocked", "محظورة"), s.denied_actions]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-white/[0.03] p-3"><p className="text-[11px] text-muted">{l}</p><p className="font-display text-lg font-semibold tabular-nums">{v}</p></div>
          ))}
          <div className="col-span-3 flex items-center gap-2 sm:col-span-6"><SourceTag kind="measured" /><span className="text-[11px] text-muted">{tr("This month", "هذا الشهر")}</span></div>
        </div>
      )}

      {tab === "details" && (
        <form className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await mutate(`/api/employees/${id}`, "PATCH", { name: det.name, dialect: det.dialect, voice: det.voice, personality: det.personality, ...(det.business_info.businessName.trim().length >= 2 ? { business_info: det.business_info } : {}) }, tr("Saved", "تم الحفظ"))) reload();
        }}>
          <div><label className="label" htmlFor="ad-name">{tr("Name", "الاسم")}</label><input id="ad-name" required maxLength={60} dir="auto" className="input" value={det.name} onChange={(e) => setDet({ ...det, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="ad-dialect">{tr("Dialect", "اللهجة")}</label>
            <select id="ad-dialect" className="input" value={det.dialect} onChange={(e) => setDet({ ...det, dialect: e.target.value })}>{[["kuwaiti", "Kuwaiti", "كويتية"], ["saudi", "Saudi", "سعودية"], ["emirati", "Emirati", "إماراتية"], ["msa", "Modern Standard Arabic", "فصحى"], ["english", "English", "إنجليزية"]].map(([v, en, ar]) => <option key={v} value={v}>{locale === "ar" ? ar : en}</option>)}</select></div>
          <div><label className="label" htmlFor="ad-voice">{tr("Voice", "الصوت")}</label>
            <select id="ad-voice" className="input" value={det.voice} onChange={(e) => setDet({ ...det, voice: e.target.value })}>{["alloy", "ash", "coral", "sage", "verse", "shimmer"].map((v) => <option key={v}>{v}</option>)}</select></div>
          <div><label className="label" htmlFor="ad-tone">{tr("Personality", "الشخصية")}</label>
            <select id="ad-tone" className="input" value={det.personality.tone} onChange={(e) => setDet({ ...det, personality: { ...det.personality, tone: e.target.value } })}>{[["friendly", "Friendly", "ودود"], ["professional", "Professional", "مهني"], ["luxury", "Luxury", "فخم"], ["energetic", "Energetic", "حيوي"]].map(([v, en, ar]) => <option key={v} value={v}>{locale === "ar" ? ar : en}</option>)}</select></div>
          {(["warmth", "formality", "pace"] as const).map((k) => (
            <div key={k}><label className="label" htmlFor={`ad-${k}`}>{({ warmth: tr("Warmth", "الدفء"), formality: tr("Formality", "الرسمية"), pace: tr("Speaking pace", "سرعة الكلام") })[k]} · <span className="tabular-nums">{det.personality[k]}</span></label>
              <input id={`ad-${k}`} type="range" min={0} max={100} className="w-full accent-violet" value={det.personality[k]} onChange={(e) => setDet({ ...det, personality: { ...det.personality, [k]: Number(e.target.value) } })} /></div>
          ))}
          <div className="sm:col-span-2 mt-2 border-t border-line pt-4"><p className="text-sm font-semibold">{tr("Business information", "معلومات النشاط")}</p></div>
          <div><label className="label" htmlFor="ad-biz">{tr("Business name", "اسم النشاط")}</label><input id="ad-biz" dir="auto" maxLength={120} className="input" value={det.business_info.businessName} onChange={(e) => setDet({ ...det, business_info: { ...det.business_info, businessName: e.target.value } })} /></div>
          <div><label className="label" htmlFor="ad-hours">{tr("Opening hours", "أوقات العمل")}</label><input id="ad-hours" dir="auto" maxLength={300} className="input" value={det.business_info.hours} onChange={(e) => setDet({ ...det, business_info: { ...det.business_info, hours: e.target.value } })} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="ad-desc">{tr("About the business", "وصف النشاط")}</label><textarea id="ad-desc" dir="auto" rows={3} maxLength={2000} className="input" value={det.business_info.description} onChange={(e) => setDet({ ...det, business_info: { ...det.business_info, description: e.target.value } })} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="ad-faqs">{tr("FAQs & answers", "أسئلة شائعة وإجاباتها")}</label><textarea id="ad-faqs" dir="auto" rows={4} maxLength={8000} className="input" value={det.business_info.faqs} onChange={(e) => setDet({ ...det, business_info: { ...det.business_info, faqs: e.target.value } })} /></div>
          <div><Button type="submit"><Save className="h-4 w-4" />{tr("Save details", "حفظ التفاصيل")}</Button></div>
        </form>
      )}

      {tab === "profile" && (
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor="ac-role">{tr("Role", "الدور")}</label>
            <select id="ac-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {[["receptionist", "SO Receptionist", "سو الاستقبال"], ["sales", "SO Sales", "سو المبيعات"], ["support", "SO Customer Support", "سو خدمة العملاء"], ["booking", "SO Booking Assistant", "سو الحجوزات"], ["manager", "SO Manager (internal)", "سو المدير (داخلي)"], ["custom", "Custom", "مخصص"]].map(([v, en, ar]) => <option key={v} value={v}>{locale === "ar" ? ar : en}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ac-branch">{tr("Branch", "الفرع")}</label>
            <select id="ac-branch" className="input" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
              <option value="">{tr("All branches", "كل الفروع")}</option>
              {(br?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{locale === "ar" && b.name_ar ? b.name_ar : b.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="ac-lang">{tr("Language", "اللغة")}</label>
            <select id="ac-lang" className="input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}><option value="ar">{tr("Arabic", "العربية")}</option><option value="en">English</option><option value="ar+en">{tr("Arabic + English", "عربي + إنجليزي")}</option></select></div>
          <div><label className="label" htmlFor="ac-rate">{tr("Speaking speed", "سرعة الكلام")} · <span className="tabular-nums">{form.speaking_rate.toFixed(2)}×</span></label>
            <input id="ac-rate" type="range" min={0.7} max={1.3} step={0.05} value={form.speaking_rate} onChange={(e) => setForm({ ...form, speaking_rate: Number(e.target.value) })} className="w-full accent-violet" /></div>
          <div className="sm:col-span-2"><Button onClick={async () => { if (await mutate(`/api/employees/${id}`, "PATCH", { ...form, branch_id: form.branch_id || null }, tr("Saved", "تم الحفظ"))) reload(); }}><Save className="h-4 w-4" />{tr("Save profile", "حفظ الملف")}</Button></div>
        </div>
      )}

      {tab === "tools" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tr("Assigned tools", "الأدوات المسندة")}</h3>
            <ul className="space-y-1.5">{data.tools.map((t) => (
              <li key={t.key}><label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-2.5">
                <input type="checkbox" className="mt-1 accent-violet" checked={!!tools[t.key]} onChange={(e) => setTools({ ...tools, [t.key]: e.target.checked })} />
                <span><span className="text-sm font-medium">{t.key.replace(/_/g, " ")}</span><span className="block text-xs text-muted" dir="ltr">{t.description}</span><Badge className="mt-1">{t.permission}</Badge></span>
              </label></li>
            ))}</ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tr("Permissions", "الصلاحيات")}</h3>
            <p className="mb-3 text-xs text-muted">{tr("Allow runs immediately · Confirm waits for your approval in the Command Center · Deny blocks it. Locked rows can never be allowed for AI.", "سماح = تنفيذ فوري · تأكيد = ينتظر موافقتك في مركز القيادة · منع = محظور. الصفوف المقفلة لا يمكن السماح بها للذكاء الاصطناعي.")}</p>
            <ul className="space-y-1.5">{data.permissions.map((p) => {
              const locked = (HARD_DENY as readonly string[]).includes(p.permission);
              return (
                <li key={p.permission} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="flex-1 font-mono text-xs" dir="ltr">{p.permission}</span>
                  {locked ? <Badge tone="red"><Lock className="h-3 w-3" />{tr("Never", "أبداً")}</Badge> : (
                    <select aria-label={p.permission} className="input w-auto py-1 text-xs" value={perms[p.permission] ?? ""} onChange={(e) => { const n = { ...perms }; if (e.target.value) n[p.permission] = e.target.value; else delete n[p.permission]; setPerms(n); }}>
                      <option value="">{tr(`Role default (${p.effective})`, `افتراضي الدور (${p.effective})`)}</option>
                      <option value="allow">{tr("Allow", "سماح")}</option><option value="confirm">{tr("Confirm", "تأكيد")}</option><option value="deny">{tr("Deny", "منع")}</option>
                    </select>
                  )}
                </li>
              );
            })}</ul>
          </div>
          <div className="lg:col-span-2"><Button onClick={async () => { if (await mutate(`/api/employees/${id}`, "PATCH", { tools: Object.entries(tools).map(([key, enabled]) => ({ key, enabled })), permissions: Object.entries(perms).map(([permission, effect]) => ({ permission, effect })) }, tr("Saved", "تم الحفظ"))) reload(); }}><Save className="h-4 w-4" />{tr("Save tools & permissions", "حفظ الأدوات والصلاحيات")}</Button></div>
        </div>
      )}

      {tab === "instructions" && (
        <div className="max-w-3xl">
          <textarea id="ac-instr" dir="auto" rows={10} maxLength={20000} className="input font-mono text-xs" value={instr} onChange={(e) => setInstr(e.target.value)} />
          <p className="mt-1 text-xs text-muted">{tr("Saving creates a new version; earlier versions are kept.", "الحفظ ينشئ نسخة جديدة؛ النسخ السابقة محفوظة.")}</p>
          <Button className="mt-3" onClick={async () => { if (await mutate(`/api/employees/${id}`, "PATCH", { instructions: instr }, tr("New version saved", "تم حفظ نسخة جديدة"))) reload(); }}><Save className="h-4 w-4" />{tr("Save instructions", "حفظ التعليمات")}</Button>
        </div>
      )}

      {tab === "activity" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tr("Actions", "الإجراءات")}</h3>
            {data.executions.length === 0 ? <p className="text-sm text-muted">{tr("No actions yet.", "لا توجد إجراءات بعد.")}</p> : (
              <ul className="space-y-1.5">{data.executions.map((e) => (
                <li key={e.id} className="flex items-start gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                  <Badge tone={e.status === "succeeded" ? "green" : e.status === "failed" || e.status === "denied" ? "red" : "amber"}>{e.status}</Badge>
                  <span className="min-w-0 flex-1">{e.tool_key.replace(/_/g, " ")}{e.test_mode ? <span className="text-muted"> · test</span> : null}{e.error && <span className="block truncate text-xs text-rose-300">{e.error}</span>}</span>
                  <span className="shrink-0 text-[11px] text-muted tabular-nums">{e.attempts > 1 ? `${e.attempts}× · ` : ""}{formatDate(e.started_at, locale, { dateStyle: "short", timeStyle: "short" })}</span>
                </li>
              ))}</ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tr("Conversation history", "سجل المحادثات")}</h3>
            {data.conversations.length === 0 ? <p className="text-sm text-muted">{tr("No conversations yet.", "لا توجد محادثات بعد.")}</p> : (
              <ul className="space-y-1.5">{data.conversations.map((c) => (
                <li key={c.id} className="rounded-xl border border-line px-3 py-2 text-sm"><div className="flex items-center gap-2"><Badge>{c.channel}</Badge><Badge tone={c.status === "completed" ? "green" : c.status === "transferred" ? "violet" : "blue"}>{c.status}</Badge><span className="ms-auto text-[11px] text-muted">{formatDate(c.started_at, locale, { dateStyle: "short", timeStyle: "short" })}</span></div>{c.summary && <p className="mt-1 text-xs text-muted">{c.summary}</p>}</li>
              ))}</ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
