import "server-only";

/**
 * "Getting started" status for one organization, computed from real data only.
 * Works with the user's RLS client (dashboard) or the engine client (assistant SO);
 * every query is filtered by organization_id either way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (t: string) => any };

export type SetupStep = "business" | "employee" | "employee_active" | "knowledge" | "whatsapp" | "phone" | "voices";
export interface SetupStatus { steps: Record<SetupStep, boolean>; done: number; total: number; whatsappServerReady: boolean; lastWhatsAppAt: string | null }

export async function setupStatus(db: Client, orgId: string): Promise<SetupStatus> {
  const [org, emps, docs, integ, lastWa] = await Promise.all([
    db.from("organizations").select("contact_phone, address, voice_settings").eq("id", orgId).maybeSingle(),
    db.from("ai_employees").select("status, phone_number").eq("organization_id", orgId),
    db.from("knowledge_documents").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("status", "ready"),
    db.from("integrations").select("provider, status").eq("organization_id", orgId),
    db.from("customers").select("whatsapp_last_inbound_at").eq("organization_id", orgId).not("whatsapp_last_inbound_at", "is", null).order("whatsapp_last_inbound_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const o = (org.data ?? {}) as { contact_phone?: string | null; address?: string | null; voice_settings?: { voice_ar?: string; voice_en?: string } | null };
  const e = (emps.data ?? []) as { status: string; phone_number: string | null }[];
  const connected = new Set(((integ.data ?? []) as { provider: string; status: string }[]).filter((i) => i.status === "connected").map((i) => i.provider));
  const steps: Record<SetupStep, boolean> = {
    business: !!(o.contact_phone && o.address),
    employee: e.length > 0,
    employee_active: e.some((x) => x.status === "active"),
    knowledge: (docs.count ?? 0) > 0,
    whatsapp: connected.has("whatsapp"),
    phone: connected.has("telephony") || e.some((x) => !!x.phone_number),
    voices: !!(o.voice_settings?.voice_ar || o.voice_settings?.voice_en),
  };
  const done = Object.values(steps).filter(Boolean).length;
  return {
    steps, done, total: Object.keys(steps).length,
    whatsappServerReady: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    lastWhatsAppAt: (lastWa.data as { whatsapp_last_inbound_at?: string } | null)?.whatsapp_last_inbound_at ?? null,
  };
}
