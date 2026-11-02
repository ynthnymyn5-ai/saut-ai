import type { EmployeeInput } from "@/lib/validation";
import { FOCUSED_CHAT, GENERAL_CHAT } from "@/lib/so/templates";

const DIALECT_GUIDE: Record<string, string> = {
  kuwaiti: "Speak in natural Kuwaiti Arabic (e.g. شلونك، أبي، وايد، إي نعم، تامر أمر). Keep it warm and hospitable.",
  saudi: "Speak in natural Saudi (Najdi/Hijazi-neutral) Arabic (e.g. وش تبي، أبشر، زين، حياك الله).",
  emirati: "Speak in natural Emirati Arabic (e.g. شحالك، أبا، وايد، مرحبا الساع).",
  msa: "Speak in clear, polite Modern Standard Arabic.",
  english: "Speak in clear, friendly English. If the customer speaks Arabic, switch to Gulf Arabic.",
};

const TASK_GUIDE: Record<string, string> = {
  answer_calls: "Answer incoming phone calls promptly and greet the caller with the business name.",
  answer_faq: "Answer frequently asked questions using ONLY the business information and knowledge base provided.",
  book_appointments: "Book appointments: collect name, phone, preferred date/time, and service; then call the `book_appointment` tool.",
  restaurant_reservations: "Take reservations: collect name, phone, date, time and party size; then call `book_appointment` with kind=reservation.",
  collect_info: "Politely collect the customer's name and phone number and save them with `save_customer`.",
  whatsapp_followup: "Offer to send confirmations via WhatsApp using `send_whatsapp` — only if the customer agrees.",
  summarize: "At the end, produce a one-sentence summary of the conversation.",
  escalate: "If the request is complex, sensitive, a complaint, or the customer asks for a person, call `transfer_to_human`.",
};

/** Builds the system prompt for an AI employee. Shared by chat, realtime voice and telephony. */
export function buildSystemPrompt(e: Partial<EmployeeInput>, knowledge: string[] = []) {
  const p = e.personality ?? { warmth: 70, formality: 50, pace: 50, tone: "friendly" };
  const b = e.businessInfo ?? { businessName: "the business", description: "", address: "", hours: "", faqs: "" };
  return [
    `You are ${e.name ?? "SO"}, an AI employee for ${b.businessName} powered by SAUT AI.`,
    `Industry: ${e.industry ?? "other"}.`,
    DIALECT_GUIDE[e.dialect ?? "kuwaiti"],
    `Personality: tone=${p.tone}; warmth ${p.warmth}/100; formality ${p.formality}/100; speaking pace ${p.pace}/100.`,
    "Keep replies short (1–3 sentences) because they are spoken aloud. Ask one question at a time.",
    "Never invent prices, availability or policies. If you don't know, say so and offer to transfer or take a message.",
    "Never claim an action succeeded (booking, message sent) unless the tool result confirms it.",
    "You are an AI — if asked, say so honestly.",
    (p as { general_chat?: boolean }).general_chat === false ? FOCUSED_CHAT : GENERAL_CHAT,
    "",
    "Tasks:",
    ...(e.tasks ?? ["answer_faq"]).map((t) => `- ${TASK_GUIDE[t]}`),
    "",
    "Business information:",
    b.description && `About: ${b.description}`,
    b.address && `Address: ${b.address}`,
    b.hours && `Opening hours: ${b.hours}`,
    b.faqs && `FAQs:\n${b.faqs}`,
    knowledge.length ? `\nKnowledge base excerpts:\n${knowledge.join("\n---\n")}` : "",
    e.instructions ? `\nOwner's custom instructions:\n${e.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Tool definitions the model may call. Execution happens server-side with real providers. */
export const AI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "book_appointment",
      description: "Create an appointment or reservation for the customer.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          phone: { type: "string" },
          starts_at: { type: "string", description: "ISO 8601 datetime in Asia/Kuwait" },
          kind: { type: "string", enum: ["appointment", "reservation", "viewing", "callback"] },
          party_size: { type: "integer" },
          notes: { type: "string" },
        },
        required: ["customer_name", "phone", "starts_at", "kind"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "save_customer",
      description: "Save or update customer contact details.",
      parameters: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, notes: { type: "string" } }, required: ["phone"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_whatsapp",
      description: "Send a WhatsApp message to the customer (only if they agreed).",
      parameters: { type: "object", properties: { to: { type: "string" }, text: { type: "string" } }, required: ["to", "text"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "transfer_to_human",
      description: "Escalate to a human staff member.",
      parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] },
    },
  },
];
