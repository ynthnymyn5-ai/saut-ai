import { reportError, scrubPath } from "@/lib/monitoring";

export async function register() {}

/** Next.js calls this for errors thrown while rendering pages, server actions and route handlers. */
export async function onRequestError(
  err: unknown,
  request: { path: string },
  context: { routePath?: string; routeType?: string },
) {
  await reportError(err, {
    scope: "request",
    source: "server",
    route: context.routePath ?? scrubPath(request.path),
    routeType: context.routeType,
    digest: (err as { digest?: string } | null)?.digest,
  });
}
