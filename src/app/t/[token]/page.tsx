import { notFound } from "next/navigation";
import { TrackView, type Tracking } from "@/components/TrackView";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order status", robots: { index: false, follow: false } };

/** Customer-facing order status (from the link the business shares). No login needed. */
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const sb = await supabaseServer();
  const { data } = sb ? await sb.rpc("get_order_tracking", { p_token: token }) : { data: null };
  if (!data) notFound();
  return <TrackView token={token} initial={data as Tracking} />;
}
