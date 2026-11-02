/**
 * Ready-made AI employees: 5 role templates × 10 Kuwait industry templates.
 * Everything here is a starting point — businesses edit all of it in the creator.
 */
import type { AgentRole, Effect, Permission } from "./permissions";

type L = { en: string; ar: string };

export interface RoleTemplate {
  role: Exclude<AgentRole, "custom">;
  name: L;
  summary: L;
  duties: L[];
  tools: string[];
  instructions: string;
}

export const ROLE_TEMPLATES: Record<Exclude<AgentRole, "custom">, RoleTemplate> = {
  receptionist: {
    role: "receptionist",
    name: { en: "SO Receptionist", ar: "سو الاستقبال" },
    summary: { en: "Answers calls, welcomes customers and handles everyday requests.", ar: "يرد على المكالمات ويرحّب بالعملاء ويتعامل مع الطلبات اليومية." },
    duties: [
      { en: "Answer incoming calls", ar: "الرد على المكالمات الواردة" },
      { en: "Welcome customers", ar: "الترحيب بالعملاء" },
      { en: "Answer business questions", ar: "الإجابة عن أسئلة النشاط" },
      { en: "Manage appointments", ar: "إدارة المواعيد" },
      { en: "Route requests to the right teammate", ar: "توجيه الطلبات للزميل المناسب" },
    ],
    tools: ["lookup_customer", "save_customer", "search_knowledge", "list_products", "list_delivery_areas", "take_order", "lookup_order", "check_availability", "book_appointment", "create_lead", "create_task", "transfer_to_human", "send_whatsapp"],
    instructions: "Greet warmly with the business name. Identify what the caller needs in one question. Answer from the knowledge base. Hand bookings, sales and complaints to the right workflow or teammate.",
  },
  sales: {
    role: "sales",
    name: { en: "SO Sales", ar: "سو المبيعات" },
    summary: { en: "Captures and qualifies leads, recommends offers and follows up.", ar: "يلتقط العملاء المحتملين ويؤهّلهم ويقترح العروض ويتابع معهم." },
    duties: [
      { en: "Capture leads", ar: "التقاط العملاء المحتملين" },
      { en: "Qualify prospects (need, budget, timing)", ar: "تأهيل العملاء (الحاجة، الميزانية، التوقيت)" },
      { en: "Recommend products and services", ar: "اقتراح المنتجات والخدمات" },
      { en: "Schedule follow-ups", ar: "جدولة المتابعات" },
    ],
    tools: ["lookup_customer", "save_customer", "search_knowledge", "list_products", "list_delivery_areas", "take_order", "lookup_order", "create_lead", "update_lead_stage", "book_appointment", "check_availability", "create_task", "send_whatsapp", "transfer_to_human"],
    instructions: "Find out need, budget and timing without pressure. Recommend only offers that exist in the knowledge base, with their real prices. Record every prospect as a lead and set a follow-up. Never invent discounts.",
  },
  support: {
    role: "support",
    name: { en: "SO Customer Support", ar: "سو خدمة العملاء" },
    summary: { en: "Answers questions, handles complaints and tracks cases.", ar: "يجيب عن الأسئلة ويتعامل مع الشكاوى ويتابع الحالات." },
    duties: [
      { en: "Answer customer questions", ar: "الإجابة عن أسئلة العملاء" },
      { en: "Handle complaints calmly", ar: "التعامل مع الشكاوى بهدوء" },
      { en: "Open and track support cases", ar: "فتح الحالات ومتابعتها" },
      { en: "Escalate complex cases to staff", ar: "تصعيد الحالات المعقدة للموظفين" },
    ],
    tools: ["lookup_customer", "save_customer", "search_knowledge", "list_products", "list_delivery_areas", "lookup_order", "create_support_case", "create_task", "transfer_to_human", "send_whatsapp"],
    instructions: "Acknowledge the problem first. Collect order/booking reference. Resolve with the knowledge base; otherwise open a support case and tell the customer exactly what happens next. Escalate refunds, legal threats and repeated complaints to a human.",
  },
  manager: {
    role: "manager",
    name: { en: "SO Manager", ar: "سو المدير" },
    summary: { en: "Internal analyst: monitors the AI team and reports on the business.", ar: "محلل داخلي: يراقب فريق الذكاء الاصطناعي ويرفع التقارير." },
    duties: [
      { en: "Analyse business performance", ar: "تحليل أداء النشاط" },
      { en: "Monitor AI employees", ar: "مراقبة الموظفين الأذكياء" },
      { en: "Generate reports", ar: "إعداد التقارير" },
      { en: "Spot operational problems and recommend fixes", ar: "اكتشاف المشاكل التشغيلية واقتراح الحلول" },
    ],
    tools: ["get_business_metrics", "create_task", "search_knowledge"],
    instructions: "You speak only to the business owner and staff, never to customers. Base every number on get_business_metrics results and label estimates. Recommendations must cite the metric that motivates them.",
  },
  booking: {
    role: "booking",
    name: { en: "SO Booking Assistant", ar: "سو الحجوزات" },
    summary: { en: "Checks availability, creates and updates reservations, sends confirmations.", ar: "يتحقق من التوفر وينشئ الحجوزات ويعدّلها ويرسل التأكيدات." },
    duties: [
      { en: "Check calendar availability", ar: "التحقق من التوفر في التقويم" },
      { en: "Create and update reservations", ar: "إنشاء الحجوزات وتعديلها" },
      { en: "Send confirmations when messaging is connected", ar: "إرسال التأكيد عند ربط المراسلة" },
    ],
    tools: ["lookup_customer", "save_customer", "check_availability", "book_appointment", "reschedule_appointment", "cancel_appointment", "send_whatsapp", "transfer_to_human"],
    instructions: "Always call check_availability before offering a time. Offer at most three slots. Read back name, date, time and party size before booking. Cancellations need staff confirmation; tell the customer it is being confirmed.",
  },
};

