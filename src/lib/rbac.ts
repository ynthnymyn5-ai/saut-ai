/**
 * Organization roles and what they may do. Mirrors the SQL role groups in
 * 0008_phase1_foundation.sql (can_manage_ai / can_operate / has_org_role) — the database
 * enforces these with RLS; the API checks them first to return clear 403s.
 *
 *  owner    — everything, including ownership transfer and billing cancellation
 *  admin    — organization profile, members (not owner role), integrations, billing
 *  manager  — AI employees, instructions, automations, analytics, approvals
 *  employee — customers, conversations, appointments, knowledge uploads
 *  agent    — legacy name for employee
 *  viewer   — read-only
 */
export type MemberRole = "owner" | "admin" | "manager" | "employee" | "agent" | "viewer";

export const MANAGE_ORG: MemberRole[] = ["owner", "admin"];
export const MANAGE_AI: MemberRole[] = ["owner", "admin", "manager"];
export const OPERATE: MemberRole[] = ["owner", "admin", "manager", "employee", "agent"];
export const ANY_MEMBER: MemberRole[] = ["owner", "admin", "manager", "employee", "agent", "viewer"];

export const can = (role: MemberRole | null | undefined, group: MemberRole[]) => !!role && group.includes(role);

/** Roles a member may assign to others. Only owners hand out ownership. */
export function assignableRoles(actor: MemberRole | null | undefined): MemberRole[] {
  if (actor === "owner") return ["owner", "admin", "manager", "employee", "viewer"];
  if (actor === "admin") return ["admin", "manager", "employee", "viewer"];
  return [];
}

export const ROLE_LABELS: Record<MemberRole, { en: string; ar: string }> = {
  owner: { en: "Owner", ar: "المالك" },
  admin: { en: "Admin", ar: "مدير النظام" },
  manager: { en: "Manager", ar: "مدير" },
  employee: { en: "Employee", ar: "موظف" },
  agent: { en: "Employee", ar: "موظف" },
  viewer: { en: "Viewer", ar: "مشاهد" },
};
