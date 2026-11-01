import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { canMove, ORDER_STATUSES } from "@/lib/orders";
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
  const { data: o, error } = await sb.from("orders").select("id, order_no, status, fulfillment, subtotal, total, currency, notes, created_at, conversation_id, customer_id, customers(full_name, phone)")
    .eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (error) throw error;
  if (!o) return fail(404, "not_found", "Order not found");
  const [{ data: items }, { data: events }] = await Promise.all([
    sb.from("order_items").select("id, name, unit_price, quantity, line_total").eq("order_id", id).eq("organization_id", s.org.id),
    sb.from("order_events").select("from_status, to_status, created_at, actor_user").eq("order_id", id).eq("organization_id", s.org.id).order("created_at"),
  ]);
  return ok({ order: o, items: items ?? [], events: events ?? [] });
}, { limit: 120 });

const patch = z.object({ status: z.enum(ORDER_STATUSES) });

/** Move an order through its lifecycle. Only valid transitions are accepted; delivered/canceled are final. */
export const PATCH = route("orders-update", async (req, { params }) => {
  const s = await requireApiSession(OPERATE);
  const id = idSchema.parse((await params).id);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data: cur, error: e1 } = await sb.from("orders").select("status").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return fail(404, "not_found", "Order not found");
  if (!canMove(cur.status, b.status)) return fail(409, "invalid_transition", `An order that is ${cur.status} can't be moved to ${b.status}.`);
  const { data, error } = await sb.from("orders").update({ status: b.status }).eq("id", id).eq("organization_id", s.org.id).eq("status", cur.status).select("id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(409, "conflict", "The order changed meanwhile — refresh and try again.");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "order.status", targetType: "order", targetId: id, metadata: { from: cur.status, to: b.status } });
  return ok({ ok: true });
}, { limit: 60 });
