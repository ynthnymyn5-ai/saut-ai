import "server-only";
import type { DB } from "@/lib/so/context";
import { isWidgetKey, safeColor } from "./widget-core";

export type WidgetConfig = { orgId: string; key: string; domain: string; status: string; greetingAr: string; greetingEn: string; color: string; title: string; verifiedAt: string | null };

/** Looks up a widget by its public key. The key is public (it is in the site's HTML); the domain lock is what protects it. */
export async function loadWidget(db: DB, key: string): Promise<WidgetConfig | null> {
  if (!isWidgetKey(key)) return null;
  const { data } = await db.from("integrations").select("organization_id, status, config, organizations(name, status)").eq("provider", "web_widget").eq("config->>key", key).maybeSingle();
  if (!data) return null;
  const org = data.organizations as unknown as { name: string; status: string } | null;
  if (!org || org.status !== "active") return null;
  const c = (data.config ?? {}) as Record<string, string | undefined>;
  if (!c.domain) return null;
  return {
    orgId: data.organization_id as string, key, domain: c.domain, status: data.status as string,
    greetingAr: c.greeting_ar || `أهلاً بك في ${org.name}! كيف أقدر أساعدك؟`,
    greetingEn: c.greeting_en || `Welcome to ${org.name}! How can I help?`,
    color: safeColor(c.color), title: (c.title || org.name).slice(0, 60), verifiedAt: c.verified_at ?? null,
  };
}
