/**
 * Turns Supabase Auth errors into clear bilingual messages. Unknown errors keep the provider's
 * text (it is not secret) so nothing is hidden from the user. Pure module: unit-tested.
 */
export type AuthErrorKind = "invalid_credentials" | "email_not_confirmed" | "already_registered" | "rate_limited" | "weak_password" | "invalid_email" | "network" | "otp_invalid" | "signups_disabled" | "unknown";

export function classifyAuthError(e: { message?: string; status?: number; code?: string } | null | undefined): AuthErrorKind {
  const m = `${e?.code ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (/invalid[_ ]login|invalid[_ ]credentials/.test(m)) return "invalid_credentials";
  if (/email[_ ]not[_ ]confirmed/.test(m)) return "email_not_confirmed";
  if (/already[_ ]registered|user[_ ]already[_ ]exists|email[_ ]exists/.test(m)) return "already_registered";
  if (/rate[_ ]limit|too many|over_email_send_rate|for security purposes/.test(m) || e?.status === 429) return "rate_limited";
  if (/weak[_ ]password|password should|at least \d+ characters/.test(m)) return "weak_password";
  if (/invalid.*email|email.*invalid|unable to validate email/.test(m)) return "invalid_email";
  if (/otp|token has expired|token.*invalid|expired/.test(m)) return "otp_invalid";
  if (/signups? not allowed|signup.*disabled/.test(m)) return "signups_disabled";
  if (/failed to fetch|network|load failed|fetch failed|timeout/.test(m)) return "network";
  return "unknown";
}

const MSG: Record<Exclude<AuthErrorKind, "unknown">, { en: string; ar: string }> = {
  invalid_credentials: { en: "Wrong email or password.", ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة." },
  email_not_confirmed: { en: "Your email isn't confirmed yet. Enter the code from the email, or send a new one.", ar: "لم يتم تأكيد بريدك بعد. أدخل الرمز الموجود في الرسالة أو أرسل رمزاً جديداً." },
  already_registered: { en: "An account with this email already exists. Log in instead, or reset your password.", ar: "يوجد حساب بهذا البريد. سجّل الدخول، أو استعد كلمة المرور." },
  rate_limited: { en: "Too many emails were sent in a short time. Wait a few minutes and try again.", ar: "تم إرسال رسائل كثيرة خلال وقت قصير. انتظر بضع دقائق ثم حاول مرة أخرى." },
  weak_password: { en: "Choose a stronger password (at least 8 characters, mixing letters and numbers).", ar: "اختر كلمة مرور أقوى (٨ أحرف على الأقل تجمع حروفاً وأرقاماً)." },
  invalid_email: { en: "That email address doesn't look valid.", ar: "عنوان البريد الإلكتروني غير صالح." },
  network: { en: "Can't reach the server. Check your internet connection and try again.", ar: "تعذّر الاتصال بالخادم. تحقّق من اتصال الإنترنت وحاول مرة أخرى." },
  otp_invalid: { en: "That code is wrong or has expired. Request a new one.", ar: "الرمز غير صحيح أو منتهي الصلاحية. اطلب رمزاً جديداً." },
  signups_disabled: { en: "New sign-ups are currently closed.", ar: "التسجيل الجديد مغلق حالياً." },
};

export function authErrorMessage(e: { message?: string; status?: number; code?: string } | null | undefined, locale: "ar" | "en"): string {
  const k = classifyAuthError(e);
  if (k === "unknown") return e?.message || (locale === "ar" ? "حدث خطأ غير متوقع." : "Something went wrong.");
  return MSG[k][locale];
}

/** Supabase hides existing confirmed accounts on sign-up by returning a user with no identities. */
export const isObfuscatedExistingUser = (user: { identities?: unknown[] | null } | null | undefined) => !!user && Array.isArray(user.identities) && user.identities.length === 0;

/** True inside the SAUT AI Android app (its WebView appends "SautAIApp" to the user agent). */
export const isInApp = (ua: string) => /SautAIApp/i.test(ua);
