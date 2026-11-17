/**
 * Offline fallback provider, used when OPENAI_API_KEY is missing.
 *
 * It is NOT a language model: it pattern-matches common commands (English and
 * Arabic) onto Sanad's tools so every screen and flow can be tested without an
 * API key. Replies say clearly that Sanad is running in offline mode.
 */
import type { ChatRequest, ChatResult, LLMProvider, ToolCall } from "./types";
import { EMBEDDING_DIMS } from "../db/schema";

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

/** Ordered intent rules: first match wins. `tool` must be in the request's tool list. */
const INTENTS: { re: RegExp; tool: string; args: (text: string) => Record<string, unknown> }[] = [
  { re: /(add|create|new) (a )?task|remind me to|أضف مهمة|اضف مهمة|ذكرني|ذكّرني/i, tool: "add_task", args: (t) => ({ title: extractTaskTitle(t), dueAt: t, priority: /urgent|عاجل/i.test(t) ? "urgent" : "medium" }) },
  { re: /^remember|remember that|تذكر أن|تذكري أن|احفظ/i, tool: "save_memory", args: (t) => ({ content: t.replace(/^(please )?(remember( that)?|تذكر(ي)? أن|احفظ(ي)?)\s*/i, ""), kind: "fact" }) },
  { re: /what do you (know|remember)|ماذا تعرف|ماذا تعرفين|شو تعرف/i, tool: "search_memory", args: (t) => ({ query: t }) },
  { re: /brief|morning|موجز|ملخص اليوم/i, tool: "get_daily_brief", args: () => ({}) },
  { re: /meeting|schedule|calendar|agenda|اجتماع|مواعيد|موعد|جدول/i, tool: "calendar_list_events", args: (t) => ({ range: /tomorrow|غد|بكرة/i.test(t) ? "tomorrow" : /week|أسبوع/i.test(t) ? "week" : "today" }) },
  { re: /e-?mail|inbox|\bmail\b|بريد|إيميل|ايميل|رسائل/i, tool: "gmail_list_messages", args: () => ({ unreadOnly: true, limit: 10 }) },
  { re: /spen[dt]|expense|cost|مصروف|مصاريف|صرفت|أنفقت|income|revenue|profit|دخل|إيراد|ربح/i, tool: "finance_summary", args: () => ({ period: "this_month" }) },
  { re: /invoice|فاتورة|فواتير/i, tool: "list_invoices", args: () => ({}) },
  { re: /caption|instagram|post|tiktok|منشور|كابشن|انستغرام|انستقرام/i, tool: "save_content_item", args: (t) => localCaption(t) },
  { re: /lead|pipeline|deal|client|follow.?up|عميل|عملاء|صفقة|متابعة/i, tool: "list_leads", args: () => ({}) },
  { re: /task|to-?do|kanban|مهام|المهام|مهمة/i, tool: "list_tasks", args: () => ({ status: "open" }) },
];

/** Which agent owns a tool — used to route through delegate_* tools. */
const TOOL_AGENT: Record<string, string> = {
  add_task: "operations", list_tasks: "operations", calendar_list_events: "operations",
  save_memory: "memory", search_memory: "memory",
  finance_summary: "finance", list_invoices: "finance",
  save_content_item: "marketing", list_leads: "sales",
  gmail_list_messages: "chief", get_daily_brief: "chief",
};

function extractTaskTitle(t: string): string {
  let s = t
    .replace(/^(please\s+)?(add|create|new)\s+(a\s+)?task\s*(to\s+)?/i, "")
    .replace(/^(please\s+)?remind me to\s+/i, "")
    .replace(/^(أضف|اضف)\s+مهمة\s*(لـ|ل)?\s*/, "")
    .replace(/^ذكّ?رني\s*(أن|ب)?\s*/, "");
  s = s.replace(/\s+(today|tomorrow|tonight|on \w+day|at \d.*|in \d+ days?)\b.*$/i, "").replace(/\s+(اليوم|غداً|غدا|بكرة|الساعة).*$/, "");
  return (s.trim() || t).replace(/[.؟?!]+$/, "");
}

function localCaption(t: string): Record<string, unknown> {
  const ar = isArabic(t);
  const caption = ar
    ? "✨ وصل الجديد! صُمّم ليجعل يومك أسهل وأجمل. اكتشفه الآن والرابط في البايو 💜\n#جديد #إطلاق #الكويت"
    : "✨ Something new just dropped. Designed to make your day easier — and look good doing it. Tap the link in bio to see it first 💜\n#NewLaunch #JustDropped #ShopSmall";
  return { title: ar ? "منشور إطلاق المنتج الجديد" : "New product launch post", platform: "instagram", caption, status: "draft" };
}

