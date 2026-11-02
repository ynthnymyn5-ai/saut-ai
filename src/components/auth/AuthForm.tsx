"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { SoScene } from "@/components/brand/SoScene";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { authErrorMessage, classifyAuthError, isInApp, isObfuscatedExistingUser } from "@/lib/auth-errors";
import { EmailCode } from "@/components/auth/EmailCode";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const sb = supabaseBrowser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // email awaiting confirmation
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [inApp, setInApp] = useState(false);
  useEffect(() => setInApp(isInApp(navigator.userAgent)), []);
  // Show "Continue with Google" only if Google sign-in is actually enabled in Supabase
  // (public /auth/v1/settings) — otherwise people land on a raw "provider is not enabled" error.
  const [googleOn, setGoogleOn] = useState(false);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } }).then((r) => (r.ok ? r.json() : null))
      .then((j: { external?: { google?: boolean } } | null) => setGoogleOn(!!j?.external?.google)).catch(() => setGoogleOn(false));
  }, []);
  const ar = locale === "ar";
  const notice = params.get("notice") === "link" ? (ar ? "إذا كنت قد فتحت رابط تأكيد البريد فقد تم تأكيده — سجّل الدخول الآن. وإذا انتهت صلاحية الرابط فسجّل الدخول وسنرسل لك رمزاً جديداً." : "If you just opened your confirmation link, your email is confirmed — log in now. If the link expired, log in and we'll send a new code.")
    : params.get("error") === "auth" ? (ar ? "الرابط منتهي أو تم استخدامه. سجّل الدخول أو اطلب رابطاً جديداً." : "That link has expired or was already used. Log in or request a new one.") : null;
  const redirectTo = () => `${window.location.origin}/auth/callback?next=/onboarding`;
  const resendSignup = (email: string) => sb!.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo() } });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sb) return;
    setLoading(true);
    setError(null);
    setUnconfirmed(false);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim();
    const password = String(f.get("password"));
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          setError(authErrorMessage(error, locale));
          if (classifyAuthError(error) === "email_not_confirmed") { setUnconfirmed(true); setPending(email); }
        } else {
          const next = params.get("next");
          router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
          router.refresh();
        }
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: String(f.get("fullName")), company: String(f.get("company")), locale }, emailRedirectTo: redirectTo() },
        });
        if (error) setError(authErrorMessage(error, locale));
        else if (isObfuscatedExistingUser(data.user)) setError(authErrorMessage({ message: "already registered" }, locale));
        else if (data.session) { router.replace("/onboarding"); router.refresh(); } // email confirmation disabled → already signed in
        else { setPending(email); toast({ kind: "success", title: t.auth.checkEmail }); }
      }
    } catch (err) {
      setError(authErrorMessage({ message: err instanceof Error ? err.message : "network" }, locale));
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    if (!sb) return;
    await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` } });
  }

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between"><Link href="/"><Logo size={30} /></Link><LanguageSwitcher /></div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto my-auto w-full max-w-sm py-12">
          <h1 className="font-display text-3xl font-semibold">{mode === "login" ? t.auth.loginTitle : t.auth.signupTitle}</h1>

          {!sb ? (
            <div className="mt-8 space-y-4">
              <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-100">{t.auth.demoNotice}</p>
              <ButtonLink href="/dashboard" className="w-full py-3">{t.auth.enterDemo}</ButtonLink>
            </div>
          ) : pending && (mode === "signup" || unconfirmed) ? (
              <div className="mt-8">
                <EmailCode email={pending} purpose="signup" onResend={() => resendSignup(pending)} onVerified={() => { router.replace(mode === "signup" ? "/onboarding" : "/dashboard"); router.refresh(); }} />
                <button type="button" className="mt-4 text-xs text-muted hover:text-white" onClick={() => { setPending(null); setUnconfirmed(false); setError(null); }}>{ar ? "استخدم بريداً آخر" : "Use a different email"}</button>
              </div>
          ) : (
            <>
              {notice && <p className="mt-6 rounded-xl border border-electric/30 bg-electric/5 p-3 text-sm text-sky-100">{notice}</p>}
              {/* Google blocks sign-in inside app WebViews (disallowed_useragent), so the app shows email sign-in only. */}
              {!inApp && googleOn && <>
              <Button variant="outline" className="mt-8 w-full py-3" onClick={google} type="button">
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#fff" opacity=".7" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#fff" opacity=".5" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z"/><path fill="#fff" opacity=".85" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9Z"/></svg>
                {t.auth.google}
              </Button>
              <div className="my-6 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{ar ? "أو" : "or"}<span className="h-px flex-1 bg-line" /></div>
              </>}
              <form onSubmit={submit} className={inApp || !googleOn ? "mt-8 space-y-4" : "space-y-4"}>
                {mode === "signup" && (
                  <>
                    <div><label className="label" htmlFor="fullName">{t.auth.fullName}</label><input id="fullName" name="fullName" required maxLength={120} className="input" autoComplete="name" /></div>
                    <div><label className="label" htmlFor="company">{t.auth.company}</label><input id="company" name="company" required maxLength={120} className="input" autoComplete="organization" /></div>
                  </>
                )}
                <div><label className="label" htmlFor="email">{t.auth.email}</label><input id="email" name="email" type="email" required className="input" autoComplete="email" dir="ltr" /></div>
                <div><label className="label" htmlFor="password">{t.auth.password}</label><input id="password" name="password" type="password" required minLength={8} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" />
                  {mode === "login" && <Link href="/forgot-password" className="mt-1.5 inline-block text-xs text-violet-soft hover:text-white">{t.auth.forgot}</Link>}</div>
                {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full py-3">{loading ? t.common.loading : mode === "login" ? t.auth.login : t.auth.signup}</Button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? t.auth.noAccount : t.auth.haveAccount}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"} className="font-semibold text-violet-soft hover:text-white">
              {mode === "login" ? t.auth.signup : t.auth.login}
            </Link>
          </p>
        </motion.div>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden border-s border-line bg-ink-2 lg:flex">
        <div className="absolute h-[500px] w-[500px] rounded-full bg-violet/25 blur-[120px]" />
        <div className="relative text-center">
          <SoScene size={260} state="listening" />
          <p className="mt-8 font-display text-2xl font-semibold text-gradient">{t.brand.tagline}</p>
        </div>
      </div>
    </div>
  );
}
