import "server-only";
import type { DB } from "./context";

/**
 * Knowledge Engine: Postgres full-text search over ready knowledge documents (org + branch
 * scoped), with an ILIKE fallback for short or Arabic-only queries. Returns short excerpts.
 */
export async function searchKnowledge(db: DB, orgId: string, query: string, opts: { branchId?: string | null; limit?: number } = {}) {
  const q = query.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().slice(0, 200);
  if (!q) return [];
  const base = () => {
    let r = db.from("knowledge_documents").select("id, title, content_text, branch_id").eq("organization_id", orgId).eq("status", "ready").not("content_text", "is", null);
    if (opts.branchId) r = r.or(`branch_id.is.null,branch_id.eq.${opts.branchId}`);
    return r;
  };
  let { data } = await base().textSearch("content_text", q.split(/\s+/).slice(0, 8).join(" | "), { config: "simple" }).limit(opts.limit ?? 4);
  if (!data?.length) {
    const word = q.split(/\s+/).sort((a, b) => b.length - a.length)[0];
    ({ data } = await base().ilike("content_text", `%${word}%`).limit(opts.limit ?? 4));
  }
  return (data ?? []).map((d) => ({ id: d.id as string, title: d.title as string, excerpt: excerpt(String(d.content_text), q) }));
}

function excerpt(text: string, q: string, len = 600) {
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const lower = text.toLowerCase();
  const hit = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hit - 150);
  return (start > 0 ? "…" : "") + text.slice(start, start + len).replace(/\s+/g, " ").trim();
}
