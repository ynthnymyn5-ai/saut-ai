/**
 * Google OAuth 2.0 (one consent covers Calendar + Gmail). Tokens are stored in
 * integration_accounts and refreshed automatically. Uses plain fetch against
 * Google's REST APIs to keep dependencies small.
 */
import crypto from "node:crypto";
import type { Router } from "express";
import { env, baseUrl } from "../../env";
import { getAccount, saveAccount, deleteAccount } from "../store";
import { logActivity } from "../../lib/activity";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export const googleConfigured = () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const redirectUri = (host?: string) => `${baseUrl(host)}/api/integrations/google/callback`;

/** Returns a valid access token, refreshing if needed; null when not connected. */
export async function googleAccessToken(): Promise<string | null> {
  const acc = await getAccount("google");
  if (!acc?.accessToken) return null;
  if (acc.expiresAt && acc.expiresAt.getTime() > Date.now() + 60_000) return acc.accessToken;
  if (!acc.refreshToken) return acc.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: acc.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("[google] token refresh failed", res.status, await res.text());
    return null;
  }
  const t = (await res.json()) as { access_token: string; expires_in: number };
  await saveAccount("google", { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) });
  return t.access_token;
}

export async function googleScopes(): Promise<string[]> {
  return (await getAccount("google"))?.scope?.split(" ") ?? [];
}

/** Authenticated JSON fetch against a Google API. Throws with the API error message. */
export async function googleFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await googleAccessToken();
  if (!token) throw new Error("Google is not connected. Connect it in Settings → Integrations.");
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(body as { error?: { message?: string } }).error?.message ?? "request failed"}`);
  return body as T;
}

export async function googleDisconnect() {
  const acc = await getAccount("google");
  if (acc?.accessToken) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${acc.refreshToken ?? acc.accessToken}`, { method: "POST" }).catch(() => {});
  }
  await deleteAccount("google");
}

/** OAuth routes: /api/integrations/google/connect and /callback */
export function googleRoutes(router: Router) {
  router.get("/google/connect", (req, res) => {
    if (!googleConfigured()) return res.status(400).send("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to Secrets first.");
    const state = crypto.randomBytes(16).toString("hex");
    req.session.googleState = state;
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(req.get("host")),
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  router.get("/google/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;
    if (error) return res.redirect(`/settings?google=error&reason=${encodeURIComponent(error)}`);
    if (!state || state !== req.session.googleState) return res.redirect("/settings?google=error&reason=state_mismatch");
    delete req.session.googleState;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri(req.get("host")),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return res.redirect(`/settings?google=error&reason=token_exchange_${tokenRes.status}`);
    const t = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope: string; id_token?: string };
    let email: string | null = null;
    if (t.id_token) {
      try {
        email = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email ?? null;
      } catch {
        /* ignore */
      }
    }
    const prev = await getAccount("google");
    await saveAccount("google", {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? prev?.refreshToken ?? null,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      scope: t.scope,
      accountLabel: email,
    });
    await logActivity({ action: "integration.connect", actor: "user", summary: `Connected Google${email ? ` (${email})` : ""}` });
    res.redirect("/settings?google=connected");
  });
}
