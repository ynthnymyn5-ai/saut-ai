import { requireApiSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { MANAGE_AI } from "@/lib/rbac";
import { salesSummary, type SaleOrder } from "@/lib/sales-analytics";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Sales analytics from real orders: top items, peak hours, revenue by day and by delivery area. ?days=7|30|90 */
export const GET = route("orders-analytics", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;
  if (s.demo) return ok({ demo: true, days, ...salesSummary([]) });
  const sb = (await supabaseServer())!;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [{ data, error }, { data: org }] = await Promise.all([
    sb.from("orders").select("created_at, status, total, delivery_fee, fulfillment, currency, delivery_zones(name), order_items(name, quantity, line_total)")
      .eq("organization_id", s.org.id).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    sb.from("organizations").select("timezone, currency").eq("id", s.org.id).single(),
  ]);
  if (error) throw error;
  const rows: SaleOrder[] = (data ?? []).map((o) => ({
    created_at: o.created_at as string, status: o.status as string, total: Number(o.total), delivery_fee: Number(o.delivery_fee ?? 0), fulfillment: o.fulfillment as string,
    zone: (o.delivery_zones as unknown as { name: string } | null)?.name ?? null,
    items: ((o.order_items as unknown as { name: string; quantity: number; line_total: number }[]) ?? []),
  }));
  return ok({ days, currency: (org?.currency as string) ?? "KWD", truncated: (data?.length ?? 0) >= 5000, ...salesSummary(rows, (org?.timezone as string) || "Asia/Kuwait") });
}, { limit: 30 });
