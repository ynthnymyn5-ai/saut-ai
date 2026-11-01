"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { supabaseBrowser } from "@/lib/supabase/client";

function Frame({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col px-6 py-8">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative flex items-center justify-between"><Link href="/"><Logo size={30} /></Link><LanguageSwitcher /></div>
      <div className="relative mx-auto my-auto w-full max-w-sm py-12">
        <h1 className="font-display text-3xl font-semibold">{title}</h1>
        {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

/** Step 1: request a reset email. Always shows the same message (no account enumeration). */
export function ForgotPassword() {
  const { t } = useI18n();
  const sb = supabaseBrowser();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Frame title={t.auth.resetTitle} sub={t.auth.resetSub}>
      {!sb ? <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100">{t.auth.demoNotice}</p> : sent ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm text-emerald-100" role="status">{t.auth.linkSent}</p>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setError(null);
          const email = String(new FormData(e.currentTarget).get("email"));
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
          setBusy(false);
          // Rate-limit errors are shown; "user not found" is never revealed by Supabase.
          if (error && /rate|seconds/i.test(error.message)) setError(error.message); else setSent(true);
        }}>
          <div><label className="label" htmlFor="email">{t.auth.email}</label><input id="email" name="email" type="email" required autoComplete="email" dir="ltr" className="input" /></div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full py-3">{busy ? t.common.loading : t.auth.sendLink}</Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-block text-sm text-violet-soft hover:text-white">{t.auth.backToLogin}</Link>
    </Frame>
  );
}

/** Step 2: user arrives via /auth/callback (recovery session cookie set) and picks a new password. */
export function ResetPassword() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const sb = supabaseBrowser();
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (sb) sb.auth.getUser().then(({ data }) => setReady(!!data.user)); else setReady(false); }, [sb]);
  return (
    <Frame title={t.auth.resetTitle}>
      {ready === null ? <p className="text-sm text-muted">{t.common.loading}</p> : !ready ? (
        <><p className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-100">{t.auth.linkExpired}</p><Link href="/forgot-password" className="mt-4 inline-block text-sm text-violet-soft">{t.auth.forgot}</Link></>
      ) : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const pw = String(f.get("password")), pw2 = String(f.get("password2"));
          if (pw !== pw2) return setError(t.auth.mismatch);
          setBusy(true); setError(null);
          const { error } = await sb!.auth.updateUser({ password: pw });
          setBusy(false);
          if (error) return setError(error.message);
          toast({ kind: "success", title: t.auth.passwordSaved });
          router.replace("/dashboard");
        }}>
          <div><label className="label" htmlFor="password">{t.auth.newPassword}</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="input" /></div>
          <div><label className="label" htmlFor="password2">{t.auth.confirmPassword}</label><input id="password2" name="password2" type="password" required minLength={8} autoComplete="new-password" dir="ltr" className="input" /></div>
          {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full py-3">{busy ? t.common.loading : t.auth.savePassword}</Button>
        </form>
      )}
    </Frame>
  );
}
