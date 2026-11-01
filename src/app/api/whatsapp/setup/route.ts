import { requireApiSession } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { ok, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * WhatsApp setup guide: which server settings exist (names only — never values),
 * the exact webhook URL to paste into Meta, and live progress from real data.
 */
export const GET = route("whatsapp-setup", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  const has = (k: string) => !!process.env[k];
  const env = {
    WHATSAPP_ACCESS_TOKEN: has("WHATSAPP_ACCESS_TOKEN"),
    WHATSAPP_PHONE_NUMBER_ID: has("WHATSAPP_PHONE_NUMBER_ID"),
    WHATSAPP_APP_SECRET: has("WHATSAPP_APP_SECRET"),
    WHATSAPP_VERIFY_TOKEN: has("WHATSAPP_VERIFY_TOKEN"),
  };
  const base = { env, webhookUrl: `${publicEnv.appUrl}/api/webhooks/whatsapp`, openai: has("OPENAI_API_KEY") };
  if (s.demo) return ok({ ...base, demo: true, connected: false, activeEmployee: false, lastInboundAt: null, lastError: null, display: null });
  const sb = (await supabaseServer())!;
  const [integ, emp, last] = await Promise.all([
    sb.from("integrations").select("status, last_error, config").eq("organization_id", s.org.id).eq("provider", "whatsapp").maybeSingle(),
    sb.from("ai_employees").select("id").eq("organization_id", s.org.id).eq("status", "active").limit(1),
    sb.from("customers").select("whatsapp_last_inbound_at").eq("organization_id", s.org.id).not("whatsapp_last_inbound_at", "is", null).order("whatsapp_last_inbound_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return ok({
    ...base,
    connected: integ.data?.status === "connected",
    lastError: integ.data?.last_error ?? null,
    display: (integ.data?.config as { display?: string } | null)?.display ?? null,
    activeEmployee: (emp.data?.length ?? 0) > 0,
    lastInboundAt: (last.data as { whatsapp_last_inbound_at?: string } | null)?.whatsapp_last_inbound_at ?? null,
    canConnect: s.role === "owner" || s.role === "admin",
  });
}, { limit: 60 });
