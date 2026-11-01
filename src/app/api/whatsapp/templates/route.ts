import { z } from "zod";
import { audit } from "@/lib/audit";
import { fail, ok, parseJson, route } from "@/lib/http";
import { orgContext } from "@/lib/so/api";

/**
 * Message templates. Submission and status sync use Meta's Business Management API and need
 * WHATSAPP_BUSINESS_ACCOUNT_ID; status is only ever "approved" when Meta says so.
 */
export const GET = route("wa-templates", async (req) => {
  const c = await orgContext();
  if (c.demo) return ok({ demo: true, templates: [] });
  if (new URL(req.url).searchParams.get("sync") === "1") await sync(c.db, c.s.org.id);
  const { data } = await c.db.from("whatsapp_templates").select("id, name, language, category, status, body, updated_at").eq("organization_id", c.s.org.id).order("name");
  return ok({ templates: data ?? [], canSync: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID && !!process.env.WHATSAPP_ACCESS_TOKEN });
});

export const POST = route("wa-template-create", async (req) => {
  const c = await orgContext(["owner", "admin"]);
  const t = await parseJson(req, z.object({ name: z.string().regex(/^[a-z0-9_]{1,512}$/), language: z.enum(["ar", "en", "en_US"]), category: z.enum(["utility", "marketing", "authentication"]), body: z.string().trim().min(1).max(1024) }));
  if (c.demo) return ok({ demo: true });
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID, token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!waba || !token) return fail(503, "provider_not_configured", "WhatsApp Business account not configured", { variable: "WHATSAPP_BUSINESS_ACCOUNT_ID" });
  const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: t.name, language: t.language, category: t.category.toUpperCase(), components: [{ type: "BODY", text: t.body }] }),
  });
  const d = (await r.json()) as { id?: string; status?: string; error?: { message: string } };
  if (!r.ok) return fail(502, "provider_error", d.error?.message ?? "Meta rejected the template");
  await c.db.from("whatsapp_templates").upsert({ organization_id: c.s.org.id, ...t, status: (d.status ?? "PENDING").toLowerCase(), provider_id: d.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "organization_id,name,language" });
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "whatsapp.template_submitted", metadata: { name: t.name } });
  return ok({ ok: true, status: (d.status ?? "pending").toLowerCase() }, 201);
});

async function sync(db: NonNullable<Awaited<ReturnType<typeof orgContext>>["db"]>, orgId: string) {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID, token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!waba || !token) return;
  const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates?fields=name,language,status,category&limit=200`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return;
  const d = (await r.json()) as { data: { name: string; language: string; status: string }[] };
  for (const t of d.data ?? []) {
    await db.from("whatsapp_templates").update({ status: t.status.toLowerCase(), updated_at: new Date().toISOString() }).eq("organization_id", orgId).eq("name", t.name).eq("language", t.language);
  }
}
