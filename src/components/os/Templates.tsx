"use client";
import { Check, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SoMascot } from "@/components/brand/SoMascot";
import { Badge, Button, Card, PageHeader } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { INDUSTRY_TEMPLATES, ROLE_TEMPLATES, WORKFLOW_TEMPLATES } from "@/lib/so/templates";
import { useMutate, useTr } from "./shared";

const HUE: Record<string, number> = { receptionist: 265, sales: 200, support: 310, manager: 230, booking: 180 };

export function Templates({ canCreate, demo }: { canCreate: boolean; demo: boolean }) {
  const tr = useTr();
  const { locale } = useI18n();
  const router = useRouter();
  const mutate = useMutate();
  const [ind, setInd] = useState("restaurant");
  const [role, setRole] = useState<keyof typeof ROLE_TEMPLATES>("receptionist");
  const [name, setName] = useState("");
  const [biz, setBiz] = useState("");
  const [dialect, setDialect] = useState("kuwaiti");
  const [wf, setWf] = useState(true);
  const t = INDUSTRY_TEMPLATES[ind];
  const r = ROLE_TEMPLATES[role];

  return (
    <>
      <PageHeader title={tr("AI employee templates", "قوالب الموظفين الأذكياء")} subtitle={tr("Ready-made for Kuwait businesses. Every setting stays editable.", "جاهزة لأعمال الكويت. كل الإعدادات قابلة للتعديل.")} demo={demo} />
      <h2 className="mb-3 text-sm font-semibold text-muted">1 · {tr("Industry", "القطاع")}</h2>
      <div className="flex flex-wrap gap-2">
        {Object.values(INDUSTRY_TEMPLATES).map((x) => (
          <button key={x.key} onClick={() => { setInd(x.key); if (!x.roles.includes(role as never)) setRole(x.roles[0]); }} className={cn("rounded-full border px-3.5 py-1.5 text-sm", ind === x.key ? "border-violet bg-violet/15" : "border-line text-white/80 hover:border-violet/40")}>
            {x.name[locale]}{x.safetyProfile === "medical" && <ShieldCheck className="ms-1 inline h-3.5 w-3.5 text-emerald-300" />}
          </button>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">2 · {tr("Role", "الدور")}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Object.values(ROLE_TEMPLATES).map((x) => (
          <button key={x.role} onClick={() => setRole(x.role)} className={cn("glass flex flex-col items-center p-4 text-center transition", role === x.role ? "border-violet bg-violet/[0.08]" : "hover:border-violet/30")}>
            <SoMascot size={64} hue={HUE[x.role]} state={role === x.role ? "listening" : "idle"} />
            <p className="mt-2 font-semibold">{x.name[locale]}</p>
            <p className="mt-1 text-xs text-muted">{x.summary[locale]}</p>
            {t.roles.includes(x.role as never) && <Badge tone="blue" className="mt-2">{tr("Recommended", "مقترح")}</Badge>}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <h2 className="font-semibold">{r.name[locale]} · {t.name[locale]}</h2>
          <ul className="mt-3 space-y-1.5 text-sm">{r.duties.map((d) => <li key={d.en} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-electric" />{d[locale]}</li>)}</ul>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div><p className="label">{tr("Personality", "الشخصية")}</p><p className="text-sm">{t.personality.tone} · {tr("warmth", "الدفء")} {t.personality.warmth} · {tr("formality", "الرسمية")} {t.personality.formality}</p></div>
            <div><p className="label">{tr("Suggested integrations", "التكاملات المقترحة")}</p><div className="flex flex-wrap gap-1">{t.integrations.map((i) => <Badge key={i}>{i}</Badge>)}</div></div>
            <div><p className="label">{tr("Tools", "الأدوات")}</p><div className="flex flex-wrap gap-1">{r.tools.map((i) => <Badge key={i} tone="violet">{i.replace(/_/g, " ")}</Badge>)}</div></div>
            <div><p className="label">{tr("Workflows (created switched off)", "الأتمتة (تُنشأ معطّلة)")}</p><ul className="text-sm">{t.workflows.map((w) => <li key={w}>· {WORKFLOW_TEMPLATES[w]?.name[locale] ?? w}</li>)}</ul></div>
          </div>
          <p className="label mt-5">{tr("Suggested instructions", "التعليمات المقترحة")}</p>
          <p className="rounded-xl bg-white/[0.03] p-3 text-sm text-white/85" dir="ltr">{t.instructions} {r.instructions}</p>
          <p className="label mt-4">{tr("FAQ starters (fill in your answers after creating)", "أسئلة شائعة مبدئية (أكمل إجاباتك بعد الإنشاء)")}</p>
          <ul className="text-sm text-muted" dir="ltr">{t.faqs.map((f) => <li key={f.q}>· {f.q}</li>)}</ul>
          {t.safetyProfile === "medical" && <p className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-3 text-sm text-emerald-100"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{tr("Medical safety on: the AI never diagnoses or prescribes, sends clinical questions to your staff, and tells callers to dial 112 in emergencies.", "الأمان الطبي مفعّل: لا يشخّص الذكاء الاصطناعي ولا يصف علاجاً، ويحوّل الأسئلة الطبية لطاقمك، ويطلب من المتصل الاتصال بـ 112 في الطوارئ.")}</p>}
          {t.safetyProfile === "financial" && <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm text-amber-100">{tr("No financial, legal or tax advice: those questions go to your staff.", "لا استشارات مالية أو قانونية أو ضريبية: تُحوّل هذه الأسئلة لطاقمك.")}</p>}
        </Card>
        <Card>
          <form onSubmit={async (e) => {
            e.preventDefault();
            const res = await mutate("/api/employees/from-template", "POST", { industry: ind, role, name, businessName: biz, dialect, installWorkflows: wf, locale }, tr("AI employee created as a draft", "تم إنشاء الموظف كمسودة"));
            if (res?.id) router.push(`/dashboard/employees/${res.id}`);
          }} className="space-y-3">
            <h2 className="font-semibold">{tr("Create from this template", "أنشئ من هذا القالب")}</h2>
            <div><label className="label" htmlFor="t-name">{tr("Employee name", "اسم الموظف")}</label><input id="t-name" required dir="auto" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={locale === "ar" ? "نورة" : "Noura"} /></div>
            <div><label className="label" htmlFor="t-biz">{tr("Business name", "اسم النشاط")}</label><input id="t-biz" required minLength={2} dir="auto" className="input" value={biz} onChange={(e) => setBiz(e.target.value)} /></div>
            <div><label className="label" htmlFor="t-dialect">{tr("Dialect", "اللهجة")}</label>
              <select id="t-dialect" className="input" value={dialect} onChange={(e) => setDialect(e.target.value)}>{[["kuwaiti", "Kuwaiti", "كويتية"], ["saudi", "Saudi", "سعودية"], ["emirati", "Emirati", "إماراتية"], ["msa", "MSA", "فصحى"], ["english", "English", "إنجليزية"]].map(([v, en, ar]) => <option key={v} value={v}>{locale === "ar" ? ar : en}</option>)}</select></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-violet" checked={wf} onChange={(e) => setWf(e.target.checked)} />{tr("Also add the suggested workflows (off)", "أضف الأتمتة المقترحة أيضاً (معطّلة)")}</label>
            <Button type="submit" className="w-full" disabled={!canCreate}>{tr("Create AI employee", "إنشاء الموظف الذكي")}</Button>
            {!canCreate && <p className="text-xs text-muted">{tr("Owners and admins can create employees.", "المالك والمدير فقط يمكنهم الإنشاء.")}</p>}
          </form>
        </Card>
      </div>
    </>
  );
}
