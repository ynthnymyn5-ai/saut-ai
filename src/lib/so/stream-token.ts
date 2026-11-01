import crypto from "node:crypto";

/**
 * Short-lived signed token that authorises ONE media stream on the voice bridge.
 * The app puts it in the TwiML <Parameter>; the bridge verifies it with the same
 * INTERNAL_API_SECRET before opening a (paid) OpenAI Realtime session.
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload)).
 * services/voice-bridge/server.mjs carries an identical verify() — keep them in sync.
 */
export interface StreamClaims { c: string; e: string; o: string; exp: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(body).digest("base64url");

export function signStreamToken(secret: string, claims: Omit<StreamClaims, "exp">, ttlSec = 120, now = Date.now()): string {
  if (!secret) throw new Error("INTERNAL_API_SECRET missing");
  const body = b64(JSON.stringify({ ...claims, exp: Math.floor(now / 1000) + ttlSec }));
  return `${body}.${mac(secret, body)}`;
}

export function verifyStreamToken(secret: string, token: string, now = Date.now()): StreamClaims | null {
  if (!secret || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString()) as StreamClaims;
    if (typeof c.exp !== "number" || c.exp * 1000 < now) return null;
    if (![c.c, c.e, c.o].every((v) => typeof v === "string" && v.length > 0)) return null;
    return c;
  } catch {
    return null;
  }
}
