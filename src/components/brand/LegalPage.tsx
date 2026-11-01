import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export type LegalSection = { en: [string, string]; ar: [string, string] };

/** Bilingual legal page: English (LTR) and Arabic (RTL) side by side on wide screens, stacked on phones. */
export function LegalPage({ titleEn, titleAr, updated, sections }: { titleEn: string; titleAr: string; updated: string; sections: LegalSection[] }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-10 font-display text-3xl font-semibold">{titleEn} · <span dir="rtl">{titleAr}</span></h1>
      <p className="mt-2 text-xs text-muted">Last updated {updated}</p>
      <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200">
        This document describes how the product actually works today. It has not yet been reviewed by a lawyer and is not legal advice; SAUT AI holds no privacy or security certifications.
        <span dir="rtl" className="mt-1 block">يصف هذا المستند طريقة عمل المنتج فعلياً اليوم، ولم تتم مراجعته بعد من محامٍ وليس استشارة قانونية؛ ولا تملك SAUT AI أي شهادات خصوصية أو أمان.</span>
      </p>
      <div className="mt-8 space-y-6">
        {sections.map((s, i) => (
          <section key={i} className="grid gap-4 border-t border-line pt-5 md:grid-cols-2">
            <div className="text-sm leading-relaxed text-muted"><h2 className="mb-1 font-semibold text-white">{s.en[0]}</h2><p className="whitespace-pre-line">{s.en[1]}</p></div>
            <div dir="rtl" lang="ar" className="text-sm leading-relaxed text-muted"><h2 className="mb-1 font-semibold text-white">{s.ar[0]}</h2><p className="whitespace-pre-line">{s.ar[1]}</p></div>
          </section>
        ))}
      </div>
    </main>
  );
}
