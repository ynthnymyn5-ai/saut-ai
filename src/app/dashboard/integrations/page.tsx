import { IntegrationsView, type IntegrationRow } from "@/components/dashboard/IntegrationsView";
import { requirePageSession } from "@/lib/auth";
import { getIntegrations } from "@/lib/data";
import { allProviderStatus } from "@/lib/env";

export const metadata = { title: "Integrations" };

const SERVER_KEY: Record<string, "whatsapp" | "twilio" | "google" | "email" | null> = {
  whatsapp: "whatsapp", telephony: "twilio", google_calendar: "google", email: "email", crm: null, web_widget: null, webhooks: null, api: null,
};

export default async function IntegrationsPage() {
  const s = await requirePageSession();
  const { rows, demo } = await getIntegrations(s);
  const env = allProviderStatus();
  const list: IntegrationRow[] = Object.entries(SERVER_KEY).map(([key, envKey]) => {
    const db = rows.find((r) => r.provider === key);
    const st = envKey ? env[envKey] : { configured: true, missing: [] };
    return { key, status: (db?.status as IntegrationRow["status"]) ?? "disconnected", serverReady: st.configured, missing: st.missing, lastError: db?.last_error };
  });
  return <IntegrationsView rows={list} demo={demo} />;
}
