/**
 * Replit Auth (OpenID Connect against https://replit.com/oidc).
 *
 * Sanad is single-user: the first account that signs in becomes the owner
 * (or set OWNER_EMAIL to pin it); anyone else is refused.
 *
 * Local development without REPL_ID: you're signed in automatically as a
 * local owner, unless NODE_ENV=production (then set AUTH_DISABLED=true
 * explicitly if you really want no login, e.g. behind your own VPN).
 */
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import session from "express-session";
import connectPg from "connect-pg-simple";
import * as oidc from "openid-client";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "../db";
import { env, baseUrl } from "../env";
import { logActivity } from "../lib/activity";

declare module "express-session" {
  interface SessionData {
    user?: { id: string; email: string | null; name: string | null; image: string | null };
    oidc?: { verifier: string; state: string; returnTo?: string };
    googleState?: string;
  }
}

export const authMode = (): "replit" | "password" | "local" | "misconfigured" => {
  if (env.REPL_ID) return "replit";
  if (env.OWNER_PASSWORD) return "password";
  if (!env.isProd || env.AUTH_DISABLED) return "local";
  return "misconfigured";
};

let configPromise: Promise<oidc.Configuration> | null = null;
const oidcConfig = () => (configPromise ??= oidc.discovery(new URL(env.ISSUER_URL), env.REPL_ID));

async function ownerAllows(sub: string, email: string | null): Promise<boolean> {
  if (env.OWNER_EMAIL) return (email ?? "").toLowerCase() === env.OWNER_EMAIL;
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "owner_id"));
  if (!row) {
    await db.insert(schema.settings).values({ key: "owner_id", value: sub });
    return true;
  }
  return row.value === sub;
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  const PgStore = connectPg(session);
  app.use(
    session({
      store: new PgStore({ pool, tableName: "session", createTableIfMissing: false }),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: { httpOnly: true, secure: env.isProd || Boolean(env.REPL_ID), sameSite: "lax", maxAge: 30 * 24 * 3600_000 },
    }),
  );

  app.get("/api/auth/me", (req, res) => {
    if (authMode() === "local" && !req.session.user) req.session.user = { id: "local-owner", email: null, name: "Owner", image: null };
    res.json({ user: req.session.user ?? null, mode: authMode() });
  });

  // Password login (single owner) — for hosts without Replit Auth
  const attempts = new Map<string, { n: number; until: number }>();
  app.post("/api/auth/login", express.json(), (req, res) => {
    if (authMode() !== "password") return res.status(400).json({ error: "password_login_disabled" });
    const ip = req.ip ?? "?";
    const a = attempts.get(ip);
    if (a && a.until > Date.now()) return res.status(429).json({ error: "too_many_attempts", message: "Too many attempts — wait a minute." });
    // trim: phones and password managers sometimes add a space
    const given = crypto.createHash("sha256").update(String(req.body?.password ?? "").trim()).digest();
    const expected = crypto.createHash("sha256").update(env.OWNER_PASSWORD.trim()).digest();
    if (!crypto.timingSafeEqual(given, expected)) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
      void logActivity({ action: "auth.denied", actor: "system", summary: "Wrong password", status: "failed" });
      return res.status(401).json({ error: "wrong_password", message: "Wrong password." });
    }
    attempts.delete(ip);
    req.session.regenerate(() => {
      req.session.user = { id: "owner", email: env.OWNER_EMAIL || null, name: "Owner", image: null };
      req.session.save(() => res.json({ ok: true }));
    });
  });

  app.get("/api/login", async (req, res) => {
    if (authMode() !== "replit") return res.redirect("/");
    const cfg = await oidcConfig();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    req.session.oidc = { verifier, state, returnTo: typeof req.query.returnTo === "string" ? req.query.returnTo : "/" };
    const url = oidc.buildAuthorizationUrl(cfg, {
      redirect_uri: `${baseUrl(req.get("host"))}/api/callback`,
      scope: "openid email profile offline_access",
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      prompt: "login consent",
    });
    req.session.save(() => res.redirect(url.href));
  });

  app.get("/api/callback", async (req, res) => {
    try {
      const cfg = await oidcConfig();
      const saved = req.session.oidc;
      if (!saved) return res.redirect("/api/login");
      const current = new URL(`${baseUrl(req.get("host"))}${req.originalUrl}`);
      const tokens = await oidc.authorizationCodeGrant(cfg, current, { pkceCodeVerifier: saved.verifier, expectedState: saved.state });
      const c = tokens.claims()!;
      const sub = String(c.sub);
      const email = (c.email as string | undefined) ?? null;
      if (!(await ownerAllows(sub, email))) {
        await logActivity({ action: "auth.denied", actor: "system", summary: `Sign-in refused for ${email ?? sub}`, status: "failed" });
        return res.status(403).send("This Sanad instance belongs to someone else.");
      }
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || (c.username as string | undefined) || null;
      await db
        .insert(schema.users)
        .values({ id: sub, email, name, profileImageUrl: (c.profile_image_url as string | undefined) ?? null })
        .onConflictDoUpdate({ target: schema.users.id, set: { email, name } });
      req.session.user = { id: sub, email, name, image: (c.profile_image_url as string | undefined) ?? null };
      const returnTo = saved.returnTo?.startsWith("/") ? saved.returnTo : "/";
      delete req.session.oidc;
      req.session.save(() => res.redirect(returnTo));
    } catch (e) {
      console.error("[auth] callback failed", e);
      res.redirect("/api/login");
    }
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
  });
}

/** Gate for every private API route. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const mode = authMode();
  if (mode === "local") {
    req.session.user ??= { id: "local-owner", email: null, name: "Owner", image: null };
    return next();
  }
  if (mode === "misconfigured") return res.status(503).json({ error: "auth_not_configured", message: "Run on Replit (REPL_ID) or set AUTH_DISABLED=true." });
  if (!req.session.user) return res.status(401).json({ error: "unauthorized" });
  next();
}
