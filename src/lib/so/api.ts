import "server-only";
import { requireApiSession, type MemberRole } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { engineDb } from "./context";

/**
 * Authorization for OS endpoints. Role is checked here (server-side, never trusted from the
 * client); branch scope comes from membership_branches. Data access then uses the service
 * client with explicit organization_id filters, mirroring the RLS rules in 0006.
 */
export async function orgContext(roles?: MemberRole[]) {
  const s = await requireApiSession(roles);
  if (s.demo) return { s, demo: true as const, db: null, branchIds: null as string[] | null, canSeeCustomer: true };
  const sb = (await supabaseServer())!;
  let branchIds: string[] | null = null;
  if (s.role !== "owner" && s.role !== "admin") {
    const { data: m } = await sb.from("memberships").select("id").eq("organization_id", s.org.id).eq("user_id", s.userId).single();
    const { data: rows } = await sb.from("membership_branches").select("branch_id").eq("membership_id", m?.id);
    if (rows?.length) branchIds = rows.map((r) => r.branch_id as string);
  }
  return { s, demo: false as const, db: engineDb(), branchIds, canSeeCustomer: s.role !== "viewer" };
}

export const inBranch = (branchIds: string[] | null, branchId: string | null | undefined) => !branchIds || !branchId || branchIds.includes(branchId);
