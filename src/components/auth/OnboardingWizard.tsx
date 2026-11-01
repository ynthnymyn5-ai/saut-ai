"use client";
import { AnimatePresence, motion } from "framer-motion";
import { BedDouble, Building2, Check, Headphones, Scissors, ShoppingBag, Sparkles, Stethoscope, UtensilsCrossed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { SoMascot } from "@/components/brand/SoMascot";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Button } from "@/components/ui/primitives";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const ICONS = { restaurant: UtensilsCrossed, clinic: Stethoscope, real_estate: Building2, online_store: ShoppingBag, beauty_salon: Scissors, hotel: BedDouble, customer_support: Headphones, other: Sparkles } as const;
const COUNTRIES: [string, string, string, string][] = [["KW", "Kuwait", "الكويت", "Asia/Kuwait"], ["SA", "Saudi Arabia", "السعودية", "Asia/Riyadh"], ["AE", "UAE", "الإمارات", "Asia/Dubai"], ["QA", "Qatar", "قطر", "Asia/Qatar"], ["BH", "Bahrain", "البحرين", "Asia/Bahrain"], ["OM", "Oman", "عُمان", "Asia/Muscat"], ["US", "Other", "أخرى", "UTC"]];

/**
 * Onboarding: 1 business → 2 industry → 3 business information → dashboard.
 * Everything is submitted once at the end to the create_organization() RPC.
 */
export function OnboardingWizard({ email }: { email: string }) {
  const { t, locale } = useI18n();
  const ar = locale === "ar";
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", country: "KW", industry: "restaurant", contact_email: email, contact_phone: "", address: "", timezone: "Asia/Kuwait", language: locale });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const steps = ar ? ["نشاطك", "القطاع", "معلومات النشاط"] : ["Your business", "Industry", "Business information"];
  const valid = step === 0 ? f.name.trim().length >= 2 : step === 1 ? !!f.industry : (!f.contact_phone || /^\+?[0-9 ]{6,20}$/.test(f.contact_phone)) && (!f.contact_email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact_email));

  async function finish() {
    setBusy(true); setError(null);
    const r = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j?.error?.message ?? (ar ? "تعذّر إنشاء النشاط" : "Couldn't create your business"));
    router.replace("/dashboard?welcome=1");
    router.refresh();
  }

  return (
    <main className="relative grid min-h-screen lg:grid-cols-[1fr_420px]">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between"><Logo size={30} /><LanguageSwitcher /></div>
        <div className="mx-auto my-auto w-full max-w-xl py-10">
          <ol className="mb-8 flex gap-2" aria-label={ar ? "خطوات الإعداد" : "Setup steps"}>
            {steps.map((s, i) => (
              <li key={s} className={cn("flex flex-1 items-center gap-2 text-xs", i <= step ? "text-white" : "text-muted")}>
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold", i < step ? "bg-emerald-400/20 text-emerald-300" : i === step ? "bg-violet" : "bg-white/5")}>{i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className="truncate">{s}</span>
              </li>
            ))}
          </ol>
          <AnimatePresence mode="wait">
            <motion.form key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}
              onSubmit={(e) => { e.preventDefault(); if (!valid) return; if (step < 2) setStep(step + 1); else finish(); }} className="space-y-5">
              {step === 0 && (
                <>
                  <h1 className="font-display text-3xl font-semibold">{ar ? "لنبدأ بنشاطك التجاري" : "Let's set up your business"}</h1>
                  <div><label className="label" htmlFor="ob-name">{ar ? "اسم النشاط التجاري" : "Business name"}</label><input id="ob-name" autoFocus required minLength={2} maxLength={120} dir="auto" className="input text-base" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={ar ? "مثال: مقهى ليالي" : "e.g. Layali Café"} /></div>
                  <div><label className="label" htmlFor="ob-country">{ar ? "الدولة" : "Country"}</label>
                    <select id="ob-country" className="input" value={f.country} onChange={(e) => { const c = COUNTRIES.find((x) => x[0] === e.target.value)!; setF((x) => ({ ...x, country: c[0], timezone: c[3] })); }}>
                      {COUNTRIES.map(([v, en, a]) => <option key={v} value={v}>{ar ? a : en}</option>)}
                    </select></div>
                </>
              )}
              {step === 1 && (
                <>
                  <h1 className="font-display text-3xl font-semibold">{ar ? "ما هو قطاع نشاطك؟" : "What industry are you in?"}</h1>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup">
                    {(Object.keys(ICONS) as (keyof typeof ICONS)[]).map((k) => {
                      const I = ICONS[k];
                      return (
                        <button key={k} type="button" role="radio" aria-checked={f.industry === k} onClick={() => set("industry", k)}
                          className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 text-sm transition", f.industry === k ? "border-violet bg-violet/15" : "border-line hover:border-violet/40")}>
                          <I className="h-6 w-6 text-electric" />{t.industries.list[k]}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <h1 className="font-display text-3xl font-semibold">{ar ? "معلومات التواصل والتفضيلات" : "Contact details and preferences"}</h1>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><label className="label" htmlFor="ob-email">{ar ? "بريد النشاط" : "Business email"}</label><input id="ob-email" type="email" dir="ltr" className="input" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></div>
                    <div><label className="label" htmlFor="ob-phone">{ar ? "هاتف النشاط" : "Business phone"}</label><input id="ob-phone" dir="ltr" className="input" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} placeholder="+965 ..." /></div>
                    <div className="sm:col-span-2"><label className="label" htmlFor="ob-addr">{ar ? "العنوان (اختياري)" : "Address (optional)"}</label><input id="ob-addr" dir="auto" maxLength={300} className="input" value={f.address} onChange={(e) => set("address", e.target.value)} /></div>
                    <div><label className="label" htmlFor="ob-tz">{ar ? "المنطقة الزمنية" : "Time zone"}</label>
                      <select id="ob-tz" className="input" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>{["Asia/Kuwait", "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "UTC"].map((z) => <option key={z}>{z}</option>)}</select></div>
                    <div><label className="label" htmlFor="ob-lang">{ar ? "لغة النشاط المفضلة" : "Preferred language"}</label>
                      <select id="ob-lang" className="input" value={f.language} onChange={(e) => set("language", e.target.value)}><option value="ar">العربية</option><option value="en">English</option></select></div>
                  </div>
                  <p className="text-xs text-muted">{ar ? "ستبدأ بتجربة مجانية بدون بطاقة. تستطيع تعديل كل هذا لاحقاً من الإعدادات." : "You'll start on a free trial with no card required. You can change all of this later in Settings."}</p>
                </>
              )}
              {error && <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-sm text-rose-200" role="alert">{error}</p>}
              <div className="flex justify-between pt-2">
                <Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>{t.common.back}</Button>
                <Button type="submit" disabled={!valid || busy}>{busy ? t.common.loading : step < 2 ? t.common.next : (ar ? "إنشاء النشاط والدخول" : "Create business & continue")}</Button>
              </div>
            </motion.form>
          </AnimatePresence>
        </div>
      </div>
      <aside className="relative hidden items-center justify-center border-s border-line bg-ink-2 lg:flex">
        <div className="text-center">
          <SoMascot size={220} state={step === 2 ? "completed" : "listening"} />
          <p className="mt-6 max-w-xs text-sm text-muted">{f.name || (ar ? "نشاطك" : "Your business")}</p>
          <p className="text-xs text-muted">{t.industries.list[f.industry as keyof typeof ICONS]}</p>
        </div>
      </aside>
    </main>
  );
}
