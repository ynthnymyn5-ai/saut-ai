import "server-only";
import { providerStatus, serverEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { docxToText, normalise } from "./extract";

type DB = NonNullable<ReturnType<typeof import("@/lib/supabase/server").supabaseService>>;
const MAX_TEXT = 200_000;

/** Reads PDF text with the configured OpenAI model (handles Arabic and scanned pages). */
async function pdfToText(buf: Buffer, filename: string): Promise<string> {
  const { models } = await import("@/lib/ai/openai");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: models.chat(),
      max_output_tokens: 16000,
      input: [{
        role: "user",
        content: [
          { type: "input_file", filename: filename.slice(0, 120) || "document.pdf", file_data: `data:application/pdf;base64,${buf.toString("base64")}` },
          { type: "input_text", text: "Extract ALL text from this document verbatim, in its original language(s), in reading order. Render tables as lines with cells separated by ' | '. Output only the text — no commentary, no summary. If the document has no readable text, output exactly: NO_TEXT" },
        ],
      }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const data = (await res.json().catch(() => ({}))) as { output?: { type: string; content?: { type: string; text?: string }[] }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`PDF reading failed: ${data.error?.message ?? res.status}`);
  const text = (data.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("\n");
  return text.trim() === "NO_TEXT" ? "" : text;
}

/**
 * Turns an uploaded PDF/DOCX into searchable text. Marks the document "ready" only when
 * text was actually extracted; otherwise "failed" with a reason the owner can see.
 */
export async function processKnowledgeDocument(db: DB, doc: { id: string; orgId: string; mime: string; name: string; buf: Buffer }) {
  const done = (patch: { status: "ready" | "failed"; content_text?: string; error?: string | null }) =>
    db.from("knowledge_documents").update(patch).eq("id", doc.id).eq("organization_id", doc.orgId);
  try {
    let text = "";
    if (doc.mime.includes("wordprocessingml")) text = docxToText(doc.buf);
    else if (doc.mime === "application/pdf") {
      if (!providerStatus("openai").configured) return await done({ status: "failed", error: "Reading PDFs needs OPENAI_API_KEY. Paste the text instead, or configure OpenAI and re-upload." });
      text = normalise(await pdfToText(doc.buf, doc.name));
    } else return;
    if (text.replace(/\s/g, "").length < 20) return await done({ status: "failed", error: "No readable text was found in this file." });
    await done({ status: "ready", content_text: text.slice(0, MAX_TEXT), error: text.length > MAX_TEXT ? "Only the first 200,000 characters were kept." : null });
  } catch (e) {
    reportError(e, { scope: "knowledge-process", doc: doc.id });
    await done({ status: "failed", error: (e instanceof Error ? e.message : "Could not read this file").slice(0, 500) });
  }
}
