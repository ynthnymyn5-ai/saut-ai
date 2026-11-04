"use client";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BedDouble, BookOpen, Building2, CalendarCheck, Check, ChevronDown, FileText, Headphones,
  MessageCircle, PhoneCall, PhoneForwarded, Play, Scissors, ShoppingBag, Sparkles, Stethoscope, UtensilsCrossed, Menu, X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { CONTACT_EMAIL } from "@/lib/contact";
import { SoMascot } from "@/components/brand/SoMascot";
import { SoScene } from "@/components/brand/SoScene";
import { Soundwave } from "@/components/brand/Soundwave";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Badge, ButtonLink } from "@/components/ui/primitives";
import { ConversationPanel } from "@/components/voice/ConversationPanel";
import { useI18n } from "@/lib/i18n/client";
import { PLANS, type Interval } from "@/lib/plans";
import { cn, formatMoney } from "@/lib/utils";

const EASE: [number, number, number, number] = [0.2, 0.7, 0.2, 1];
const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.6, ease: EASE } };

function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return <section id={id} className={cn("relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28", className)}>{children}</section>;
}
function Heading({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <motion.div {...fade} className="mx-auto mb-12 max-w-2xl text-center">
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{children}</h2>
      {sub && <p className="mt-3 text-muted">{sub}</p>}
    </motion.div>
  );
}