function lastUserIndex(req: ChatRequest) {
  for (let i = req.messages.length - 1; i >= 0; i--) if (req.messages[i].role === "user") return i;
  return -1;
}

export class LocalProvider implements LLMProvider {
  readonly name = "local (offline)";
  readonly isReal = false;
  readonly supportsVoice = false;

  async chat(req: ChatRequest): Promise<ChatResult> {
    const ui = lastUserIndex(req);
    const userText = ui >= 0 ? String(req.messages[ui].content ?? "") : "";
    const ar = isArabic(userText);

    // JSON requests (memory extraction, routing) — return a minimal valid object
    if (req.json) return { content: JSON.stringify(localJson(req, userText)), toolCalls: [] };

    // Tool results already present after the user's message → write the reply
    const after = req.messages.slice(ui + 1).filter((m) => m.role === "tool");
    if (after.length) {
      const summaries = after.map((m) => {
        try {
          const parsed = JSON.parse(m.content ?? "{}");
          return parsed.say ?? parsed.summary ?? parsed.reply ?? parsed.message ?? (typeof parsed === "string" ? parsed : "");
        } catch {
          return m.content ?? "";
        }
      });
      return { content: summaries.filter(Boolean).join("\n\n") || (ar ? "تم." : "Done."), toolCalls: [] };
    }

    const available = new Set((req.tools ?? []).map((t) => t.name));
    for (const intent of INTENTS) {
      if (!intent.re.test(userText)) continue;
      const call: ToolCall = { id: `local_${Date.now()}`, name: intent.tool, args: intent.args(userText) };
      if (available.has(intent.tool)) return { content: null, toolCalls: [call] };
      const delegate = `delegate_to_${TOOL_AGENT[intent.tool]}`;
      if (available.has(delegate)) return { content: null, toolCalls: [{ id: call.id, name: delegate, args: { request: userText } }] };
    }

    return {
      content: ar
        ? "أنا سند، أعمل الآن في الوضع غير المتصل (بدون مفتاح OpenAI)، لذا أفهم أوامر محددة فقط: إضافة مهمة، اجتماعات اليوم، البريد غير المقروء، مصاريف هذا الشهر، العملاء، كتابة منشور، أو \"تذكّر أن…\". أضف OPENAI_API_KEY في Secrets لتفعيل المحادثة الكاملة."
        : "I'm Sanad, running in offline mode (no OpenAI key yet), so I only understand specific commands: add a task, today's meetings, unread emails, this month's spending, leads, write a caption, or \"remember that…\". Add OPENAI_API_KEY in Secrets to unlock full conversation.",
      toolCalls: [],
    };
  }

  /** Deterministic hashed bag-of-words embedding — good enough for keyword-ish recall offline. */
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const v = new Array(EMBEDDING_DIMS).fill(0);
      const tokens = text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
      for (const tok of tokens) {
        if (tok.length < 2) continue;
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) h = Math.imul(h ^ tok.charCodeAt(i), 16777619);
        v[Math.abs(h) % EMBEDDING_DIMS] += 1;
      }
      const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
      return v.map((x) => x / norm);
    });
  }

  async transcribe(): Promise<{ text: string; language?: string }> {
    throw new Error("Speech-to-text needs OPENAI_API_KEY (the browser's built-in recogniser is used instead).");
  }

  async speak(): Promise<Buffer> {
    throw new Error("Text-to-speech needs OPENAI_API_KEY (the browser's built-in voice is used instead).");
  }
}

function localJson(req: ChatRequest, userText: string): Record<string, unknown> {
  const sys = String(req.messages[0]?.content ?? "");
  if (sys.includes("MEMORY_EXTRACTION")) {
    // Only capture explicit self-statements offline
    const facts: { content: string; kind: string }[] = [];
    const m = userText.match(/\b(my name is|i am|i'm|i prefer|i like|i don't like|my business|my company)\b(.{3,160})/i);
    if (m) facts.push({ content: `${m[1]}${m[2]}`.replace(/^my /i, "Owner's ").replace(/^i /i, "Owner "), kind: /prefer|like/i.test(m[1]) ? "preference" : "fact" });
    const ar = userText.match(/(اسمي|أنا أفضل|أفضّل|شركتي|مشروعي)(.{3,160})/);
    if (ar) facts.push({ content: `${ar[1]}${ar[2]}`, kind: "fact" });
    return { facts };
  }
  if (sys.includes("TITLE")) return { title: userText.slice(0, 48) || "Conversation" };
  return {};
}
