import { providerStatus } from "@/lib/env";
import { ok, route } from "@/lib/http";
import { whatsappHealth } from "@/lib/messaging/whatsapp";
import { orgContext } from "@/lib/so/api";

export const dynamic = "force-dynamic";

/** Live check against Meta + last 24 h delivery outcomes for this organization. */
export const GET = route("wa-health", async () => {
  const c = await orgContext(["owner", "admin"]);
  if (c.demo) return ok({ demo: true });
  const st = providerStatus("whatsapp");
  if (!st.configured) return ok({ configured: false, missing: st.missing });
  const since = new Date(Date.now() - 86400000).toISOString();
  const [probe, { data: integ }, { data: msgs }] = await Promise.all([
    whatsappHealth(),
    c.db.from("integrations").select("status, last_error, connected_at").eq("organization_id", c.s.org.id).eq("provider", "whatsapp").maybeSingle(),
    c.db.from("messages").select("delivery_status").eq("organization_id", c.s.org.id).not("delivery_status", "is", null).gte("created_at", since),
  ]);
  const counts = (msgs ?? []).reduce<Record<string, number>>((a, m) => { a[m.delivery_status as string] = (a[m.delivery_status as string] ?? 0) + 1; return a; }, {});
  return ok({ configured: true, provider: probe, integration: integ, last24h: counts });
}, { limit: 10 });
