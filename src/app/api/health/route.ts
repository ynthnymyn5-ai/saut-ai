import { allProviderStatus, isSupabaseConfigured } from "@/lib/env";
import { supabaseService } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Public liveness + which providers are configured (no secrets, no missing var names). */
export async function GET() {
  let db: "ok" | "down" | "not_configured" = "not_configured";
  const svc = supabaseService();
  if (svc) {
    const t = Date.now();
    const { error } = await svc.from("subscription_plans").select("id").limit(1);
    db = error ? "down" : "ok";
    if (Date.now() - t > 2000) db = "down";
  } else if (isSupabaseConfigured()) db = "down";
  const providers = Object.fromEntries(Object.entries(allProviderStatus()).map(([k, v]) => [k, v.configured]));
  const ops = {
    sharedRateLimit: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    errorMonitoring: !!process.env.ERROR_MONITORING_DSN,
    voiceBridge: !!process.env.VOICE_BRIDGE_WSS_URL && !!process.env.INTERNAL_API_SECRET,
  };
  return Response.json({ status: db === "down" ? "degraded" : "ok", db, providers, ops, time: new Date().toISOString() });
}
