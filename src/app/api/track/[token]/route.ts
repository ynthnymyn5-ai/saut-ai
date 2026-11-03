import { fail, ok, route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Public order status for the customer's tracking link. Shows no phone, name, address or notes. */
export const GET = route("track-order", async (_req, { params }) => {
  const token = String((await params).token ?? "");
  if (!/^[0-9a-f]{64}$/.test(token)) return fail(404, "not_found", "Order not found");
  const sb = await supabaseServer();
  if (!sb) return fail(404, "not_found", "Order not found");
  const { data, error } = await sb.rpc("get_order_tracking", { p_token: token });
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Order not found");
  return ok(data);
}, { limit: 60 });
