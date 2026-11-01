import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { route } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase/server";

const cell = (v: unknown) => {
  const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Server-side CSV export of the full CRM (owner/admin only; audited). */
export const GET = route("customers-export", async () => {
  const s = await requireApiSession(["owner", "admin"]);
  if (s.demo) return new Response("Demo mode: export from the Customers page.", { status: 400 });
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("customers").select("full_name, phone, email, tags, notes, marketing_consent, last_contact_at, created_at").eq("organization_id", s.org.id).limit(50000);
  if (error) throw error;
  const head = ["full_name", "phone", "email", "tags", "notes", "marketing_consent", "last_contact_at", "created_at"];
  const csv = "﻿" + [head.join(","), ...(data ?? []).map((r) => head.map((h) => cell((r as Record<string, unknown>)[h])).join(","))].join("\n");
  await audit({ orgId: s.org.id, actorId: s.userId, action: "customers.exported", metadata: { rows: data?.length ?? 0 } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="saut-customers.csv"' } });
}, { limit: 5 });
