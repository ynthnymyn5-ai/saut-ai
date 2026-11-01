import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export const metadata = { title: "Privacy" };

/** Template only — have counsel review against Kuwait, KSA (PDPL) and UAE (PDPL) requirements before launch. */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-10 font-display text-3xl font-semibold">Privacy Policy · سياسة الخصوصية</h1>
      <p className="mt-2 text-xs text-amber-200">Draft template — not legal advice. Review with a qualified lawyer before publishing.</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
        <p><b className="text-white">What we process.</b> Account details, business configuration, and — on behalf of our business customers — caller phone numbers, conversation transcripts, appointments and, only where enabled, call recordings.</p>
        <p><b className="text-white">Consent.</b> Call recording is off by default. When a business enables it, callers hear a consent notice before recording begins.</p>
        <p><b className="text-white">Retention.</b> Each business sets a retention period; conversations and recordings are deleted automatically after it.</p>
        <p><b className="text-white">Processors.</b> Hosting and database (Supabase), AI processing (OpenAI), telephony (Twilio), messaging (Meta WhatsApp), payments (Stripe / MyFatoorah). Card data is handled by the payment provider and never stored by SAUT AI.</p>
        <p><b className="text-white">Your rights.</b> Contact privacy@saut.ai to access, correct or delete personal data.</p>
      </div>
    </main>
  );
}