export interface IndustryTemplate {
  key: string;
  name: L;
  industry: "restaurant" | "clinic" | "real_estate" | "online_store" | "beauty_salon" | "hotel" | "customer_support" | "other";
  roles: Exclude<AgentRole, "custom">[];
  personality: { warmth: number; formality: number; pace: number; tone: "friendly" | "professional" | "luxury" | "energetic" };
  safetyProfile: "standard" | "medical" | "financial";
  instructions: string;
  faqs: { q: string; a: string }[];
  workflows: string[];           // keys into WORKFLOW_TEMPLATES
  integrations: string[];
  extraTools: string[];
  permissions?: Partial<Record<Permission, Effect>>;
}

export const INDUSTRY_TEMPLATES: Record<string, IndustryTemplate> = {
  restaurant: {
    key: "restaurant", name: { en: "Restaurant", ar: "مطعم" }, industry: "restaurant", roles: ["receptionist", "booking"],
    personality: { warmth: 85, formality: 35, pace: 55, tone: "friendly" }, safetyProfile: "standard",
    instructions: "Take table reservations (name, phone, date, time, party size, seating preference). Mention allergens only from the menu data. Parties over 10 go to the manager.",
    faqs: [{ q: "Do you have outdoor seating?", a: "[Fill in]" }, { q: "Do you deliver to Salmiya?", a: "[Fill in]" }, { q: "Do you have vegetarian options?", a: "[Fill in]" }],
    workflows: ["booking_call", "missed_call_callback", "reservation_reminder"], integrations: ["telephony", "whatsapp", "google_calendar"], extraTools: [],
  },
  cafe: {
    key: "cafe", name: { en: "Café", ar: "مقهى" }, industry: "restaurant", roles: ["receptionist"],
    personality: { warmth: 90, formality: 25, pace: 60, tone: "friendly" }, safetyProfile: "standard",
    instructions: "Answer menu, hours and location questions. Take pickup orders as tasks for staff to confirm; never confirm payment.",
    faqs: [{ q: "Do you have oat milk?", a: "[Fill in]" }, { q: "Is there parking?", a: "[Fill in]" }],
    workflows: ["missed_call_callback", "whatsapp_faq"], integrations: ["whatsapp", "telephony"], extraTools: [],
  },
  clinic: {
    key: "clinic", name: { en: "Clinic", ar: "عيادة" }, industry: "clinic", roles: ["receptionist", "booking"],
    personality: { warmth: 75, formality: 70, pace: 45, tone: "professional" }, safetyProfile: "medical",
    instructions: "Book, reschedule and confirm appointments with the right doctor or specialty. You are not a clinician. For symptoms, medication or results, transfer to clinic staff. For emergencies, tell the caller to call 112 immediately.",
    faqs: [{ q: "Which insurance do you accept?", a: "[Fill in]" }, { q: "Do I need a referral?", a: "[Fill in]" }],
    workflows: ["booking_call", "appointment_reminder", "medical_escalation"], integrations: ["telephony", "whatsapp", "google_calendar"], extraTools: [],
    permissions: { "messages.send": "confirm" },
  },
  real_estate: {
    key: "real_estate", name: { en: "Real estate", ar: "عقار" }, industry: "real_estate", roles: ["sales", "receptionist"],
    personality: { warmth: 70, formality: 60, pace: 50, tone: "professional" }, safetyProfile: "financial",
    instructions: "Qualify buyers and tenants: area (e.g. Salmiya, Jabriya, Khairan), budget in KWD, bedrooms, timeline. Book viewings. Never quote prices or availability that are not in the listings data.",
    faqs: [{ q: "Is the apartment furnished?", a: "[Fill in per listing]" }, { q: "What is the commission?", a: "[Fill in]" }],
    workflows: ["new_lead_qualify", "viewing_booking"], integrations: ["whatsapp", "google_calendar", "crm"], extraTools: [],
  },
  beauty_salon: {
    key: "beauty_salon", name: { en: "Beauty salon", ar: "صالون تجميل" }, industry: "beauty_salon", roles: ["booking", "receptionist"],
    personality: { warmth: 90, formality: 35, pace: 55, tone: "luxury" }, safetyProfile: "standard",
    instructions: "Book services with the right stylist and duration. Mention preparation notes from the knowledge base. Late cancellations follow the salon policy.",
    faqs: [{ q: "Do you have female-only staff?", a: "[Fill in]" }, { q: "How long does a keratin treatment take?", a: "[Fill in]" }],
    workflows: ["booking_call", "appointment_reminder", "no_show_follow_up"], integrations: ["whatsapp", "google_calendar"], extraTools: [],
  },
  hotel: {
    key: "hotel", name: { en: "Hotel", ar: "فندق" }, industry: "hotel", roles: ["receptionist", "booking", "support"],
    personality: { warmth: 80, formality: 75, pace: 45, tone: "luxury" }, safetyProfile: "standard",
    instructions: "Handle room enquiries, restaurant and spa bookings and guest requests. Room rates and availability come only from the booking system; otherwise take a request for reservations staff.",
    faqs: [{ q: "What time is check-in?", a: "[Fill in]" }, { q: "Is breakfast included?", a: "[Fill in]" }],
    workflows: ["booking_call", "complaint_escalation"], integrations: ["telephony", "whatsapp"], extraTools: [],
  },
  car_dealership: {
    key: "car_dealership", name: { en: "Car dealership", ar: "وكالة سيارات" }, industry: "other", roles: ["sales", "booking", "support"],
    personality: { warmth: 70, formality: 55, pace: 55, tone: "professional" }, safetyProfile: "financial",
    instructions: "Capture model interest, trade-in and financing questions as lead details. Book test drives and service appointments. Financing terms are only discussed by staff.",
    faqs: [{ q: "Do you offer installments?", a: "[Fill in]" }, { q: "When is my car's next service?", a: "[Fill in]" }],
    workflows: ["new_lead_qualify", "test_drive_booking", "missed_call_callback"], integrations: ["telephony", "whatsapp", "crm"], extraTools: [],
  },
  ecommerce: {
    key: "ecommerce", name: { en: "E-commerce", ar: "متجر إلكتروني" }, industry: "online_store", roles: ["support", "sales"],
    personality: { warmth: 80, formality: 40, pace: 60, tone: "energetic" }, safetyProfile: "standard",
    instructions: "Answer product, delivery-area and return-policy questions. Order status comes only from connected systems; otherwise open a support case. Refunds are handled by staff.",
    faqs: [{ q: "How long is delivery inside Kuwait?", a: "[Fill in]" }, { q: "What is the return policy?", a: "[Fill in]" }],
    workflows: ["whatsapp_faq", "complaint_escalation"], integrations: ["whatsapp", "webhooks", "email"], extraTools: [],
  },
  customer_support: {
    key: "customer_support", name: { en: "Customer support", ar: "خدمة العملاء" }, industry: "customer_support", roles: ["support", "receptionist"],
    personality: { warmth: 75, formality: 55, pace: 50, tone: "professional" }, safetyProfile: "standard",
    instructions: "Resolve first-line questions from the knowledge base, open cases for everything else and keep the customer informed.",
    faqs: [{ q: "How do I reset my password?", a: "[Fill in]" }],
    workflows: ["complaint_escalation", "ticket_triage"], integrations: ["whatsapp", "email", "webhooks"], extraTools: [],
  },
  professional_services: {
    key: "professional_services", name: { en: "Professional services", ar: "خدمات مهنية" }, industry: "other", roles: ["receptionist", "booking", "sales"],
    personality: { warmth: 65, formality: 80, pace: 45, tone: "professional" }, safetyProfile: "financial",
    instructions: "Book consultations, capture the enquiry type and urgency. Never give legal, tax or financial advice; staff provide it.",
    faqs: [{ q: "How much is a consultation?", a: "[Fill in]" }],
    workflows: ["new_lead_qualify", "booking_call"], integrations: ["google_calendar", "email"], extraTools: [],
  },
};

