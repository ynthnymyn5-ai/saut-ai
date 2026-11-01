export const DIALECT_LABELS = {
  kuwaiti: { en: "Kuwaiti Arabic", ar: "اللهجة الكويتية" },
  saudi: { en: "Saudi Arabic", ar: "اللهجة السعودية" },
  emirati: { en: "Emirati Arabic", ar: "اللهجة الإماراتية" },
  msa: { en: "Modern Standard Arabic", ar: "العربية الفصحى" },
  english: { en: "English", ar: "الإنجليزية" },
} as const;

export const VOICE_LABELS = {
  alloy: { en: "Alloy — balanced", ar: "ألوي — متوازن" },
  ash: { en: "Ash — warm, deep", ar: "آش — دافئ وعميق" },
  coral: { en: "Coral — bright, friendly", ar: "كورال — مشرق وودود" },
  sage: { en: "Sage — calm", ar: "سيج — هادئ" },
  verse: { en: "Verse — expressive", ar: "فيرس — معبّر" },
  shimmer: { en: "Shimmer — soft", ar: "شيمر — ناعم" },
} as const;

export const TASK_LABELS = {
  answer_calls: { en: "Answer incoming phone calls", ar: "الرد على المكالمات الواردة" },
  answer_faq: { en: "Answer frequently asked questions", ar: "الإجابة عن الأسئلة الشائعة" },
  book_appointments: { en: "Book appointments", ar: "حجز المواعيد" },
  restaurant_reservations: { en: "Take restaurant reservations", ar: "حجوزات المطاعم" },
  collect_info: { en: "Collect customer information", ar: "جمع بيانات العملاء" },
  whatsapp_followup: { en: "Send WhatsApp messages (when connected)", ar: "إرسال رسائل واتساب (عند الربط)" },
  summarize: { en: "Summarise conversations", ar: "تلخيص المحادثات" },
  escalate: { en: "Escalate to a human", ar: "التحويل لموظف بشري" },
} as const;

export const TONE_LABELS = {
  friendly: { en: "Friendly", ar: "ودود" },
  professional: { en: "Professional", ar: "مهني" },
  luxury: { en: "Luxury concierge", ar: "فخم وراقٍ" },
  energetic: { en: "Energetic", ar: "حيوي" },
} as const;
