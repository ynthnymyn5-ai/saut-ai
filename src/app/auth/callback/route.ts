import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Auth landing for: OAuth (code), email confirmation, invitations and password recovery.
 * Supports both the PKCE `code` flow and the `token_hash` + `type` email-template flow.
 * A successful exchange sets the session cookie; recovery then lands on /reset-password.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : type === "invite" ? "/reset-password" : "/dashboard");
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard"; // no open redirects
  const sb = await supabaseServer();
  if (sb) {
    if (code) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    } else if (tokenHash && type && OTP_TYPES.includes(type)) {
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type });
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  // An expired recovery link shows the reset page's "link expired" state instead of a generic error.
  if (next === "/reset-password") return NextResponse.redirect(new URL("/reset-password", url.origin));
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
