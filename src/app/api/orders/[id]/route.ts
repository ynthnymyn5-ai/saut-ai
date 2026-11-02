import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { canMove, ORDER_STATUSES } from "@/lib/orders";
import { notifyCustomerOrderStatus } from "@/lib/order-notify";
import { ANY_MEMBER, OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

/** One order with its line items and status history. */
export const GET = route("orders-get", async (_req, { params }) => {
  const s = await requireApiSession(ANY_MEMBER);
  const id = idSchema.parse((await params).id);
  if (s.demo) return fail(404, "not_found", "Order not found");
  const sb = (await supabaseServer())!;
  const { data: o, error } = await sb.from("orders").select("id, order_no, status, fulfillment, subtotal, delivery_fee, total, currency, notes, created_at, conversation_id, customer_id, delivery_address, driver_user, out_for_delivery_at, customers(full_name, phone), delivery_zones(name)")
    .eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (error) throw error;
  if (!o) return fail(404, "not_found", "Order not found");
  const [{ data: items }, { data: events }] = await Promise.all([
    sb.from("order_items").select("id, name, unit_price, quantity, line_total").eq("order_id", id).eq("organization_id", s.org.id),
    sb.from("order_events").select("from_status, to_status, created_at, actor_user").eq("order_id", id).eq("organization_id", s.org.id).order("created_at"),
  ]);
  return ok({ order: o, items: items ?? [], events: events ?? [] });
}, { limit: 120 });

const patch = z.object({ status: z.enum(ORDER_STATUSES).optional(), driver_user: z.string().uuid().nullable().optional() })
  .refine((v) => v.status !== undefined || v.driver_user !== undefined, "Nothing to update");

/**
 * Move an order through its lifecycle (only valid transitions; delivered/canceled are final;
 * "out for delivery" only for delivery orders) and/or assign the driver (must be a member).
 * When WhatsApp is connected and the customer's 24-hour window is open, the customer is told.
 */
export const PATCH = route("orders-update", async (req, { params }) => {
  const s = await requireApiSession(OPERATE);
  const id = idSchema.parse((await params).id);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data: cur, error: e1 } = await sb.from("orders").select("status, fulfillment, order_no, customer_id").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return fail(404, "not_found", "Order not found");
  const upd: Record<string, unknown> = {};
  if (b.status !== undefined && b.status !== cur.status) {
    if (!canMove(cur.status, b.status, cur.fulfillment)) return fail(409, "invalid_transition", `An order that is ${cur.status} can't be moved to ${b.status}.`);
    upd.status = b.status;
    if (b.status === "out_for_delivery") upd.out_for_delivery_at = new Date().toISOString();
  }
  if (b.driver_user !== undefined) {
    if (cur.fulfillment !== "delivery") return fail(409, "not_delivery", "Only delivery orders have a driver");
    if (b.driver_user) {
      const { data: m } = await sb.from("memberships").select("id").eq("organization_id", s.org.id).eq("user_id", b.driver_user).maybeSingle();
      if (!m) return fail(422, "invalid_input", "That person is not a member of this business");
    }
    upd.driver_user = b.driver_user;
  }
  if (!Object.keys(upd).length) return ok({ ok: true });
  let q = sb.from("orders").update(upd).eq("id", id).eq("organization_id", s.org.id);
  if (upd.status) q = q.eq("status", cur.status);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(409, "conflict", "The order changed meanwhile — refresh and try again.");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "order.updated", targetType: "order", targetId: id, metadata: { from: cur.status, ...upd } });
  let customerNotified: string | null = null;
  if (upd.status && cur.customer_id) customerNotified = await notifyCustomerOrderStatus(s.org.id, cur.customer_id as string, cur.order_no as number, upd.status as string);
  return ok({ ok: true, customerNotified });
}, { limit: 60 });
