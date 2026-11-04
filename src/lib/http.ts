import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z, type ZodTypeAny } from "zod";
import { maskSecrets, ProviderNotConfiguredError, ProviderRequestError } from "@/lib/env";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { reportError } from "@/lib/monitoring";
import { APIError as OpenAIAPIError } from "openai";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, code: string, message: string, extra?: object) =>
  NextResponse.json({ error: { code, message, ...extra } }, { status });

export async function parseJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const body = await req.json().catch(() => ({}));
  return schema.parse(body);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteCtx = { params: Promise<any> };

/** Wraps a route: rate limit + consistent error shape + error monitoring. */
export function route(
  scope: string,
  handler: (req: Request, ctx: RouteCtx) => Promise<Response>,
  opts: { limit?: number; windowMs?: number } = {},
) {
  return async (req: Request, ctx: RouteCtx) => {
    const rl = await checkRateLimit(clientKey(req, scope), opts.limit ?? 30, opts.windowMs ?? 60_000);
    if (!rl.ok) { const r = fail(429, "rate_limited", "Too many requests", { retryAfter: rl.retryAfter }); r.headers.set("Retry-After", String(rl.retryAfter)); return r; }
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ZodError) return fail(422, "invalid_input", "Invalid input", { issues: e.flatten() });
      if (e instanceof ProviderNotConfiguredError)
        return fail(503, "provider_not_configured", e.message, { variable: e.variable });
      if (e instanceof AuthError) return fail(e.status, e.code, e.message);
      const provider = providerFailure(e);
      if (provider) {
        await reportError(e, { scope, provider: provider.provider, status: provider.status });
        return fail(502, "provider_error", `${provider.provider}: ${provider.message}`, { provider: provider.provider, status: provider.status });
      }
      await reportError(e, { scope });
      return fail(500, "internal_error", "Something went wrong");
    }
  };
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, public code = status === 401 ? "unauthenticated" : "forbidden") {
    super(status === 401 ? "Sign in required" : "You don't have access to this");
  }
}

/** Recognises provider rejections (our ProviderRequestError or the OpenAI SDK's APIError) so users see the real reason. */
export function providerFailure(e: unknown): { provider: string; status: number; message: string } | null {
  if (e instanceof ProviderRequestError) return { provider: e.provider, status: e.status, message: e.message };
  const x = e as { status?: unknown; message?: unknown; error?: { message?: unknown }; constructor?: { name?: string } } | null;
  const name = x?.constructor?.name ?? "";
  // instanceof first: production builds minify class names, so the name check alone is not enough.
  const isOpenAI = e instanceof OpenAIAPIError || /APIError|AuthenticationError|RateLimitError|BadRequestError|NotFoundError|PermissionDeniedError|InternalServerError/.test(name);
  if (x && typeof x.status === "number" && isOpenAI) {
    const msg = typeof x.error?.message === "string" ? x.error.message : typeof x.message === "string" ? x.message : "request failed";
    return { provider: "OpenAI", status: x.status, message: maskSecrets(msg) };
  }
  return null;
}
