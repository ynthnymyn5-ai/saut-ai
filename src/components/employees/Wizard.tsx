"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  BedDouble, Building2, Check, ChevronLeft, ChevronRight, Headphones, Rocket, Scissors, ShoppingBag, Sparkles, Stethoscope, UtensilsCrossed,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { businessExample, fillEmpty } from "@/lib/business-examples";
import { SoMascot, type VoiceState } from "@/components/brand/SoMascot";
import { Badge, Button, ConfirmDialog } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ConversationPanel } from "@/components/voice/ConversationPanel";
import { RealtimeVoice } from "@/components/voice/RealtimeVoice";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { DIALECTS, INDUSTRIES, TASKS, VOICES, type EmployeeInput } from "@/lib/validation";
import { DIALECT_LABELS, TASK_LABELS, TONE_LABELS, VOICE_LABELS } from "./labels";

const INDUSTRY_ICONS = { restaurant: UtensilsCrossed, clinic: Stethoscope, real_estate: Building2, online_store: ShoppingBag, beauty_salon: Scissors, hotel: BedDouble, customer_support: Headphones, other: Sparkles };
const DEFAULT_TASKS: Record<string, EmployeeInput["tasks"]> = {
  restaurant: ["answer_calls", "answer_faq", "restaurant_reservations", "collect_info", "summarize", "escalate"],
  clinic: ["answer_calls", "answer_faq", "book_appointments", "collect_info", "summarize", "escalate"],
  hotel: ["answer_calls", "answer_faq", "book_appointments", "summarize", "escalate"],
};
const HUES = [265, 200, 300, 330, 180, 230];

