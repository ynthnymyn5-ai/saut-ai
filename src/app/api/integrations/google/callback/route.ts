import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { publicEnv, serverEnv } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Google OAuth callback. Marks Calendar as connected only after Google returns a token.
 * The refresh token must be stored in a secrets vault (Supabase Vault) — we store only its reference.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/integrations?${q}`, publicEnv.appUrl));
  const s = await getSession();
  if (!s?.org || s.demo) return back("google=unauthorized");
  const sb = (await supabaseServer())!;
  const { data: row } = await sb.from("integrations").select("config").eq("organization_id", s.org.id).eq("provider", "google_calendar").maybeSingle();
  if (!row || (row.config as { state?: string }).state !== url.searchParams.get("state")) return back("google=state_mismatch");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "", client_id: serverEnv("GOOGLE_CLIENT_ID"), client_secret: serverEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: `${publicEnv.appUrl}/api/integrations/google/callback`, grant_type: "authorization_code",
    }),
  });
  const tok = (await res.json()) as { refresh_token?: string; error?: string };
  if (!res.ok || !tok.refresh_token) {
    await sb.from("integrations").update({ status: "error", last_error: tok.error ?? "token_exchange_failed" }).eq("organization_id", s.org.id).eq("provider", "google_calendar");
    return back("google=failed");
  }
  const { data: secretId } = await sb.rpc("vault_store_secret", { secret: tok.refresh_token, name: `google_${s.org.id}` }).maybeSingle();
  await sb.from("integrations").update({ status: "connected", connected_at: new Date().toISOString(), config: {}, secret_ref: (secretId as string | null) ?? null, last_error: null }).eq("organization_id", s.org.id).eq("provider", "google_calendar");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "integration.google_calendar.connected" });
  return back("google=connected");
}
