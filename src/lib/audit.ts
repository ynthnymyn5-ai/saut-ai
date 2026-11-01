import "server-only";
import { supabaseService } from "@/lib/supabase/server";
import { reportError } from "@/lib/monitoring";

export async function audit(entry: {
  orgId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  const sb = supabaseService();
  if (!sb) return; // demo mode
  const { error } = await sb.from("audit_logs").insert({
    organization_id: entry.orgId ?? null,
    actor_id: entry.actorId ?? null,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
  if (error) reportError(error, { scope: "audit" });
}
