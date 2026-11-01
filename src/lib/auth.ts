import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { isDemo } from "@/lib/env";
import { AuthError } from "@/lib/http";
import { DEMO_ORG, DEMO_USER } from "@/lib/demo-data";

import type { MemberRole } from "@/lib/rbac";
export type { MemberRole };

export interface Session {
  userId: string;
  email: string;
  fullName: string | null;
  platformRole: "user" | "admin";
  org: { id: string; name: string; currency: string } | null;
  role: MemberRole | null;
  demo: boolean;
}

/** Returns the current session, or null. In demo mode returns a clearly-flagged demo session. */
export async function getSession(): Promise<Session | null> {
  if (isDemo()) {
    return { ...DEMO_USER, org: DEMO_ORG, role: "owner", demo: true };
  }
  const sb = await supabaseServer();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data: profile } = await sb.from("users").select("full_name, platform_role, status").eq("id", user.id).single();
  if (profile?.status === "suspended") return null;

  const { data: m } = await sb
    .from("memberships")
    .select("role, organizations(id, name, currency, status)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const org = (m?.organizations as unknown as { id: string; name: string; currency: string; status: string } | null) ?? null;
  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    platformRole: (profile?.platform_role as "user" | "admin") ?? "user",
    org: org && org.status !== "suspended" ? { id: org.id, name: org.name, currency: org.currency } : null,
    role: (m?.role as MemberRole) ?? null,
    demo: false,
  };
}

/** For pages: redirect to login if signed out, onboarding if no organization yet. */
export async function requirePageSession() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.org) redirect("/onboarding");
  return s as Session & { org: NonNullable<Session["org"]> };
}

export async function requirePageAdmin() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.platformRole !== "admin" && !s.demo) redirect("/dashboard");
  return s;
}

/** For API routes: throw 401/403 instead of redirecting. */
export async function requireApiSession(roles?: MemberRole[]) {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  if (!s.org) throw new AuthError(403);
  if (roles && (!s.role || !roles.includes(s.role))) throw new AuthError(403);
  return s as Session & { org: NonNullable<Session["org"]> };
}

export async function requireApiAdmin() {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  if (s.platformRole !== "admin") throw new AuthError(403);
  return s;
}