export interface WorkflowTemplate { key: string; name: L; trigger: string; nodes: { key: string; kind: "condition" | "action"; type: string; config?: Record<string, unknown>; parent_key?: string; branch?: "yes" | "no" }[]; }

export const WORKFLOW_TEMPLATES: Record<string, WorkflowTemplate> = {
  booking_call: {
    key: "booking_call", name: { en: "Book from a call", ar: "حجز من مكالمة" }, trigger: "call_received",
    nodes: [
      { key: "identify", kind: "action", type: "identify_customer" },
      { key: "wants_booking", kind: "condition", type: "intent_is", config: { values: ["booking", "reschedule"] } },
      { key: "availability", kind: "action", type: "check_availability", parent_key: "wants_booking", branch: "yes" },
      { key: "book", kind: "action", type: "book_appointment", parent_key: "wants_booking", branch: "yes" },
      { key: "save", kind: "action", type: "save_customer", parent_key: "wants_booking", branch: "yes" },
      { key: "confirm_wa", kind: "action", type: "send_whatsapp", config: { template: "booking_confirmation" }, parent_key: "wants_booking", branch: "yes" },
      { key: "notify", kind: "action", type: "notify_owner", config: { title: "New booking" }, parent_key: "wants_booking", branch: "yes" },
    ],
  },
  missed_call_callback: {
    key: "missed_call_callback", name: { en: "Missed call follow-up", ar: "متابعة المكالمات الفائتة" }, trigger: "missed_call",
    nodes: [
      { key: "identify", kind: "action", type: "identify_customer" },
      { key: "task", kind: "action", type: "create_task", config: { kind: "callback", title: "Call back missed caller", due_minutes: 30 } },
      { key: "wa", kind: "action", type: "send_whatsapp", config: { template: "missed_call_sorry" } },
    ],
  },
  reservation_reminder: {
    key: "reservation_reminder", name: { en: "Reservation confirmation", ar: "تأكيد الحجز" }, trigger: "appointment_created",
    nodes: [{ key: "wa", kind: "action", type: "send_whatsapp", config: { template: "booking_confirmation" } }],
  },
  appointment_reminder: {
    key: "appointment_reminder", name: { en: "Appointment confirmation", ar: "تأكيد الموعد" }, trigger: "appointment_created",
    nodes: [{ key: "wa", kind: "action", type: "send_whatsapp", config: { template: "appointment_confirmation" } }, { key: "notify", kind: "action", type: "notify_owner", config: { title: "Appointment booked" } }],
  },
  no_show_follow_up: {
    key: "no_show_follow_up", name: { en: "Cancellation follow-up", ar: "متابعة الإلغاء" }, trigger: "appointment_canceled",
    nodes: [{ key: "task", kind: "action", type: "create_task", config: { kind: "follow_up", title: "Offer a new slot", due_minutes: 1440 } }],
  },
  medical_escalation: {
    key: "medical_escalation", name: { en: "Medical question → staff", ar: "سؤال طبي ← الطاقم" }, trigger: "call_received",
    nodes: [
      { key: "is_medical", kind: "condition", type: "intent_is", config: { value: "medical" } },
      { key: "escalate", kind: "action", type: "escalate_to_human", config: { reason: "medical_question" }, parent_key: "is_medical", branch: "yes" },
    ],
  },
  new_lead_qualify: {
    key: "new_lead_qualify", name: { en: "Qualify new leads", ar: "تأهيل العملاء الجدد" }, trigger: "lead_created",
    nodes: [
      { key: "hot", kind: "condition", type: "lead_score_at_least", config: { value: 60 } },
      { key: "notify", kind: "action", type: "notify_owner", config: { title: "Hot lead" }, parent_key: "hot", branch: "yes" },
      { key: "task", kind: "action", type: "create_task", config: { kind: "follow_up", title: "Follow up new lead", due_minutes: 1440 }, parent_key: "hot", branch: "no" },
    ],
  },
  viewing_booking: {
    key: "viewing_booking", name: { en: "Book property viewings", ar: "حجز معاينة عقار" }, trigger: "whatsapp_message",
    nodes: [
      { key: "wants", kind: "condition", type: "intent_is", config: { values: ["booking", "purchase_interest"] } },
      { key: "lead", kind: "action", type: "create_lead", parent_key: "wants", branch: "yes" },
      { key: "task", kind: "action", type: "create_task", config: { kind: "booking", title: "Arrange viewing", due_minutes: 240 }, parent_key: "wants", branch: "yes" },
    ],
  },
  test_drive_booking: {
    key: "test_drive_booking", name: { en: "Test drive requests", ar: "طلبات تجربة القيادة" }, trigger: "call_received",
    nodes: [
      { key: "wants", kind: "condition", type: "text_contains", config: { value: "test drive,تجربة قيادة" } },
      { key: "lead", kind: "action", type: "create_lead", parent_key: "wants", branch: "yes" },
      { key: "book", kind: "action", type: "book_appointment", parent_key: "wants", branch: "yes" },
    ],
  },
  whatsapp_faq: {
    key: "whatsapp_faq", name: { en: "After-hours WhatsApp", ar: "واتساب خارج الدوام" }, trigger: "whatsapp_message",
    nodes: [
      { key: "open", kind: "condition", type: "within_hours", config: { value: true } },
      { key: "task", kind: "action", type: "create_task", config: { kind: "follow_up", title: "Reply to after-hours message", due_minutes: 720 }, parent_key: "open", branch: "no" },
    ],
  },
  complaint_escalation: {
    key: "complaint_escalation", name: { en: "Complaint escalation", ar: "تصعيد الشكاوى" }, trigger: "complaint",
    nodes: [
      { key: "tag", kind: "action", type: "tag_customer", config: { value: "Complaint" } },
      { key: "escalate", kind: "action", type: "escalate_to_human", config: { reason: "complaint" } },
      { key: "notify", kind: "action", type: "notify_owner", config: { title: "Customer complaint" } },
    ],
  },
  ticket_triage: {
    key: "ticket_triage", name: { en: "Ticket triage", ar: "فرز التذاكر" }, trigger: "ticket_created",
    nodes: [
      { key: "urgent", kind: "condition", type: "text_contains", config: { value: "urgent,عاجل,down,متوقف" } },
      { key: "notify", kind: "action", type: "notify_owner", config: { title: "Urgent ticket" }, parent_key: "urgent", branch: "yes" },
    ],
  },
};

