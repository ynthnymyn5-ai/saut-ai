"use client";
import { useEffect } from "react";
import { SoMascot } from "@/components/brand/SoMascot";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="grid min-h-[70vh] place-items-center px-4 text-center">
      <div>
        <SoMascot size={140} state="transfer" className="mx-auto" />
        <h1 className="mt-6 font-display text-2xl font-semibold">Something went wrong · حدث خطأ</h1>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p>}
        <button onClick={reset} className="mt-6 rounded-xl bg-violet px-5 py-2.5 text-sm font-semibold shadow-glow">Try again · إعادة المحاولة</button>
      </div>
    </main>
  );
}
