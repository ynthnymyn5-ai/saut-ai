import { OPERATE } from "@/lib/rbac";
import { after } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/http";
import { processKnowledgeDocument } from "@/lib/knowledge/process";
import { supabaseServer, supabaseService } from "@/lib/supabase/server";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/validation";

const textSchema = z.object({ title: z.string().trim().min(1).max(200), text: z.string().trim().min(5).max(20000) });

/** Magic-byte checks so a renamed executable can't masquerade as a PDF/DOCX. */
async function sniff(file: File) {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // PK (docx)
  if (file.type === "application/pdf") return isPdf;
  if (file.type.includes("wordprocessingml")) return isZip;
  // text types: reject if binary NUL bytes appear in the first chunk
  const chunk = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  return !chunk.includes(0);
}

export const POST = route("knowledge-upload", async (req) => {
  const s = await requireApiSession(OPERATE);
  const sb = s.demo ? null : (await supabaseServer())!;

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = textSchema.parse(await req.json());
    if (!sb) return ok({ demo: true });
    const { data, error } = await sb.from("knowledge_documents").insert({ organization_id: s.org.id, title: body.title, source_type: "faq", content_text: body.text, size_bytes: body.text.length, status: "ready", created_by: s.userId }).select("id, title, status, size_bytes, created_at").single();
    if (error) throw error;
    return ok({ document: { ...data, size: data.size_bytes } }, 201);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(422, "invalid_input", "No file");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return fail(413, "too_large", "Files must be under 20 MB");
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) return fail(415, "unsupported_type", "Allowed: PDF, DOCX, TXT, MD, CSV");
  if (!(await sniff(file))) return fail(415, "content_mismatch", "File content doesn't match its type");
  if (!sb) return ok({ demo: true });

  const safeName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
  const path = `${s.org.id}/${crypto.randomUUID()}-${safeName}`;
  const bucket = process.env.SUPABASE_KNOWLEDGE_BUCKET || "knowledge";
  const { error: upErr } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const isText = file.type.startsWith("text/");
  const { data, error } = await sb
    .from("knowledge_documents")
    .insert({
      organization_id: s.org.id, title: file.name.slice(0, 200), source_type: "file", storage_path: path, mime_type: file.type, size_bytes: file.size,
      content_text: isText ? (await file.text()).slice(0, 200000) : null,
      status: isText ? "ready" : "processing", // PDF/DOCX: text extracted below, after the response
      created_by: s.userId,
    })
    .select("id, title, status, size_bytes, created_at")
    .single();
  if (error) throw error;
  await audit({ orgId: s.org.id, actorId: s.userId, action: "knowledge.uploaded", targetType: "knowledge_document", targetId: data.id });
  if (!isText) {
    // Extraction can take a while for long PDFs, so it runs after the response is sent.
    // It writes with the service role but only to this org's document row.
    const svc = supabaseService();
    const buf = Buffer.from(await file.arrayBuffer());
    const orgId = s.org.id, mime = file.type, name = file.name;
    if (svc) after(() => processKnowledgeDocument(svc, { id: data.id, orgId, mime, name, buf }));
  }
  return ok({ document: { ...data, size: data.size_bytes } }, 201);
}, { limit: 20 });