const DIALECT: Record<string, string> = {
  kuwaiti: "Speak natural Kuwaiti Arabic (شلونك، أبي، وايد، إي نعم، تامر أمر). Switch to English if the customer does.",
  saudi: "Speak natural Saudi Arabic (وش تبي، أبشر، زين، حياك الله). Switch to English if the customer does.",
  emirati: "Speak natural Emirati Arabic (شحالك، أبا، وايد، مرحبا الساع). Switch to English if the customer does.",
  msa: "Speak clear, polite Modern Standard Arabic.",
  english: "Speak clear, friendly English; if the customer speaks Arabic, answer in Gulf Arabic.",
};

const SAFETY: Record<string, string> = {
  standard: "",
  medical: [
    "MEDICAL SAFETY RULES (non-negotiable):",
    "- You are not a doctor. Never diagnose, never prescribe, never recommend medication, doses or treatments, and never interpret test results.",
    "- For any symptom, medication or clinical question, say a qualified clinician must answer and call transfer_to_human.",
    "- If the caller describes an emergency (chest pain, difficulty breathing, severe bleeding, loss of consciousness), tell them to call 112 now.",
  ].join("\n"),
  financial: "Never give legal, tax, investment or financing advice, and never promise prices, rates or terms that are not in the knowledge base. Transfer such questions to staff.",
};

