import { z } from "zod";
import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { AuthError, fail, ok, parseJson, route } from "@/lib/http";
import { reportError } from "@/lib/monitoring";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Plan = { delete: { id: string; name: string }[]; block: { id: string; name: string; reason: "sole_owner" | "subscription_active" }[]; leave: { id: string; name: string }[] };

async function plan(): Promise<{ userId: string; email: string; plan: Plan }> {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  if (s.demo) return { userId: s.userId, email: s.email, plan: { delete: [], block: [], leave: [] } };
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.rpc("account_deletion_plan");
  if (error) throw error;
  return { userId: s.userId, email: s.email, plan: data as Plan };
}

/** What deleting my account would do (businesses deleted / left / blocking). */
export const GET = route("account-plan", async () => ok((await plan()).plan), { limit: 20 });

/**
 * Permanently deletes the signed-in person's account (required by app stores).
 * - Businesses where they are the only member are deleted with all their data.
 * - Businesses with other members are left (their records stay; authorship becomes empty).
 * - Refused while they are the only owner of a team, or a paid subscription is still running
 *   (cancel it in Billing first, so no one is charged for a deleted business).
 */
export const DELETE = route("account-delete", async (req) => {
  await parseJson(req, z.object({ confirm: z.literal("DELETE") }));
  const s = await getSession();
  if (s?.demo) return ok({ demo: true });
  const { userId, plan: p } = await plan();
  if (p.block.length) {
    const why = p.block.map((b) => `${b.name}: ${b.reason === "sole_owner" ? "make another member an owner first" : "cancel the subscription in Billing first"}`).join("; ");
    return fail(409, "blocked", `Your account can't be deleted yet — ${why}.`, { block: p.block });
  }
  const svc = supabaseService();
  if (!svc) return fail(503, "provider_not_configured", "Account deletion needs SUPABASE_SERVICE_ROLE_KEY on the server", { variable: "SUPABASE_SERVICE_ROLE_KEY" });

  // audit first (organization-less row survives the deletions below)
  await audit({ actorId: null, action: "account.deleted", targetType: "user", targetId: userId, metadata: { businesses_deleted: p.delete.map((d) => d.id), businesses_left: p.leave.map((d) => d.id) } });
  const bucket = process.env.SUPABASE_KNOWLEDGE_BUCKET || "knowledge";
  for (const org of p.delete) {
    const { data: files } = await svc.storage.from(bucket).list(org.id, { limit: 1000 });
    if (files?.length) await svc.storage.from(bucket).remove(files.map((f) => `${org.id}/${f.name}`));
    const { error } = await svc.from("organizations").delete().eq("id", org.id);
    if (error) { reportError(error, { scope: "account-delete", org: org.id }); return fail(500, "internal_error", "Could not delete your business data. Nothing else was removed; please contact support."); }
  }
  const { error } = await svc.auth.admin.deleteUser(userId); // cascades to the profile row and memberships
  if (error) { reportError(error, { scope: "account-delete-user" }); return fail(500, "internal_error", "Your business data was removed but the login could not be deleted. Please contact support."); }
  const sb = await supabaseServer();
  await sb?.auth.signOut().catch(() => undefined);
  return ok({ ok: true, deletedBusinesses: p.delete.length, leftBusinesses: p.leave.length });
}, { limit: 5 });
