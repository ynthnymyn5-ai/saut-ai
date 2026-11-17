/** Append-only activity log of everything Mira (or the owner) did. */
import { db, schema } from "../db";

export async function logActivity(entry: {
  action: string;
  summary: string;
  agentId?: string | null;
  actor?: "mira" | "user" | "system";
  status?: "success" | "failed" | "pending" | "cancelled";
  details?: unknown;
}) {
  try {
    await db.insert(schema.activityLog).values({
      action: entry.action,
      summary: entry.summary,
      agentId: entry.agentId ?? null,
      actor: entry.actor ?? "mira",
      status: entry.status ?? "success",
      details: (entry.details ?? null) as object | null,
    });
  } catch (e) {
    console.error("[activity] failed to log", e);
  }
}
