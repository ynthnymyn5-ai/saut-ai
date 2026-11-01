import { KnowledgeView } from "@/components/dashboard/KnowledgeView";
import { requirePageSession } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Knowledge base" };

const DEMO_DOCS = [
  { id: "d1", title: "Layali Café — Menu (Demo).pdf", status: "ready", size: 412_000, created_at: "2026-10-12T10:00:00+03:00" },
  { id: "d2", title: "Reservation policy (Demo).docx", status: "ready", size: 38_000, created_at: "2026-10-12T10:05:00+03:00" },
  { id: "d3", title: "FAQ — parking, delivery, allergies (Demo)", status: "ready", size: 6_000, created_at: "2026-10-14T16:40:00+03:00" },
];

export default async function KnowledgePage() {
  const s = await requirePageSession();
  if (s.demo) return <KnowledgeView docs={DEMO_DOCS} demo />;
  const sb = (await supabaseServer())!;
  const { data } = await sb.from("knowledge_documents").select("id, title, status, size_bytes, created_at, error").eq("organization_id", s.org.id).order("created_at", { ascending: false });
  return <KnowledgeView demo={false} docs={(data ?? []).map((d) => ({ id: d.id, title: d.title, status: d.status, size: Number(d.size_bytes ?? 0), created_at: d.created_at, error: (d.error as string | null) ?? null }))} />;
}
