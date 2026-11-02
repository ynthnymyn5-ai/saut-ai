import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { providerStatus, ProviderRequestError, serverEnv, ProviderNotConfiguredError } from "@/lib/env";
import { fail, ok, route } from "@/lib/http";
import { MENU_IMPORT_MAX_BYTES, MENU_IMPORT_TYPES, normalizeMenuItems } from "@/lib/menu-import";
import { MANAGE_AI } from "@/lib/rbac";
import { engineDb } from "@/lib/so/context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "description", "price", "currency"],
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          price: { type: ["string", "null"], description: "The price exactly as printed, e.g. '1.500' or '1.500 KD'. null if not clearly printed." },
          currency: { type: ["string", "null"] },
        },
      },
    },
  },
};

/** Reads a menu photo/PDF with the AI and returns a PREVIEW. Nothing is saved here. */
export const POST = route("products-import", async (req) => {
  const s = await requireApiSession(MANAGE_AI);
  if (s.demo) return ok({ demo: true, items: [] });
  if (!providerStatus("openai").configured) throw new ProviderNotConfiguredError("OPENAI_API_KEY");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(422, "invalid_input", "Choose a photo or PDF of your menu");
  if (!(MENU_IMPORT_TYPES as readonly string[]).includes(file.type)) return fail(415, "unsupported_type", "Use a JPG, PNG, WEBP photo or a PDF");
  if (file.size === 0 || file.size > MENU_IMPORT_MAX_BYTES) return fail(413, "too_large", "The file must be under 10 MB");
  const hint = z.string().max(200).optional().parse(form.get("hint") ?? undefined);

  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const media = file.type === "application/pdf"
    ? { type: "input_file", filename: file.name.slice(0, 120) || "menu.pdf", file_data: `data:application/pdf;base64,${b64}` }
    : { type: "input_image", image_url: `data:${file.type};base64,${b64}` };
  const { models } = await import("@/lib/ai/openai");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${serverEnv("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: models.chat(),
      max_output_tokens: 8000,
      text: { format: { type: "json_schema", name: "menu", strict: true, schema: SCHEMA } },
      input: [{ role: "user", content: [media, { type: "input_text", text:
        "List every product or menu item in this menu exactly as written (keep Arabic names in Arabic). " +
        "For each: name, short description if printed (else null), price EXACTLY as printed for that item (else null — never estimate), currency if shown (KD/د.ك = KWD). " +
        "Ignore headings, addresses and phone numbers." + (hint ? ` Note from the owner: ${hint}` : "") }] }],
    }),
    signal: AbortSignal.timeout(55_000),
  });
  const data = (await res.json().catch(() => ({}))) as { output?: { content?: { type: string; text?: string }[] }[]; error?: { message?: string }; usage?: { total_tokens?: number } };
  if (!res.ok) throw new ProviderRequestError("OpenAI", res.status, data.error?.message ?? `HTTP ${res.status}`);
  const text = (data.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "{}";
  let parsed: unknown = {};
  try { parsed = JSON.parse(text); } catch { return fail(502, "provider_error", "The menu couldn't be read. Try a clearer photo."); }
  const items = normalizeMenuItems(parsed, s.org.currency || "KWD");
  if (data.usage?.total_tokens) {
    await engineDb().from("usage_records").insert({ organization_id: s.org.id, metric: "ai_tokens", quantity: data.usage.total_tokens, period_start: new Date().toISOString().slice(0, 10) });
  }
  return ok({ items, missingPrices: items.filter((i) => i.price === null).length });
}, { limit: 6 });
