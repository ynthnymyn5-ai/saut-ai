import { requireApiSession } from "@/lib/auth";
import { fail, ok, route } from "@/lib/http";
import { ANY_MEMBER } from "@/lib/rbac";

const MAX = 8 * 1024 * 1024;
const TYPES = /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|m4a|x-m4a|aac)/;

/** Voice command → text (OpenAI speech-to-text; Gulf Arabic and English). Audio is not stored. */
export const POST = route("assistant-listen", async (req) => {
  await requireApiSession(ANY_MEMBER);
  const form = await req.formData();
  const file = form.get("audio");
  const lang = form.get("locale") === "en" ? "en" : "ar";
  if (!(file instanceof File)) return fail(422, "invalid_input", "No audio");
  if (file.size === 0 || file.size > MAX) return fail(413, "too_large", "Recording must be under 8 MB");
  const type = (file.type || "").split(";")[0];
  if (!TYPES.test(type)) return fail(415, "unsupported_type", "Unsupported audio format");
  const { openai, models } = await import("@/lib/ai/openai");
  const { toFile } = await import("openai");
  const ext = type.includes("mp4") || type.includes("m4a") || type.includes("aac") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") || type.includes("mp3") ? "mp3" : "webm";
  const r = await openai().audio.transcriptions.create({
    file: await toFile(Buffer.from(await file.arrayBuffer()), `command.${ext}`, { type }),
    model: models.stt(),
    language: lang,
    prompt: lang === "ar" ? "أوامر لتطبيق صوت: افتح المواعيد، كم مكالمة اليوم، حالة الموظفين." : "Commands for the SAUT AI app: open appointments, how many calls today.",
  });
  return ok({ text: (r.text ?? "").trim() });
}, { limit: 30 });