export function EmployeeWizard({ demo }: { demo: boolean }) {
  const { t, locale } = useI18n();
  const L = <T,>(v: { en: T; ar: T }) => v[locale];
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [hue, setHue] = useState(265);
  const [previewState, setPreviewState] = useState<VoiceState>("idle");
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [e, setE] = useState<EmployeeInput>({
    name: "",
    industry: "restaurant",
    voice: "coral",
    dialect: "kuwaiti",
    personality: { warmth: 75, formality: 40, pace: 50, tone: "friendly" },
    businessInfo: { businessName: "", description: "", address: "", hours: "", faqs: "" },
    tasks: DEFAULT_TASKS.restaurant,
    instructions: "",
    transferNumber: "",
    activate: false,
  });
  const set = <K extends keyof EmployeeInput>(k: K, v: EmployeeInput[K]) => setE((x) => ({ ...x, [k]: v }));

  // Start from what the business already told us (name, industry, address) instead of a blank form.
  useEffect(() => {
    if (demo) return;
    fetch("/api/organization").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const o = d?.organization as { name?: string; industry?: string; address?: string | null } | undefined;
      if (!o) return;
      setE((x) => ({
        ...x,
        industry: (x.businessInfo.businessName ? x.industry : (o.industry as EmployeeInput["industry"]) ?? x.industry),
        tasks: x.businessInfo.businessName ? x.tasks : DEFAULT_TASKS[o.industry ?? ""] ?? x.tasks,
        businessInfo: { ...x.businessInfo, businessName: x.businessInfo.businessName || (o.name ?? ""), address: x.businessInfo.address || (o.address ?? "") },
      }));
    }).catch(() => {});
  }, [demo]);

  const steps = locale === "ar"
    ? ["القطاع", "الاسم", "الصوت واللهجة", "الشخصية", "معلومات النشاط", "المهام", "الاختبار", "التفعيل"]
    : ["Industry", "Name", "Voice & dialect", "Personality", "Business info", "Tasks", "Test", "Activate"];

  const canNext = useMemo(() => {
    if (step === 1) return e.name.trim().length > 0;
    if (step === 4) return e.businessInfo.businessName.trim().length >= 2;
    if (step === 5) return e.tasks.length > 0;
    return true;
  }, [step, e]);

  async function save(activate: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...e, activate }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed");
      if (data.demo) toast({ kind: "info", title: locale === "ar" ? "وضع العرض التجريبي" : "Demo mode", body: locale === "ar" ? "لم يتم الحفظ — أضف مفاتيح Supabase للحفظ الفعلي." : "Not saved — connect Supabase to persist employees." });
      else toast({ kind: "success", title: activate ? (locale === "ar" ? `تم تفعيل ${e.name}` : `${e.name} is active`) : (locale === "ar" ? "تم حفظ المسودة" : "Draft saved") });
      router.push("/dashboard/employees");
      router.refresh();
    } catch (err) {
      toast({ kind: "error", title: locale === "ar" ? "تعذّر الحفظ" : "Couldn't save", body: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  const Prev = locale === "ar" ? ChevronRight : ChevronLeft;
  const Next = locale === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        {/* progress */}
        <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
          {steps.map((s, i) => (
            <button key={s} onClick={() => i < step && setStep(i)} className={cn("flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition", i === step ? "border-violet/60 bg-violet/15 text-white" : i < step ? "border-line text-white/80 hover:border-violet/40" : "border-line text-muted")}>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px]", i < step ? "bg-emerald-400/20 text-emerald-300" : i === step ? "bg-violet text-white" : "bg-white/5")}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
              {s}
            </button>
          ))}
        </div>

        <div className="glass min-h-[440px] p-6">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: locale === "ar" ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: locale === "ar" ? 20 : -20 }} transition={{ duration: 0.25 }}>
              <h2 className="mb-5 font-display text-xl font-semibold">{steps[step]}</h2>

              {step === 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {INDUSTRIES.map((k) => {
                    const I = INDUSTRY_ICONS[k];
                    return (
                      <button key={k} onClick={() => setE((x) => ({ ...x, industry: k, tasks: DEFAULT_TASKS[k] ?? ["answer_calls", "answer_faq", "collect_info", "summarize", "escalate"] }))}
                        className={cn("flex flex-col items-center gap-2 rounded-2xl border p-5 text-sm transition", e.industry === k ? "border-violet bg-violet/15 shadow-glow" : "border-line hover:border-violet/40")}>
                        <I className="h-6 w-6 text-electric" />{t.industries.list[k]}
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 1 && (
                <div className="max-w-md space-y-5">
                  <div><label className="label" htmlFor="ename">{locale === "ar" ? "اسم الموظف الذكي" : "AI employee name"}</label>
                    <input id="ename" autoFocus dir="auto" maxLength={60} value={e.name} onChange={(ev) => set("name", ev.target.value)} className="input text-base" placeholder={locale === "ar" ? "مثال: نورة" : "e.g. Noura"} /></div>
                  <div>
                    <p className="label">{locale === "ar" ? "لون الشخصية" : "Mascot colour"}</p>
                    <div className="flex gap-2">{HUES.map((h) => <button key={h} onClick={() => setHue(h)} aria-label={`Hue ${h}`} className={cn("h-9 w-9 rounded-full border-2 transition", hue === h ? "border-white scale-110" : "border-transparent")} style={{ background: `linear-gradient(135deg,hsl(${h} 90% 66%),hsl(${(h + 295) % 360} 92% 60%))` }} />)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">{(locale === "ar" ? ["نورة", "فهد", "سارة", "عبدالله", "ريم"] : ["Noura", "Fahad", "Sara", "Omar", "Reem"]).map((n) => <button key={n} onClick={() => set("name", n)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-violet/50">{n}</button>)}</div>
                </div>
              )}

              {step === 2 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <p className="label">{locale === "ar" ? "اللهجة" : "Dialect"}</p>
                    <div className="space-y-2">{DIALECTS.map((d) => (
                      <button key={d} onClick={() => set("dialect", d)} className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition", e.dialect === d ? "border-violet bg-violet/15" : "border-line hover:border-violet/40")}>
                        {L(DIALECT_LABELS[d])}{e.dialect === d && <Check className="h-4 w-4 text-violet-soft" />}
                      </button>))}
                    </div>
                  </div>
                  <div>
                    <p className="label">{locale === "ar" ? "الصوت" : "Voice"}</p>
                    <div className="space-y-2">{VOICES.map((v) => (
                      <button key={v} onClick={() => set("voice", v)} className={cn("flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition", e.voice === v ? "border-electric bg-electric/10" : "border-line hover:border-electric/40")}>
                        {L(VOICE_LABELS[v])}{e.voice === v && <Check className="h-4 w-4 text-electric" />}
                      </button>))}
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="max-w-lg space-y-6">
                  <div className="flex flex-wrap gap-2">{(Object.keys(TONE_LABELS) as (keyof typeof TONE_LABELS)[]).map((k) => (
                    <button key={k} onClick={() => set("personality", { ...e.personality, tone: k })} className={cn("rounded-full border px-4 py-2 text-sm", e.personality.tone === k ? "border-violet bg-violet/15" : "border-line")}>{L(TONE_LABELS[k])}</button>))}
                  </div>
                  {([["warmth", locale === "ar" ? "الدفء" : "Warmth"], ["formality", locale === "ar" ? "الرسمية" : "Formality"], ["pace", locale === "ar" ? "سرعة الكلام" : "Speaking pace"]] as const).map(([k, l]) => (
                    <div key={k}>
                      <div className="mb-2 flex justify-between text-sm"><span>{l}</span><span className="text-muted">{e.personality[k]}</span></div>
                      <input type="range" min={0} max={100} value={e.personality[k]} onChange={(ev) => set("personality", { ...e.personality, [k]: Number(ev.target.value) } as EmployeeInput["personality"])} className="w-full accent-violet" />
                    </div>
                  ))}
                </div>
              )}

              {step === 4 && (
                <div className="grid gap-4 md:grid-cols-2">
                  {([["businessName", locale === "ar" ? "اسم النشاط *" : "Business name *", false], ["address", locale === "ar" ? "العنوان" : "Address", false], ["hours", locale === "ar" ? "أوقات العمل" : "Opening hours", false], ["description", locale === "ar" ? "وصف النشاط" : "About the business", true], ["faqs", locale === "ar" ? "أسئلة شائعة وإجاباتها" : "FAQs & answers", true]] as const).map(([k, l, area]) => (
                    <div key={k} className={area ? "md:col-span-2" : ""}>
                      <label className="label" htmlFor={k}>{l}</label>
                      {area ? <textarea id={k} dir="auto" rows={k === "faqs" ? 5 : 3} maxLength={k === "faqs" ? 8000 : 2000} value={e.businessInfo[k]} onChange={(ev) => set("businessInfo", { ...e.businessInfo, [k]: ev.target.value } as EmployeeInput["businessInfo"])} className="input" />
                        : <input id={k} dir="auto" maxLength={300} value={e.businessInfo[k]} onChange={(ev) => set("businessInfo", { ...e.businessInfo, [k]: ev.target.value } as EmployeeInput["businessInfo"])} className="input" />}
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-violet/40 bg-violet/[0.05] p-3 md:col-span-2">
                    <p className="min-w-[200px] flex-1 text-xs text-muted">{locale === "ar" ? "ما تعرف شنو تكتب؟ نعبّي لك مثالاً جاهزاً لقطاعك، وعدّل كل ما بين [الأقواس] بمعلوماتك الحقيقية." : "Not sure what to write? Fill a ready example for your industry, then replace everything in [brackets] with your real details."}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => set("businessInfo", fillEmpty(e.businessInfo, businessExample(e.industry, locale)))}><Sparkles className="h-4 w-4" />{locale === "ar" ? "املأ مثالاً" : "Fill example"}</Button>
                  </div>
                  {[e.businessInfo.description, e.businessInfo.hours, e.businessInfo.faqs].some((v) => /\[[^\]]+\]/.test(v)) && (
                    <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100 md:col-span-2">{locale === "ar" ? "⚠️ ما زالت هناك [أقواس] لم تُستبدل. الموظف سيقرأها للعملاء كما هي، فاستبدلها بمعلوماتك قبل التفعيل." : "⚠️ Some [brackets] are still there. The employee would read them to customers as-is — replace them before activating."}</p>
                  )}
                  <p className="text-xs text-muted md:col-span-2">{locale === "ar" ? "يمكنك رفع ملفات إضافية لاحقاً من قاعدة المعرفة." : "You can upload menus, price lists and documents later in Knowledge Base."}</p>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-5">
                  <div className="grid gap-2 sm:grid-cols-2">{TASKS.map((k) => {
                    const on = e.tasks.includes(k);
                    return (
                      <button key={k} onClick={() => set("tasks", on ? e.tasks.filter((x) => x !== k) : [...e.tasks, k])} className={cn("flex items-center gap-3 rounded-xl border px-4 py-3 text-start text-sm transition", on ? "border-violet bg-violet/10" : "border-line hover:border-violet/40")}>
                        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-violet bg-violet" : "border-white/30")}>{on && <Check className="h-3 w-3" />}</span>{L(TASK_LABELS[k])}
                      </button>);
                  })}</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div><label className="label" htmlFor="transfer">{locale === "ar" ? "رقم التحويل للموظف البشري" : "Human transfer number"}</label><input id="transfer" dir="ltr" value={e.transferNumber} onChange={(ev) => set("transferNumber", ev.target.value)} className="input" placeholder="+965 ..." /></div>
                    <div className="md:col-span-2"><label className="label" htmlFor="instr">{locale === "ar" ? "تعليمات مخصصة" : "Custom instructions"}</label><textarea id="instr" dir="auto" rows={3} maxLength={20000} value={e.instructions} onChange={(ev) => set("instructions", ev.target.value)} className="input" placeholder={locale === "ar" ? "مثال: لا تؤكد حجوزات أكثر من ١٠ أشخاص، حوّلها للمدير." : "e.g. Never confirm parties over 10 — transfer to the manager."} /></div>
                  </div>
                </div>
              )}

              {step === 6 && (
                <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
                  <ConversationPanel mode="live" employee={e} compact hue={hue} onStateChange={setPreviewState} />
                  <RealtimeVoice employee={e} hue={hue} />
                </div>
              )}

              {step === 7 && (
                <div className="flex flex-col items-center py-6 text-center">
                  <SoMascot size={160} hue={hue} state="completed" />
                  <h3 className="mt-6 font-display text-2xl font-semibold">{locale === "ar" ? `${e.name} جاهز للعمل` : `${e.name} is ready to work`}</h3>
                  <p className="mt-2 max-w-md text-sm text-muted">{locale === "ar" ? "عند التفعيل سيبدأ بالرد على القنوات المربوطة فقط. اربط رقم هاتف أو واتساب من صفحة التكاملات." : "Once activated it answers only on connected channels. Connect a phone number or WhatsApp in Integrations."}</p>
                  {[e.businessInfo.description, e.businessInfo.hours, e.businessInfo.faqs].some((v) => /\[[^\]]+\]/.test(v)) && (
                    <button type="button" onClick={() => setStep(4)} className="mt-4 max-w-md rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">{locale === "ar" ? "⚠️ معلومات النشاط فيها [أقواس] من المثال. اضغط هنا لاستبدالها قبل التفعيل." : "⚠️ Business info still has example [brackets]. Tap to replace them before activating."}</button>
                  )}
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Button variant="outline" disabled={saving} onClick={() => save(false)}>{locale === "ar" ? "حفظ كمسودة" : "Save as draft"}</Button>
                    <Button size="lg" disabled={saving} onClick={() => setConfirm(true)}><Rocket className="h-4 w-4" />{locale === "ar" ? "تفعيل الموظف" : "Activate employee"}</Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><Prev className="h-4 w-4" />{t.common.back}</Button>
          {step < 7 && <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{t.common.next}<Next className="h-4 w-4" /></Button>}
        </div>
      </div>

      {/* live preview */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="glass glow-border flex flex-col items-center overflow-hidden p-6 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,.22),transparent_65%)]" />
          <SoMascot size={170} hue={hue} state={step === 6 ? previewState : step === 2 ? "speaking" : "idle"} />
          <p className="mt-4 font-display text-xl font-semibold">{e.name || (locale === "ar" ? "موظفك الذكي" : "Your AI employee")}</p>
          <p className="text-sm text-muted">{e.businessInfo.businessName || t.industries.list[e.industry]}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            <Badge tone="violet">{L(DIALECT_LABELS[e.dialect])}</Badge>
            <Badge tone="blue">{e.voice}</Badge>
            <Badge>{L(TONE_LABELS[e.personality.tone])}</Badge>
          </div>
          <p className="mt-4 text-xs text-muted">{e.tasks.length} {locale === "ar" ? "مهام مفعّلة" : "tasks enabled"}</p>
          {demo && <Badge tone="amber" className="mt-3">{t.dash.demoBadge}</Badge>}
        </div>
      </aside>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => save(true)}
        title={locale === "ar" ? `تفعيل ${e.name}؟` : `Activate ${e.name}?`}
        body={locale === "ar" ? "سيبدأ الموظف بالرد على العملاء في القنوات المربوطة، ويُحتسب ضمن حد خطتك." : "It will start answering customers on connected channels and counts toward your plan limit."}
        confirmLabel={locale === "ar" ? "تفعيل" : "Activate"}
      />
    </div>
  );
}
