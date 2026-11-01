import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <Link href="/"><Logo /></Link>
      <h1 className="mt-10 font-display text-3xl font-semibold">Terms of Service · الشروط والأحكام</h1>
      <p className="mt-2 text-xs text-amber-200">Draft template — not legal advice. Review with a qualified lawyer before publishing.</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted">
        <p>Subscriptions renew automatically at the end of each billing period unless cancelled. Cancellation takes effect at the end of the current period.</p>
        <p>Prices are shown in Kuwaiti Dinar (KWD) unless otherwise stated and may be subject to applicable taxes.</p>
        <p>Businesses are responsible for informing their customers that they are speaking with an AI assistant and for obtaining any consent required for recording.</p>
      </div>
    </main>
  );
}
