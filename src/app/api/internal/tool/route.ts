import { z } from "zod";
import { internalAuthorized } from "@/lib/so/internal-auth";
import { executeTool } from "@/lib/ai/tools";

export const runtime = "nodejs";

const schema = z.object({
  orgId: z.string().uuid(),
  employeeId: z.string().uuid(),
  conversationId: z.string().uuid(),
  name: z.string().max(64),
  args: z.record(z.unknown()),
});

/**
 * Called only by the voice bridge (services/voice-bridge) to run a tool during a LIVE call.
 * Authenticated with a shared secret (INTERNAL_API_SECRET), compared in constant time.
 */
export async function POST(req: Request) {
  if (!internalAuthorized(req)) return new Response("Forbidden", { status: 403 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, note: "invalid tool call" }, { status: 422 });
  const r = await executeTool(p.data.name, p.data.args, { orgId: p.data.orgId, employeeId: p.data.employeeId, conversationId: p.data.conversationId, test: false });
  return Response.json(r);
}
