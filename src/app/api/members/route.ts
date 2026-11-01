import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { fail, ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, MANAGE_ORG, assignableRoles, type MemberRole } from "@/lib/rbac";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";

/** Team list (every member can see who is on the team). */
export const GET = route("members-list", async () => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, members: [{ id: "m1", user_id: s.userId, role: "owner", full_name: s.fullName, email: s.email, created_at: "2026-05-02" }], me: s.userId, myRole: s.role });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("memberships").select("id, user_id, role, created_at, users(full_name, email)").eq("organization_id", s.org.id).order("created_at");
  if (error) throw error;
  return ok({
    members: (data ?? []).map((m) => { const u = m.users as unknown as { full_name: string | null; email: string } | null; return { id: m.id, user_id: m.user_id, role: m.role, created_at: m.created_at, full_name: u?.full_name ?? null, email: u?.email ?? "" }; }),
    me: s.userId, myRole: s.role, assignable: assignableRoles(s.role),
  });
});

/**
 * Invite by email (owner/admin). Existing SAUT AI users are added directly; new people receive
 * a Supabase invitation email and become members once the auth user exists. The service-role
 * client is used only here, after the role check, to look up/invite the auth user.
 */
export const POST = route("members-invite", async (req) => {
  const s = await requireApiSession(MANAGE_ORG);
  const b = await parseJson(req, z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(["owner", "admin", "manager", "employee", "viewer"]) }));
  if (s.demo) return ok({ demo: true });
  if (!assignableRoles(s.role).includes(b.role as MemberRole)) return fail(403, "forbidden", "You can't assign this role");
  const admin = supabaseService();
  if (!admin) return fail(503, "provider_not_configured", "Inviting members needs the server key", { variable: "SUPABASE_SERVICE_ROLE_KEY" });

  let { data: user } = await admin.from("users").select("id").eq("email", b.email).maybeSingle();
  let invited = false;
  if (!user) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(b.email, { redirectTo: `${publicEnv.appUrl}/auth/callback?next=/reset-password` });
    if (error) return fail(400, "invite_failed", error.message);
    invited = true;
    // handle_new_user() creates the profile row synchronously with the auth user
    user = { id: data.user.id };
  }
  // Insert as the signed-in user so RLS + owner-grant triggers apply
  const sb = (await supabaseServer())!;
  const { error } = await sb.from("memberships").insert({ organization_id: s.org.id, user_id: user.id, role: b.role });
  if (error) {
    if (error.code === "23505") return fail(409, "already_member", "This person is already a member");
    throw error;
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "member.added", targetType: "user", targetId: user.id, metadata: { role: b.role, invited } });
  return ok({ ok: true, invited }, 201);
}, { limit: 10 });
