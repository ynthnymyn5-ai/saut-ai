import { z } from "zod";
import { analystTurn } from "@/lib/analyst/engine";
import { ok, parseJson, route } from "@/lib/http";
import { MANAGE_AI } from "@/lib/rbac";
import { orgContext } from "@/lib/so/api";

const schema = z.object({
  text: z.string().trim().min(2, "اكتب سؤالك").max(1000),
  locale: z.enum(["ar", "en"]).default("ar"),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(16).default([]),
});

/** AI Analyst: answers the owner's questions with numbers computed from their own orders, customers and activity. Read-only. */
export const POST = route("analyst", async (req) => {
  const c = await orgContext(MANAGE_AI);
  const b = await parseJson(req, schema);
  const r = await analystTurn({ db: c.demo ? null : c.db, orgId: c.s.org.id, orgName: c.s.org.name, userName: c.s.fullName ?? null, branchIds: c.branchIds, locale: b.locale }, b.text, b.history);
  return ok({ ...r, demo: c.demo });
}, { limit: 20 });
