import { z } from "zod";
import { ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { assistantTurn } from "@/lib/assistant/brain";
import { ASSISTANT_PAGES, detectNavigation } from "@/lib/assistant/core";
import { orgContext } from "@/lib/so/api";

const schema = z.object({
  text: z.string().trim().min(1).max(1000),
  locale: z.enum(["ar", "en"]).default("ar"),
  path: z.string().max(200).regex(/^\//).default("/dashboard"),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(12).default([]),
});

/**
 * In-app assistant ("SO"): one turn. Navigation commands ("افتح المواعيد") are answered
 * instantly without a model call. Everything else goes to the model with read-only,
 * role-scoped tools. Requires a signed-in member; works for every role.
 */
export const POST = route("assistant-chat", async (req) => {
  const c = await orgContext(ANY_MEMBER);
  const body = await parseJson(req, schema);
  const ar = body.locale === "ar";

  const nav = detectNavigation(body.text);
  if (nav) {
    return ok({ reply: ar ? "حاضر، هذي هي." : "Sure, here it is.", emotion: "happy", actions: [{ type: "navigate", href: ASSISTANT_PAGES[nav] }], tools: [], instant: true, demo: c.demo });
  }
  const r = await assistantTurn({
    db: c.demo ? null : c.db, orgId: c.s.org.id, orgName: c.s.org.name, userName: c.s.fullName ?? null,
    role: c.s.role ?? "viewer", branchIds: c.branchIds, locale: body.locale, path: body.path,
  }, body.text, body.history);
  return ok({ ...r, demo: c.demo });
}, { limit: 30 });
