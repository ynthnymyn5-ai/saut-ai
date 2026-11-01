import "server-only";
import crypto from "node:crypto";

/** Constant-time check of the shared secret sent by the voice bridge (x-internal-secret). */
export function internalAuthorized(req: Request): boolean {
  const secret = process.env.INTERNAL_API_SECRET ?? "";
  const given = req.headers.get("x-internal-secret") ?? "";
  return !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
