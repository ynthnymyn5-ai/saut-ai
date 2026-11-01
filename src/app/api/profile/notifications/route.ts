import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { providerStatus } from "@/lib/env";
import { ok, parseJson, route } from "@/lib/http";
import { engineDb } from "@/lib/so/context";

export const dynamic = "force-dynamic";

/** My email-alert preference for the current business. Updates only the caller's own membership row. */
export const GET = route("notif-pref-get", async () => {
  const s = await requireApiSession();
  if (s.demo) return ok({ demo: true, email: false, available: false });
  const { data } = await engineDb().from("memberships").select("notify_email").eq("organization_id", s.org.id).eq("user_id", s.userId).single();
  return ok({ email: data?.notify_email ?? true, available: providerStatus("email").configured, eligible: ["owner", "admin", "manager"].includes(s.role ?? "") });
}, { limit: 30 });

export const PATCH = route("notif-pref-set", async (req) => {
  const s = await requireApiSession();
  const b = await parseJson(req, z.object({ email: z.boolean() }));
  if (s.demo) return ok({ demo: true });
  const { error } = await engineDb().from("memberships").update({ notify_email: b.email }).eq("organization_id", s.org.id).eq("user_id", s.userId);
  if (error) throw error;
  return ok({ ok: true });
}, { limit: 20 });
