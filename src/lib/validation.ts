import { z } from "zod";

export const INDUSTRIES = ["restaurant", "clinic", "real_estate", "online_store", "beauty_salon", "hotel", "customer_support", "other"] as const;
export const DIALECTS = ["kuwaiti", "saudi", "emirati", "msa", "english"] as const;
export const VOICES = ["alloy", "ash", "coral", "sage", "verse", "shimmer"] as const;
export const TASKS = ["answer_calls", "answer_faq", "book_appointments", "restaurant_reservations", "collect_info", "whatsapp_followup", "summarize", "escalate"] as const;

const phone = z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "Invalid phone number");

export const employeeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  industry: z.enum(INDUSTRIES),
  voice: z.enum(VOICES),
  dialect: z.enum(DIALECTS),
  personality: z.object({
    warmth: z.number().int().min(0).max(100),
    formality: z.number().int().min(0).max(100),
    pace: z.number().int().min(0).max(100),
    tone: z.enum(["friendly", "professional", "luxury", "energetic"]),
    general_chat: z.boolean().optional(),
  }),
  businessInfo: z.object({
    businessName: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).default(""),
    address: z.string().trim().max(300).default(""),
    hours: z.string().trim().max(300).default(""),
    faqs: z.string().trim().max(8000).default(""),
  }),
  tasks: z.array(z.enum(TASKS)).min(1),
  instructions: z.string().trim().max(20000).default(""),
  transferNumber: phone.optional().or(z.literal("")),
  activate: z.boolean().default(false),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

export const chatSchema = z.object({
  employee: employeeSchema.partial().optional(),
  employeeId: z.string().uuid().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
});

export const customerSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  phone,
  email: z.string().email().optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  notes: z.string().max(5000).optional(),
  marketingConsent: z.boolean().default(false),
});

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "business", "pro"]),
  interval: z.enum(["monthly", "annual"]),
  provider: z.enum(["stripe", "myfatoorah"]),
  coupon: z.string().trim().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
});

export const ticketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export const whatsappSendSchema = z.object({ to: phone, text: z.string().trim().min(1).max(4096) });

export const privacySchema = z.object({
  recordingEnabled: z.boolean(),
  consentMessage: z.string().trim().max(500),
  retentionDays: z.number().int().min(1).max(3650),
});

export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
