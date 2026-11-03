import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { FULFILLMENTS, ORDER_STATUSES, orderErrorMessage } from "@/lib/orders";
import { ANY_MEMBER, OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";
import { trackingUrl } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/** Orders, newest first. Optional ?status=…&q=<order no or phone>. RLS scopes to the user's organization and branches. */
export const GET = route("orders-list", async (req) => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, orders: [] });
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 40);
  const sb = (await supabaseServer())!;
  let query = sb.from("orders").select("id, order_no, status, fulfillment, total, delivery_fee, currency, notes, created_at, customer_id, created_by_agent, delivery_address, driver_user, tracking_token, customers(full_name, phone), ai_employees(name), delivery_zones(name)")
    .eq("organization_id", s.org.id).order("created_at", { ascending: false }).limit(200);
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (/^\d{1,9}$/.test(q)) query = query.eq("order_no", Number(q));
  const { data, error } = await query;
  if (error) throw error;
  return ok({
    orders: (data ?? []).map((o) => {
      const c = o.customers as unknown as { full_name: string | null; phone: string | null } | null;
      const e = o.ai_employees as unknown as { name: string } | null;
      return { id: o.id, order_no: o.order_no, status: o.status, fulfillment: o.fulfillment, total: o.total, deliveryFee: o.delivery_fee, currency: o.currency, notes: o.notes, created_at: o.created_at,
        trackingUrl: trackingUrl(o.tracking_token as string), address: o.delivery_address, zone: (o.delivery_zones as unknown as { name: string } | null)?.name ?? null, driverUser: o.driver_user,
        customer: c ? { id: o.customer_id, name: c.full_name, phone: c.phone } : null, takenBy: e?.name ?? null };
    }),
  });
}, { limit: 60 });

const createSchema = z.object({
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(999) })).min(1).max(50),
  customer_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Invalid phone number").optional(),
  fulfillment: z.enum(FULFILLMENTS).default("pickup"),
  notes: z.string().trim().max(1000).optional(),
  status: z.enum(["pending", "confirmed"]).default("confirmed"),
  zone_id: z.string().uuid().optional(),
  address: z.object({
    area: z.string().trim().max(80), block: z.string().trim().max(20), street: z.string().trim().max(120).optional(),
    avenue: z.string().trim().max(60).optional(), house: z.string().trim().max(40).optional(), floor: z.string().trim().max(20).optional(),
    apartment: z.string().trim().max(20).optional(), notes: z.string().trim().max(300).optional(),
  }).optional(),
});

/** Staff-created order. Prices and totals are computed in the database from the catalogue — the client only sends product ids and quantities. */
export const POST = route("orders-create", async (req) => {
  const s = await requireApiSession(OPERATE);
  const b = await parseJson(req, createSchema);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  let customerId: string | null = null;
  if (b.phone) {
    const phone = (b.phone.startsWith("+") ? "+" : "") + b.phone.replace(/\D/g, "");
    const row: Record<string, unknown> = { organization_id: s.org.id, phone, last_contact_at: new Date().toISOString() };
    if (b.customer_name) row.full_name = b.customer_name;
    const { data: cust, error } = await sb.from("customers").upsert(row, { onConflict: "organization_id,phone" }).select("id").single();
    if (error) throw error;
    customerId = cust.id;
  }
  const { data: id, error } = await sb.rpc("create_order", {
    p_org: s.org.id, p_items: b.items, p_customer: customerId, p_fulfillment: b.fulfillment, p_notes: b.notes ?? null, p_status: b.status,
    p_address: b.fulfillment === "delivery" ? b.address ?? null : null, p_zone: b.fulfillment === "delivery" ? b.zone_id ?? null : null,
  });
  if (error) {
    const msg = orderErrorMessage(error.message);
    if (msg) return fail(422, "invalid_order", msg);
    throw error;
  }
  const { data: o } = await sb.from("orders").select("order_no, total, delivery_fee, currency").eq("id", id as string).single();
  await audit({ orgId: s.org.id, actorId: s.userId, action: "order.created", targetType: "order", targetId: id as string, metadata: { order_no: o?.order_no, total: o?.total } });
  return ok({ id, order_no: o?.order_no, total: o?.total, delivery_fee: o?.delivery_fee, currency: o?.currency }, 201);
}, { limit: 30 });
