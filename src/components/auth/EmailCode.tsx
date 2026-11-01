"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { authErrorMessage } from "@/lib/auth-errors";
import { useI18n } from "@/lib/i18n/client";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * "We emailed you" panel with a code box. Typing the code from the email signs the user in right
 * here — so it works inside the Android app even though email links open in the phone's browser.
 * The link in the email keeps working too.
 */
export function EmailCode({ email, purpose, onVerified, onResend }: {
  email: string;
  purpose: "signup" | "recovery";
  onVerified: () => void;
  onResend: () => Promise<{ error: { message?: string; status?: number } | null }>;
}) {
  const { locale } = useI18n();
  const ar = locale === "ar";
  const sb = supabaseBrowser();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(60);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sb || busy) return;
    setBusy(true); setError(null);
    const token = code.replace(/\s/g, "");
    let { error } = await sb.auth.verifyOtp({ email, token, type: purpose === "recovery" ? "recovery" : "email" });
    if (error && purpose === "signup") ({ error } = await sb.auth.verifyOtp({ email, token, type: "signup" }));
    setBusy(false);
    if (error) setError(authErrorMessage(error, locale));
    else onVerified();
  }

  return (
    <div className="space-y-4" role="status">
      <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm text-emerald-100">
        {ar ? <>أرسلنا رسالة إلى <b dir="ltr">{email}</b>. أدخل الرمز الموجود فيها هنا، أو افتح الرابط ثم ارجع وسجّل الدخول.</>
          : <>We sent an email to <b>{email}</b>. Enter the code from it here, or open the link and then come back and log in.</>}
        <p className="mt-2 text-xs opacity-80">{ar ? "لم تصلك؟ تحقّق من مجلد الرسائل غير المرغوب فيها." : "Nothing yet? Check your spam folder."}</p>
      </div>
      <form onSubmit={verify} className="space-y-3">
        <div>
          <label className="label" htmlFor="otp">{ar ? "رمز التأكيد" : "Confirmation code"}</label>
          <input id="otp" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={12} className="input text-center font-mono text-lg tracking-[0.4em]"
            value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} placeholder="••••••" />
        </div>
        {error && <p className="text-sm text-rose-300">{error}</p>}
        {info && <p className="text-sm text-emerald-200">{info}</p>}
        <Button type="submit" disabled={busy || code.length < 6} className="w-full py-3">{busy ? (ar ? "جارٍ التحقق…" : "Checking…") : (ar ? "تأكيد" : "Confirm")}</Button>
      </form>
      <button type="button" disabled={wait > 0 || busy} className="text-sm text-violet-soft hover:text-white disabled:opacity-50"
        onClick={async () => {
          setError(null); setInfo(null); setBusy(true);
          const { error } = await onResend();
          setBusy(false); setWait(60);
          if (error) setError(authErrorMessage(error, locale)); else setInfo(ar ? "تم إرسال رسالة جديدة." : "A new email is on its way.");
        }}>
        {wait > 0 ? (ar ? `إعادة الإرسال بعد ${wait} ث` : `Resend in ${wait}s`) : (ar ? "أعد إرسال الرسالة" : "Resend email")}
      </button>
    </div>
  );
}
