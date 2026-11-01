import crypto from "node:crypto";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { fail, ok, parseJson, route } from "@/lib/http";
import { MANAGE_ORG } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";
import { normalizeDomain, safeColor } from "@/lib/widget-core";

export const dynamic = "force-dynamic";

const snippet = (key: string, lang: string) => `<script src="${publicEnv.appUrl}/widget.js" data-key="${key}" data-lang="${lang}" async></script>`;

/** Widget settings + install snippet (owners/admins). */
export const GET = route("widget-settings-get", async () => {
  const s = await requireApiSession(MANAGE_ORG);
  if (s.demo) return ok({ demo: true, configured: false });
  const sb = (await supabaseServer())!;
  const { data } = await sb.from("integrations").select("status, config, connected_at").eq("organization_id", s.org.id).eq("provider", "web_widget").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, string | undefined>;
  if (!c.key) return ok({ configured: false });
  return ok({ configured: true, status: data!.status, verifiedAt: c.verified_at ?? null, domain: c.domain, greeting_ar: c.greeting_ar ?? "", greeting_en: c.greeting_en ?? "", color: safeColor(c.color), title: c.title ?? "", key: c.key, snippetAr: snippet(c.key, "ar"), snippetEn: snippet(c.key, "en"), previewUrl: `${publicEnv.appUrl}/widget/${c.key}` });
}, { limit: 60 });

const schema = z.object({
  domain: z.string().max(260),
  greeting_ar: z.string().trim().max(300).optional(),
  greeting_en: z.string().trim().max(300).optional(),
  title: z.string().trim().max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  rotate_key: z.boolean().optional(),
});

export const POST = route("widget-settings-save", async (req) => {
  const s = await requireApiSession(MANAGE_ORG);
  const b = await parseJson(req, schema);
  if (s.demo) return ok({ demo: true });
  const domain = normalizeDomain(b.domain);
  if (!domain) return fail(422, "invalid_input", "Enter your website's domain, e.g. example.com");
  const sb = (await supabaseServer())!;
  const { data: cur } = await sb.from("integrations").select("status, config").eq("organization_id", s.org.id).eq("provider", "web_widget").maybeSingle();
  const c = (cur?.config ?? {}) as Record<string, string | undefined>;
  const key = !c.key || b.rotate_key ? `wk_${crypto.randomBytes(18).toString("base64url")}` : c.key;
  const domainChanged = c.domain !== domain || key !== c.key;
  const config = { ...c, key, domain, greeting_ar: b.greeting_ar ?? c.greeting_ar ?? "", greeting_en: b.greeting_en ?? c.greeting_en ?? "", title: b.title ?? c.title ?? "", color: safeColor(b.color ?? c.color), ...(domainChanged ? { verified_at: undefined } : {}) };
  // Shown as connected only after the widget has really loaded on that domain.
  const status = domainChanged ? "pending" : (cur?.status ?? "pending");
  const { error } = await sb.from("integrations").upsert({ organization_id: s.org.id, provider: "web_widget", status, config: JSON.parse(JSON.stringify(config)), connected_at: status === "connected" ? new Date().toISOString() : null }, { onConflict: "organization_id,provider" });
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: b.rotate_key ? "integration.web_widget.key_rotated" : "integration.web_widget.saved", metadata: { domain } });
  return ok({ ok: true, status, key });
}, { limit: 30 });
