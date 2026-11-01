import { MANAGE_AI } from "@/lib/rbac";
import { z } from "zod";
import { ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";
import { resolveConfirmation } from "@/lib/so/engine";

/** Approve or reject an AI action that required human confirmation. Owners/admins only. */
export const POST = route("so-exec-confirm", async (req, ctx) => {
  const c = await orgContext(MANAGE_AI);
  const { approve } = await parseJson(req, z.object({ approve: z.boolean() }));
  if (c.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  return ok(await resolveConfirmation(c.db, c.s.org.id, id, c.s.userId, approve));
}, { limit: 30 });
