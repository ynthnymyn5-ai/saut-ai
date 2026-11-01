import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { runJob } from "@/lib/jobs";
import { MANAGE_AI } from "@/lib/rbac";
import { engineDb } from "@/lib/so/context";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Outbound deliveries waiting for retry or that failed permanently (owners/admins/managers). */
export const GET = route("deliveries-list", async () => {
  const s = await requireApiSession(MANAGE_AI);
  if (s.demo) return ok({ demo: true, jobs: [] });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("outbound_jobs").select("id, kind, status, attempts, max_attempts, last_error, next_attempt_at, created_at, conversation_id, payload")
    .eq("organization_id", s.org.id).in("status", ["pending", "dead"]).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return ok({
    jobs: (data ?? []).map((j) => {
      const p = j.payload as { to?: string | string[]; parts?: string[]; subject?: string };
      const to = Array.isArray(p.to) ? p.to.join(", ") : p.to ?? "";
      return { id: j.id, kind: j.kind, status: j.status, attempts: j.attempts, maxAttempts: j.max_attempts, error: j.last_error, nextAt: j.next_attempt_at, at: j.created_at, conversationId: j.conversation_id,
        to: j.kind === "whatsapp_text" ? to.replace(/\d(?=\d{4})/g, "•") : to, preview: (p.parts?.join(" ") ?? p.subject ?? "").slice(0, 120) };
    }),
  });
}, { limit: 60 });

const act = z.object({ id: z.string().uuid(), action: z.enum(["retry", "dismiss"]) });

/** Retry a failed delivery now, or dismiss it. */
export const PATCH = route("deliveries-act", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  const b = await parseJson(req, act);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const upd = b.action === "dismiss" ? { status: "dismissed" } : { status: "pending", attempts: 0, next_attempt_at: new Date().toISOString() };
  const { data, error } = await sb.from("outbound_jobs").update(upd).eq("id", b.id).eq("organization_id", s.org.id).in("status", ["pending", "dead"]).select("id, organization_id, kind, payload, attempts, max_attempts, message_id").maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Delivery not found");
  await audit({ orgId: s.org.id, actorId: s.userId, action: `delivery.${b.action}`, targetType: "outbound_job", targetId: b.id });
  if (b.action === "dismiss") return ok({ ok: true });
  const sent = await runJob(engineDb(), data as never);
  return ok({ ok: true, sent });
}, { limit: 20 });
