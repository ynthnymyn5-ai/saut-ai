import Link from "next/link";
import { SoMascot } from "@/components/brand/SoMascot";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <SoMascot size={160} state="thinking" className="mx-auto" />
        <h1 className="mt-6 font-display text-3xl font-semibold">404</h1>
        <p className="mt-2 text-muted">SO couldn&apos;t find that page · الصفحة غير موجودة</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-violet px-5 py-2.5 text-sm font-semibold shadow-glow">Home · الرئيسية</Link>
      </div>
    </main>
  );
}
