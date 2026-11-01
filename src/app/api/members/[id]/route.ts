import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { MANAGE_ORG, assignableRoles, type MemberRole } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

/** Change a member's role (owner/admin). DB triggers keep at least one owner and stop admins granting owner. */
export const PATCH = route("member-role", async (req, ctx) => {
  const s = await requireApiSession(MANAGE_ORG);
  const { role } = await parseJson(req, z.object({ role: z.enum(["owner", "admin", "manager", "employee", "viewer"]) }));
  if (s.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  if (!assignableRoles(s.role).includes(role as MemberRole)) return fail(403, "forbidden", "You can't assign this role");
  const sb = (await supabaseServer())!;
  const { data: target } = await sb.from("memberships").select("id, role, user_id").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!target) return fail(404, "not_found", "Member not found");
  if (target.role === "owner" && s.role !== "owner") return fail(403, "forbidden", "Only an owner can change another owner");
  const { error } = await sb.from("memberships").update({ role }).eq("id", id);
  if (error) return fail(error.message.includes("LAST_OWNER") ? 409 : 400, "update_failed", error.message.replace(/^LAST_OWNER: /, ""));
  await audit({ orgId: s.org.id, actorId: s.userId, action: "member.role_changed", targetType: "membership", targetId: id, metadata: { from: target.role, to: role } });
  return ok({ ok: true });
});

/** Remove a member (owner/admin), or leave the organization yourself. Their account is kept. */
export const DELETE = route("member-remove", async (_req, ctx) => {
  const s = await requireApiSession();
  if (s.demo) return ok({ demo: true });
  const id = z.string().uuid().parse((await ctx.params).id);
  const sb = (await supabaseServer())!;
  const { data: target } = await sb.from("memberships").select("id, role, user_id").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!target) return fail(404, "not_found", "Member not found");
  const self = target.user_id === s.userId;
  if (!self && !MANAGE_ORG.includes(s.role!)) return fail(403, "forbidden", "Only owners and admins can remove members");
  if (!self && target.role === "owner" && s.role !== "owner") return fail(403, "forbidden", "Only an owner can remove another owner");
  // RLS: owners/admins may delete memberships; anyone may delete their own (policy mem_leave).
  const { error } = await sb.from("memberships").delete().eq("id", id);
  if (error) return fail(error.message.includes("LAST_OWNER") ? 409 : 400, "remove_failed", error.message.replace(/^LAST_OWNER: /, ""));
  await audit({ orgId: s.org.id, actorId: s.userId, action: self ? "member.left" : "member.removed", targetType: "membership", targetId: id });
  return ok({ ok: true });
});
