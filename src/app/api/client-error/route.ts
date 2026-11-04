import { z } from "zod";
import { ok, parseJson, route } from "@/lib/http";
import { reportError, scrubPath } from "@/lib/monitoring";

/**
 * Browser and Android-app errors are posted here and forwarded to Sentry from the server,
 * so the DSN never ships to the client and ad blockers / CSP do not drop reports.
 * Only the error name, message, stack, scrubbed path and a short device hint are kept.
 */
const body = z.object({
  name: z.string().max(100).optional(),
  message: z.string().min(1).max(1000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  digest: z.string().max(100).optional(),
  kind: z.enum(["error", "unhandledrejection", "boundary"]).default("error"),
});

export const POST = route("client-error", async (req) => {
  const b = await parseJson(req, body);
  const e = new Error(b.message);
  e.name = b.name || "ClientError";
  e.stack = b.stack ? `${e.name}: ${b.message}\n${b.stack.split("\n").filter((l) => /^\s*at /.test(l)).join("\n")}` : undefined;
  const ua = req.headers.get("user-agent") ?? "";
  const device = /SautAIApp/.test(ua) ? "android-app" : /Mobile/.test(ua) ? "mobile-web" : "desktop-web";
  const sent = await reportError(e, { scope: "client", source: "browser", kind: b.kind, path: b.path ? scrubPath(b.path) : undefined, digest: b.digest, ua: device }, { platform: "javascript" });
  return ok({ received: true, forwarded: sent });
}, { limit: 10, windowMs: 60_000 });
