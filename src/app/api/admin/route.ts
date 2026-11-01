import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiAdmin } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { supabaseService } from "@/lib/supabase/server";

/** Every admin mutation goes through here: role-checked, validated, audited. */
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("org.status"), orgId: z.string().uuid(), status: z.enum(["active", "suspended"]) }),
  z.object({
    action: z.literal("plan.update"),
    code: z.enum(["starter", "business", "pro"]),
    price_monthly: z.number().min(0).max(10000),
    price_annual: z.number().min(0).max(100000),
    max_employees: z.number().int().min(1).max(1000),
    monthly_voice_minutes: z.number().int().min(0).max(1_000_000),
    monthly_conversations: z.number().int().min(0).max(10_000_000),
    is_active: z.boolean(),
  }),
  z.object({ action: z.literal("trial.update"), enabled: z.boolean(), days: z.number().int().min(0).max(90), requires_card: z.boolean() }),
  z.object({ action: z.literal("coupon.create"), code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/), percent_off: z.number().int().min(1).max(100).optional(), amount_off: z.number().positive().optional(), max_redemptions: z.number().int().positive().optional(), expires_at: z.string().datetime().optional() }),
  z.object({ action: z.literal("coupon.toggle"), code: z.string(), is_active: z.boolean() }),
  z.object({ action: z.literal("ticket.status"), ticketId: z.string().uuid(), status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]) }),
  z.object({ action: z.literal("user.update"), userId: z.string().uuid(), platform_role: z.enum(["user", "admin"]).optional(), status: z.enum(["active", "suspended"]).optional() }),
  z.object({ action: z.literal("addon.prices"), extra_employee: z.number().min(0).max(1000), voice_minutes_500: z.number().min(0).max(1000), messages_2000: z.number().min(0).max(1000) }),
  z.object({ action: z.literal("provider.costs"), voice_per_min_usd: z.number().min(0).max(10), llm_per_1k_tokens_usd: z.number().min(0).max(10), whatsapp_per_msg_usd: z.number().min(0).max(10), usd_to_kwd: z.number().min(0.1).max(1) }),
  z.object({ action: z.literal("ai.limits"), chat_model: z.string().max(60), realtime_model: z.string().max(60), max_call_seconds: z.number().int().min(30).max(3600) }),
]);

export const POST = route("admin", async (req) => {
  const s = await requireApiAdmin();
  const a = await parseJson(req, action);
  const db = supabaseService();
  if (!db) return fail(503, "provider_not_configured", "Service role key missing", { variable: "SUPABASE_SERVICE_ROLE_KEY" });

  let error: { message: string } | null = null;
  switch (a.action) {
    case "org.status":
      ({ error } = await db.from("organizations").update({ status: a.status }).eq("id", a.orgId));
      break;
    case "plan.update": {
      const { code, action: _, ...rest } = a;
      ({ error } = await db.from("subscription_plans").update(rest).eq("code", code));
      break;
    }
    case "trial.update":
      ({ error } = await db.from("platform_settings").upsert({ key: "trial", value: { enabled: a.enabled, days: a.days, requires_card: a.requires_card }, updated_by: s.userId }));
      break;
    case "coupon.create":
      if (!a.percent_off === !a.amount_off) return fail(422, "invalid_input", "Set exactly one of percent_off or amount_off");
      ({ error } = await db.from("coupons").insert({ code: a.code.toUpperCase(), percent_off: a.percent_off ?? null, amount_off: a.amount_off ?? null, max_redemptions: a.max_redemptions ?? null, expires_at: a.expires_at ?? null }));
      break;
    case "coupon.toggle":
      ({ error } = await db.from("coupons").update({ is_active: a.is_active }).eq("code", a.code));
      break;
    case "ticket.status":
      ({ error } = await db.from("support_tickets").update({ status: a.status, assigned_to: s.userId }).eq("id", a.ticketId));
      break;
    case "user.update": {
      if (a.userId === s.userId && (a.platform_role === "user" || a.status === "suspended")) return fail(400, "self_lockout", "You can't remove your own admin access");
      const { userId, action: _a, ...upd } = a;
      ({ error } = await db.from("users").update(upd).eq("id", userId));
      break;
    }
    case "addon.prices": {
      const { action: _a, ...v } = a;
      ({ error } = await db.from("platform_settings").upsert({ key: "addon_prices", value: v, updated_by: s.userId }));
      break;
    }
    case "provider.costs": {
      const { action: _a, ...v } = a;
      ({ error } = await db.from("platform_settings").upsert({ key: "provider_costs", value: v, updated_by: s.userId }));
      break;
    }
    case "ai.limits":
      ({ error } = await db.from("platform_settings").upsert({ key: "ai", value: { chat_model: a.chat_model, realtime_model: a.realtime_model, max_call_seconds: a.max_call_seconds }, updated_by: s.userId }));
      break;
  }
  if (error) throw new Error(error.message);
  await audit({ actorId: s.userId, action: `admin.${a.action}`, metadata: a as Record<string, unknown> });
  return ok({ ok: true });
});
