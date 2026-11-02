import { requireApiSession } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const STATUSES = ["active", "completed", "transferred", "abandoned"];
const CHANNELS = ["phone", "whatsapp", "web_chat", "email"];

/**
 * Unified inbox. Filters: status, channel, assigned=me|unassigned, unread=1, q (name, phone or summary).
 * RLS limits rows to the caller's organization and branches. Test-chat conversations are excluded.
 */
export const GET = route("conversations-list", async (req) => {
  const s = await requireApiSession(ANY_MEMBER);
  if (s.demo) return ok({ demo: true, conversations: [] });
  const u = new URL(req.url);
  const status = u.searchParams.get("status"), channel = u.searchParams.get("channel"), assigned = u.searchParams.get("assigned");
  const unread = u.searchParams.get("unread") === "1";
  const q = (u.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);
  const sb = (await supabaseServer())!;
  let query = sb.from("conversations")
    .select("id, channel, status, summary, sentiment, intent, started_at, last_activity_at, staff_read_at, handled_by, assigned_user, rating, customer_id, customers(full_name, phone), ai_employees(name)")
    .eq("organization_id", s.org.id).neq("channel", "test").order("last_activity_at", { ascending: false, nullsFirst: false }).limit(300);
  if (status && STATUSES.includes(status)) query = query.eq("status", status);
  if (channel && CHANNELS.includes(channel)) query = query.eq("channel", channel);
  if (assigned === "me") query = query.eq("assigned_user", s.userId);
  if (assigned === "unassigned") query = query.is("assigned_user", null);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map((c) => {
    const cu = c.customers as unknown as { full_name: string | null; phone: string | null } | null;
    const last = c.last_activity_at ?? c.started_at;
    return {
      id: c.id, channel: c.channel, status: c.status, summary: c.summary ?? "", sentiment: c.sentiment ?? "neutral", intent: c.intent, at: last, started_at: c.started_at,
      handledBy: c.handled_by, assignedUser: c.assigned_user, rating: c.rating as 1 | -1 | null,
      unread: !c.staff_read_at || new Date(c.staff_read_at) < new Date(last),
      customer: { id: c.customer_id, name: cu?.full_name ?? null, phone: s.role === "viewer" ? null : cu?.phone ?? null },
      employee: (c.ai_employees as unknown as { name: string } | null)?.name ?? null,
    };
  }).filter((r) => (!unread || r.unread) && (!q || `${r.customer.name ?? ""} ${r.customer.phone ?? ""} ${r.summary}`.toLowerCase().includes(q)));
  return ok({ conversations: rows.slice(0, 200), unreadCount: rows.filter((r) => r.unread).length });
}, { limit: 90 });