/** System prompt shared by chat, WhatsApp, and voice. */
export function buildAgentPrompt(a: {
  name: string; role: AgentRole; dialect: string; safetyProfile: string; businessName: string; industry: string;
  instructions: string; knowledge: string[]; memory: string[]; branch?: { name: string; hours?: string; address?: string } | null;
  speakingRate?: number; channel?: string;
}) {
  const role = a.role === "custom" ? null : ROLE_TEMPLATES[a.role];
  return [
    `You are ${a.name}, ${role ? role.name.en : "an AI employee"} at ${a.businessName}, powered by SAUT AI. Industry: ${a.industry}.`,
    DIALECT[a.dialect] ?? DIALECT.kuwaiti,
    a.channel === "phone" ? "You are on a phone call: keep replies to 1–2 short sentences and ask one question at a time." : "Keep replies short and clear.",
    role ? `Your responsibilities: ${role.duties.map((d) => d.en).join("; ")}.\n${role.instructions}` : "",
    "Rules: never invent prices, availability or policies; if unsure, say so and offer a teammate. Never say an action succeeded unless the tool result says ok=true. If a tool result says it needs staff confirmation, tell the customer it is pending confirmation. If asked, say honestly that you are an AI.",
    SAFETY[a.safetyProfile] ?? "",
    a.branch ? `Branch: ${a.branch.name}${a.branch.address ? `, ${a.branch.address}` : ""}${a.branch.hours ? `. Hours: ${a.branch.hours}` : ""}.` : "",
    a.memory.length ? `What you already know about this customer (from earlier conversations):\n- ${a.memory.join("\n- ")}` : "",
    a.knowledge.length ? `Relevant business knowledge:\n${a.knowledge.map((k, i) => `[${i + 1}] ${k}`).join("\n")}` : "",
    a.instructions ? `Owner's instructions:\n${a.instructions}` : "",
  ].filter(Boolean).join("\n\n");
}
