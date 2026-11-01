import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, parseJson, route } from "@/lib/http";
import { ANY_MEMBER, MANAGE_AI } from "@/lib/rbac";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const idSchema = z.string().uuid();

/** One knowledge source with its text, so owners can review what the AI will use. */
export const GET = route("knowledge-get", async (_req, { params }) => {
  const s = await requireApiSession(ANY_MEMBER);
  const id = idSchema.parse((await params).id);
  if (s.demo) return fail(404, "not_found", "Not found");
  const sb = (await supabaseServer())!;
  const { data, error } = await sb.from("knowledge_documents").select("id, title, source_type, status, error, content_text, mime_type, size_bytes, created_at")
    .eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (error) throw error;
  if (!data) return fail(404, "not_found", "Not found");
  return ok({ document: { ...data, content_text: (data.content_text ?? "").slice(0, 50000), truncated: (data.content_text ?? "").length > 50000 } });
}, { limit: 60 });

const patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  text: z.string().trim().min(5).max(20000).optional(),
}).refine((v) => v.title !== undefined || v.text !== undefined, "Nothing to update");

/** Rename any source; edit the text of typed (FAQ / text) sources. Uploaded files are re-uploaded instead. */
export const PATCH = route("knowledge-update", async (req, { params }) => {
  const s = await requireApiSession(MANAGE_AI);
  const id = idSchema.parse((await params).id);
  const b = await parseJson(req, patch);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data: doc } = await sb.from("knowledge_documents").select("source_type").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!doc) return fail(404, "not_found", "Not found");
  const upd: Record<string, unknown> = {};
  if (b.title) upd.title = b.title;
  if (b.text !== undefined) {
    if (doc.source_type === "file") return fail(409, "not_editable", "Uploaded files can't be edited here. Upload a corrected file and delete the old one.");
    Object.assign(upd, { content_text: b.text, size_bytes: b.text.length, status: "ready", error: null });
  }
  const { error } = await sb.from("knowledge_documents").update(upd).eq("id", id).eq("organization_id", s.org.id);
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "knowledge.updated", targetType: "knowledge_document", targetId: id, metadata: { fields: Object.keys(upd) } });
  return ok({ ok: true });
}, { limit: 30 });

/** Removes a source and its stored file. The AI stops using it immediately. */
export const DELETE = route("knowledge-delete", async (_req, { params }) => {
  const s = await requireApiSession(MANAGE_AI);
  const id = idSchema.parse((await params).id);
  if (s.demo) return ok({ demo: true });
  const sb = (await supabaseServer())!;
  const { data: doc } = await sb.from("knowledge_documents").select("id, title, storage_path").eq("id", id).eq("organization_id", s.org.id).maybeSingle();
  if (!doc) return fail(404, "not_found", "Not found");
  const { error } = await sb.from("knowledge_documents").delete().eq("id", id).eq("organization_id", s.org.id);
  if (error) throw error;
  if (doc.storage_path?.startsWith(`${s.org.id}/`)) {
    await sb.storage.from(process.env.SUPABASE_KNOWLEDGE_BUCKET || "knowledge").remove([doc.storage_path]); // best effort; the row is already gone
  }
  await audit({ orgId: s.org.id, actorId: s.userId, action: "knowledge.deleted", targetType: "knowledge_document", targetId: id, metadata: { title: doc.title } });
  return ok({ ok: true });
}, { limit: 30 });
