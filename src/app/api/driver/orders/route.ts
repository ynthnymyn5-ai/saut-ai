import { requireApiSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { formatAddress, type DeliveryAddress } from "@/lib/orders";
import { OPERATE } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";
import { mapsUrl } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/** The signed-in driver's deliveries: ready / on the way, plus what they delivered in the last 12 hours. */
export const GET = route("driver-orders", async () => {
  const s = await requireApiSession(OPERATE);
  if (s.demo) return ok({ demo: true, active: [], done: [] });
  const sb = (await supabaseServer())!;
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data, error } = await sb.from("orders")
    .select("id, order_no, status, total, currency, notes, delivery_address, out_for_delivery_at, updated_at, customers(full_name, phone), delivery_zones(name), order_items(name, quantity)")
    .eq("organization_id", s.org.id).eq("driver_user", s.userId).eq("fulfillment", "delivery")
    .or(`status.in.(confirmed,preparing,ready,out_for_delivery),and(status.eq.delivered,updated_at.gte.${since})`)
    .order("created_at", { ascending: true }).limit(100);
  if (error) throw error;
  const rows = (data ?? []).map((o) => {
    const c = o.customers as unknown as { full_name: string | null; phone: string | null } | null;
    const a = o.delivery_address as DeliveryAddress | null;
    return {
      id: o.id, order_no: o.order_no, status: o.status, total: o.total, currency: o.currency, notes: o.notes,
      zone: (o.delivery_zones as unknown as { name: string } | null)?.name ?? null,
      address: a, addressText: formatAddress(a, true), addressNotes: a?.notes ?? null, maps: mapsUrl(a),
      customer: c ? { name: c.full_name, phone: c.phone } : null,
      items: (o.order_items as unknown as { name: string; quantity: number }[]) ?? [],
    };
  });
  return ok({ active: rows.filter((r) => r.status !== "delivered"), done: rows.filter((r) => r.status === "delivered") });
}, { limit: 60 });