export function Landing() {
  const { t, locale } = useI18n();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const [detail, setDetail] = useState<{ t: string; d: string; more: string; n?: string; icon?: number } | null>(null);
  const DetailIcon = detail?.icon !== undefined ? [PhoneCall, CalendarCheck, MessageCircle, BookOpen, PhoneForwarded, FileText][detail.icon] : null;
  return (
    <div className="relative overflow-x-hidden">
      <Nav />
      {/* HERO */}
      <div className="relative">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-40 start-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-violet/20 blur-[120px] rtl:translate-x-1/2" />
        <Section className="grid items-center gap-12 pt-28 sm:pt-36 lg:grid-cols-[1.1fr_.9fr]">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <Badge tone="violet" className="mb-6 px-3 py-1 text-xs"><Sparkles className="h-3.5 w-3.5" /> {t.hero.eyebrow}</Badge>
            <h1 className="font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              {locale === "ar" ? <>موظفك الذكي <span className="text-gradient">الذي لا يتوقف</span> عن العمل.</> : <>Meet Your New <span className="text-gradient">AI Employee.</span></>}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{t.hero.subtitle}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">{t.hero.cta}<Arrow className="h-4 w-4" /></ButtonLink>
              <a href="#demo" className="inline-flex items-center gap-2 rounded-xl border border-line px-6 py-3.5 text-base font-semibold transition hover:border-violet/50 hover:bg-white/5">
                <Play className="h-4 w-4 fill-current" />{t.hero.demo}
              </a>
            </div>
            <p className="mt-5 text-xs text-muted">{t.hero.note}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }} className="relative mx-auto">
            <SoScene state="speaking" size={300} className="max-sm:hidden" /><SoMascot state="speaking" size={240} className="sm:hidden" />
            <div className="glass absolute -bottom-2 start-0 flex items-center gap-3 px-4 py-3 sm:-start-8">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
              <div><p className="text-xs font-semibold">{locale === "ar" ? "مكالمة مباشرة" : "Live call"}</p><p className="text-[11px] text-muted">+965 •••• 0101 · 01:42</p></div>
              <Soundwave bars={12} className="h-6" />
            </div>
            <div className="glass absolute -top-2 end-0 px-4 py-3 sm:-end-6">
              <p className="flex items-center gap-1.5 text-xs font-semibold"><CalendarCheck className="h-3.5 w-3.5 text-electric" />{locale === "ar" ? "تم حجز موعد" : "Appointment booked"}</p>
              <p className="text-[11px] text-muted">{locale === "ar" ? "الجمعة ٨:٣٠ م · ٤ أشخاص" : "Fri 8:30 PM · party of 4"}</p>
            </div>
          </motion.div>
        </Section>
      </div>

      {/* TRUSTED */}
      <div className="border-y border-line bg-white/[0.015] py-8">
        <p className="mb-5 text-center text-xs uppercase tracking-[0.2em] text-muted">{t.trusted}</p>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 text-white/40">
          {["LAYALI", "Al Noor Clinic", "MARINA HOMES", "GLOW", "Souq.kw", "Dar Hotel"].map((n) => (
            <span key={n} className="font-display text-lg font-semibold tracking-wide">{n}</span>
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] text-muted/60">{locale === "ar" ? "أسماء توضيحية لأغراض العرض" : "Illustrative names for presentation"}</p>
      </div>

      {/* DEMO */}
      <Section id="demo" className="grid items-center gap-10 lg:grid-cols-2">
        <motion.div {...fade}>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{t.demo.title}</h2>
          <p className="mt-3 text-muted">{t.demo.subtitle}</p>
          <ul className="mt-8 space-y-4">
            {(["listening", "thinking", "speaking", "completed", "transfer"] as const).map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-xs text-muted">{i + 1}</span>{t.demo.states[s]}
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div {...fade}><ConversationPanel mode="simulated" /></motion.div>
      </Section>

      {/* HOW */}
      <Section id="how">
        <Heading>{t.how.title}</Heading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.how.steps.map((s, i) => (
            <motion.button type="button" key={i} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }} onClick={() => setDetail({ t: s.t, d: s.d, more: s.more, n: `0${i + 1}` })}
              className="glass relative p-6 text-start transition hover:-translate-y-1 hover:border-violet/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet">
              <span className="font-display text-5xl font-semibold text-white/[0.06]">0{i + 1}</span>
              <h3 className="mt-2 font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              <span className="mt-3 inline-block text-xs text-violet-soft">{locale === "ar" ? "اعرف أكثر ←" : "Learn more →"}</span>
            </motion.button>
          ))}
        </div>
      </Section>

      {/* FEATURES */}
      <Section id="features">
        <Heading>{t.features.title}</Heading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.items.map((f, i) => {
            const I = [PhoneCall, CalendarCheck, MessageCircle, BookOpen, PhoneForwarded, FileText][i];
            return (
              <motion.button type="button" key={i} {...fade} onClick={() => setDetail({ t: f.t, d: f.d, more: f.more, icon: i })}
                className="glass group p-6 text-start transition hover:-translate-y-1 hover:border-violet/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet">
                <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-violet/15 text-violet-soft transition group-hover:shadow-glow"><I className="h-5 w-5" /></div>
                <h3 className="font-semibold">{f.t}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.d}</p>
                <span className="mt-3 inline-block text-xs text-violet-soft">{locale === "ar" ? "اعرف أكثر ←" : "Learn more →"}</span>
              </motion.button>
            );
          })}
        </div>
      </Section>

      {/* SHOWCASE */}
      <Section>
        <Heading sub={t.showcase.hint}>{t.showcase.title}</Heading>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { n: locale === "ar" ? "نورة" : "Noura", r: t.industries.list.restaurant, d: locale === "ar" ? "لهجة كويتية" : "Kuwaiti dialect", h: 265 },
            { n: locale === "ar" ? "فهد" : "Fahad", r: t.industries.list.customer_support, d: locale === "ar" ? "لهجة سعودية" : "Saudi dialect", h: 200 },
            { n: locale === "ar" ? "ميرا" : "Mira", r: t.industries.list.clinic, d: "English · العربية", h: 310 },
          ].map((e, i) => (
            <motion.div key={i} {...fade} className="glass flex flex-col items-center p-8 text-center">
              <SoMascot size={140} hue={e.h} state={i === 1 ? "listening" : "idle"} />
              <h3 className="mt-4 font-display text-xl font-semibold">{e.n}</h3>
              <p className="text-sm text-muted">{e.r}</p>
              <Badge tone="blue" className="mt-3">{e.d}</Badge>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* INDUSTRIES */}
      <Section id="industries">
        <Heading>{t.industries.title}</Heading>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(t.industries.list) as (keyof typeof t.industries.list)[]).filter((k) => k !== "other").map((k) => {
            const I = { restaurant: UtensilsCrossed, clinic: Stethoscope, real_estate: Building2, online_store: ShoppingBag, beauty_salon: Scissors, hotel: BedDouble, customer_support: Headphones }[k as Exclude<typeof k, "other">];
            return (
              <motion.div key={k} {...fade} className="glass flex items-center gap-3 p-4 transition hover:border-electric/40">
                <I className="h-5 w-5 text-electric" /><span className="text-sm font-medium">{t.industries.list[k]}</span>
              </motion.div>
            );
          })}
        </div>
      </Section>

      <Pricing />
      <Testimonials />
      <Faq />

      {/* FINAL CTA */}
      <Section>
        <motion.div {...fade} className="glass glow-border relative overflow-hidden px-6 py-16 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,.25),transparent_60%)]" />
          <div className="relative">
            <SoMascot size={110} state="completed" className="mx-auto" />
            <h2 className="mt-6 font-display text-3xl font-semibold sm:text-4xl">{t.finalCta.title}</h2>
            <p className="mt-3 text-muted">{t.finalCta.subtitle}</p>
            <ButtonLink href="/signup" size="lg" className="mt-8">{t.hero.cta}<Arrow className="h-4 w-4" /></ButtonLink>
          </div>
        </motion.div>
      </Section>

      <Footer />
      <AnimatePresence>
        {detail && (
          <motion.div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDetail(null)} role="dialog" aria-modal="true" aria-labelledby="feature-title">
            <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="glass m-0 w-full max-w-md rounded-b-none p-6 sm:m-4 sm:rounded-2xl">
              <div className="flex items-start justify-between gap-3">
                {DetailIcon ? <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet/15 text-violet-soft"><DetailIcon className="h-5 w-5" /></div>
                  : <span className="font-display text-4xl font-semibold text-white/20">{detail.n}</span>}
                <button type="button" onClick={() => setDetail(null)} aria-label={locale === "ar" ? "إغلاق" : "Close"} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <h3 id="feature-title" className="mt-3 text-lg font-semibold">{detail.t}</h3>
              <p className="mt-2 text-sm text-muted">{detail.d}</p>
              <p className="mt-3 text-sm leading-relaxed">{detail.more}</p>
              <ButtonLink href="/signup" className="mt-5 w-full justify-center">{t.hero.cta}<Arrow className="h-4 w-4" /></ButtonLink>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Nav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const links = [["#features", t.nav.features], ["#how", t.nav.how], ["#industries", t.nav.industries], ["#pricing", t.nav.pricing], ["#faq", t.nav.faq]];
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-ink/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="SAUT AI home"><Logo size={30} /></Link>
        <nav className="hidden items-center gap-7 text-sm text-white/70 md:flex">
          {links.map(([h, l]) => <a key={h} href={h} className="transition hover:text-white">{l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="max-sm:hidden" />
          <Link href="/login" className="hidden px-3 text-sm text-white/80 hover:text-white sm:block">{t.nav.login}</Link>
          <ButtonLink href="/signup" size="sm" className="max-sm:hidden">{t.nav.start}</ButtonLink>
          <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-t border-line md:hidden">
            <div className="flex flex-col gap-1 p-4">
              {links.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm hover:bg-white/5">{l}</a>)}
              <div className="mt-2 flex gap-2"><LanguageSwitcher /><ButtonLink href="/login" variant="outline" size="sm">{t.nav.login}</ButtonLink><ButtonLink href="/signup" size="sm">{t.nav.start}</ButtonLink></div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

export function PricingCards({ ctaHref = "/signup", onChoose, current }: { ctaHref?: string; onChoose?: (code: string, i: Interval) => void; current?: string }) {
  const { t, locale } = useI18n();
  const [interval, setInterval] = useState<Interval>("monthly");
  return (
    <>
      <div className="mb-10 flex justify-center">
        <div className="glass inline-flex p-1">
          {(["monthly", "annual"] as const).map((i) => (
            <button key={i} onClick={() => setInterval(i)} className={cn("relative rounded-xl px-5 py-2 text-sm font-semibold transition", interval === i ? "text-white" : "text-muted")}>
              {interval === i && <motion.span layoutId="intv" className="absolute inset-0 rounded-xl bg-violet shadow-glow" />}
              <span className="relative">{t.pricing[i]}{i === "annual" && <span className="ms-2 text-[10px] text-electric">{t.pricing.save}</span>}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => (
          <motion.div key={p.code} {...fade} className={cn("glass relative flex flex-col p-7", p.highlighted && "glow-border bg-violet/[0.06] lg:-translate-y-3")}>
            {p.highlighted && <Badge tone="violet" className="absolute -top-3 start-7 bg-ink-2">{t.pricing.popular}</Badge>}
            <h3 className="font-display text-lg font-semibold">{p.name[locale]}</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display text-4xl font-semibold">{formatMoney(interval === "monthly" ? p.monthly : p.annual, "KWD", locale)}</span>
              <span className="text-sm text-muted">{interval === "monthly" ? t.pricing.perMonth : t.pricing.perYear}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm">
              {p.features[locale].map((f) => <li key={f} className="flex gap-2.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-electric" />{f}</li>)}
            </ul>
            {onChoose ? (
              <button onClick={() => onChoose(p.code, interval)} disabled={current === p.code}
                className={cn("mt-8 rounded-xl px-4 py-3 text-sm font-semibold transition", p.highlighted ? "bg-violet shadow-glow hover:bg-violet-soft" : "border border-line hover:border-violet/50", current === p.code && "opacity-50")}>
                {current === p.code ? (locale === "ar" ? "خطتك الحالية" : "Current plan") : (locale === "ar" ? "اختيار" : "Choose")}
              </button>
            ) : (
              <ButtonLink href={`${ctaHref}?plan=${p.code}&interval=${interval}`} variant={p.highlighted ? "primary" : "outline"} className="mt-8 py-3">{t.pricing.choose}</ButtonLink>
            )}
          </motion.div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-muted">{t.pricing.note}</p>
    </>
  );
}

function Pricing() {
  const { t } = useI18n();
  return <Section id="pricing"><Heading>{t.pricing.title}</Heading><PricingCards /></Section>;
}

function Testimonials() {
  const { t, locale } = useI18n();
  const items = locale === "ar"
    ? [{ q: "ما عاد تفوتنا أي مكالمة حجز، حتى وقت الذروة يوم الجمعة.", n: "مدير مطعم", c: "الكويت" }, { q: "المرضى يحبون إنها ترد بلهجتهم وتحجز الموعد خلال دقيقة.", n: "مديرة عيادة", c: "الرياض" }, { q: "وفّرنا ساعات يومياً من الرد على نفس الأسئلة.", n: "صاحب متجر إلكتروني", c: "دبي" }]
    : [{ q: "We haven't missed a single booking call since — even during Friday rush.", n: "Restaurant manager", c: "Kuwait City" }, { q: "Patients love that it answers in their dialect and books in under a minute.", n: "Clinic director", c: "Riyadh" }, { q: "We save hours every day not answering the same questions.", n: "Online store owner", c: "Dubai" }];
  return (
    <Section>
      <Heading>{t.testimonials.title}</Heading>
      <div className="mb-6 flex justify-center"><Badge tone="amber">{t.testimonials.badge}</Badge></div>
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((x, i) => (
          <motion.figure key={i} {...fade} className="glass p-6">
            <blockquote className="leading-relaxed text-white/90">“{x.q}”</blockquote>
            <figcaption className="mt-5 text-sm"><span className="font-semibold">{x.n}</span><span className="text-muted"> · {x.c}</span></figcaption>
          </motion.figure>
        ))}
      </div>
    </Section>
  );
}

function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq" className="max-w-3xl">
      <Heading>{t.faq.title}</Heading>
      <div className="space-y-3">
        {t.faq.items.map((f, i) => (
          <div key={i} className="glass overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 p-5 text-start font-medium" aria-expanded={open === i}>
              {f.q}<ChevronDown className={cn("h-4 w-4 shrink-0 transition", open === i && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{f.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-ink-2/50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted">{t.footer.philosophy}</p>
          <p className="mt-2 text-sm text-gradient font-semibold">{t.brand.tagline}</p>
        </div>
        {[
          [t.footer.product, [[t.nav.features, "#features"], [t.nav.pricing, "#pricing"], [t.nav.faq, "#faq"]]],
          [t.footer.company, [[t.footer.contact, `mailto:${CONTACT_EMAIL}`], [t.nav.login, "/login"]]],
          [t.footer.legal, [[t.footer.privacy, "/privacy"], [t.footer.terms, "/terms"]]],
        ].map(([h, ls]) => (
          <div key={h as string}>
            <p className="mb-3 text-sm font-semibold">{h as string}</p>
            <ul className="space-y-2 text-sm text-muted">
              {(ls as string[][]).map(([l, href]) => <li key={l}><a href={href} className="hover:text-white">{l}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="border-t border-line py-6 text-center text-xs text-muted">© {new Date().getFullYear()} SAUT AI. {t.footer.rights}</p>
    </footer>
  );
}
