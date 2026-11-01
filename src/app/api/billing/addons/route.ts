import { z } from "zod";
import { audit } from "@/lib/audit";
import { publicEnv } from "@/lib/env";
import { fail, ok, parseJson, route } from "@/lib/http";
import { createMyFatoorahPayment } from "@/lib/payments/myfatoorah";
import { stripe } from "@/lib/payments/stripe";
import { orgContext } from "@/lib/so/api";
import { usageVsLimits } from "@/lib/so/usage";
import { toMinor } from "@/lib/payments/money";

const PACKS = { extra_employee: { unit: 1, key: "extra_employee" }, voice_minutes: { unit: 500, key: "voice_minutes_500" }, messages: { unit: 2000, key: "messages_2000" } } as const;

/** Usage + current add-ons for the billing page. */
export const GET = route("addons-list", async () => {
  const c = await orgContext(["owner", "admin"]);
  if (c.demo) return ok({ demo: true });
  const [usage, { data: addons }, { data: prices }] = await Promise.all([
    usageVsLimits(c.db, c.s.org.id),
    c.db.from("subscription_addons").select("id, kind, quantity, unit_price, currency, status, period_end, created_at").eq("organization_id", c.s.org.id).order("created_at", { ascending: false }).limit(20),
    c.db.from("platform_settings").select("value").eq("key", "addon_prices").maybeSingle(),
  ]);
  return ok({ usage, addons: addons ?? [], prices: prices?.value ?? {} });
});

/**
 * Buy an add-on for the current billing month. The row is created "pending"; it becomes
 * "active" (and raises limits) only in the verified payment webhook.
 */
export const POST = route("addons-buy", async (req) => {
  const c = await orgContext(["owner", "admin"]);
  const b = await parseJson(req, z.object({ kind: z.enum(["extra_employee", "voice_minutes", "messages"]), packs: z.number().int().min(1).max(20), provider: z.enum(["stripe", "myfatoorah"]) }));
  if (c.demo) return ok({ demo: true });
  const { data: setting } = await c.db.from("platform_settings").select("value").eq("key", "addon_prices").maybeSingle();
  const unitPrice = Number((setting?.value as Record<string, number>)?.[PACKS[b.kind].key]);
  if (!unitPrice) return fail(503, "not_configured", "Add-on prices are not configured by the platform admin");
  const amount = Number((unitPrice * b.packs).toFixed(3));
  const end = new Date(); end.setUTCMonth(end.getUTCMonth() + 1, 1); end.setUTCHours(0, 0, 0, 0);
  const { data: addon, error } = await c.db.from("subscription_addons").insert({
    organization_id: c.s.org.id, kind: b.kind, quantity: PACKS[b.kind].unit * b.packs, unit_price: unitPrice, currency: "KWD", provider: b.provider, period_end: end.toISOString(),
  }).select("id").single();
  if (error) throw error;

  let url: string;
  if (b.provider === "stripe") {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: c.s.email,
      line_items: [{ quantity: b.packs, price_data: { currency: "kwd", unit_amount: toMinor(unitPrice, "KWD"), product_data: { name: `SAUT AI add-on: ${b.kind.replace("_", " ")}` } } }],
      metadata: { org_id: c.s.org.id, addon_id: addon.id },
      success_url: `${publicEnv.appUrl}/dashboard/billing?checkout=processing`,
      cancel_url: `${publicEnv.appUrl}/dashboard/billing?checkout=canceled`,
    });
    url = session.url!;
  } else {
    const r = await createMyFatoorahPayment({ orgId: c.s.org.id, amount, currency: "KWD", customerName: c.s.fullName ?? c.s.org.name, email: c.s.email, reference: `addon:${addon.id}`, interval: "monthly", recurring: false });
    url = r.url;
  }
  await c.db.from("subscription_addons").update({ provider_ref: url.slice(0, 200) }).eq("id", addon.id);
  await audit({ orgId: c.s.org.id, actorId: c.s.userId, action: "addon.checkout_started", metadata: b });
  return ok({ url });
}, { limit: 10 });
