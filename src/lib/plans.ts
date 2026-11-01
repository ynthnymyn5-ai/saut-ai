/**
 * Plan catalogue used by the UI. The database (subscription_plans) is the source of truth
 * in production and admins can edit prices there; these values mirror the seed migration.
 * Prices are PROPOSED launch prices, not confirmed market prices.
 */
export type PlanCode = "starter" | "business" | "pro";
export type Interval = "monthly" | "annual";

export interface Plan {
  code: PlanCode;
  name: { en: string; ar: string };
  monthly: number;
  annual: number; // 10 × monthly = 2 months free
  maxEmployees: number;
  voiceMinutes: number;
  conversations: number;
  highlighted?: boolean;
  features: { en: string[]; ar: string[] };
}

export const PLANS: Plan[] = [
  {
    code: "starter",
    name: { en: "Starter", ar: "المبتدئ" },
    monthly: 19,
    annual: 190,
    maxEmployees: 1,
    voiceMinutes: 300,
    conversations: 1000,
    features: {
      en: ["1 AI employee", "Basic AI conversations", "Basic analytics", "Knowledge base", "300 voice minutes / month", "Email support"],
      ar: ["موظف ذكي واحد", "محادثات ذكية أساسية", "تحليلات أساسية", "قاعدة معرفة", "٣٠٠ دقيقة صوتية شهرياً", "دعم عبر البريد"],
    },
  },
  {
    code: "business",
    name: { en: "Business", ar: "الأعمال" },
    monthly: 49,
    annual: 490,
    maxEmployees: 3,
    voiceMinutes: 1200,
    conversations: 5000,
    highlighted: true,
    features: {
      en: ["Up to 3 AI employees", "Advanced AI conversations", "Arabic dialect selection", "Call summaries", "Appointment booking", "WhatsApp integration (when connected)", "Advanced analytics", "Priority support"],
      ar: ["حتى ٣ موظفين أذكياء", "محادثات ذكية متقدمة", "اختيار اللهجة العربية", "ملخصات المكالمات", "حجز المواعيد", "ربط واتساب (عند التفعيل)", "تحليلات متقدمة", "دعم بأولوية"],
    },
  },
  {
    code: "pro",
    name: { en: "Pro", ar: "الاحترافي" },
    monthly: 99,
    annual: 990,
    maxEmployees: 10,
    voiceMinutes: 4000,
    conversations: 20000,
    features: {
      en: ["Up to 10 AI employees", "Advanced automation", "Multiple business locations", "Advanced reporting", "Custom AI instructions", "Team management", "Priority assistance", "Higher monthly usage allowance"],
      ar: ["حتى ١٠ موظفين أذكياء", "أتمتة متقدمة", "فروع متعددة", "تقارير متقدمة", "تعليمات مخصصة للذكاء الاصطناعي", "إدارة الفريق", "مساعدة بأولوية", "حد استخدام شهري أعلى"],
    },
  },
];

export const getPlan = (code: PlanCode) => PLANS.find((p) => p.code === code)!;
