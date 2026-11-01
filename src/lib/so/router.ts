/**
 * SO Brain fallback + Agent Router — pure functions.
 * The LLM classifier (brain.ts) is preferred; this keyword classifier is used when no
 * AI provider is configured and as a sanity check. Both return the same Intent shape.
 */
import type { AgentRole } from "./permissions";

export type IntentKind = "booking" | "reschedule" | "cancel" | "purchase_interest" | "pricing" | "complaint" | "support" | "faq" | "human_request" | "report" | "medical" | "greeting" | "other";
export interface Intent { kind: IntentKind; confidence: number; language: "ar" | "en"; urgent: boolean; }

const RULES: [IntentKind, RegExp][] = [
  ["human_request", /(manager|human|real person|staff|مدير|موظف|شخص حقيقي|أكلم أحد|ابي اكلم|أبي أكلم)/i],
  ["medical", /(diagnos|prescri|dose|symptom|pain|fever|تشخيص|وصفة|جرعة|أعراض|ألم|حرارة|دواء)/i],
  ["complaint", /(complain|angry|terrible|refund|worst|broken|شكوى|زعلان|سيء|استرجاع|خربان|مو راضي)/i],
  ["cancel", /(cancel|الغ|إلغاء|كنسل)/i],
  ["reschedule", /(reschedule|change (my )?(booking|appointment)|move (my )?(booking|appointment)|أغير الموعد|تأجيل|أغير الحجز)/i],
  ["booking", /(book|reserv|appointment|table for|حجز|أحجز|احجز|موعد|طاولة)/i],
  ["pricing", /(price|cost|how much|offer|discount|سعر|كم|بكم|عرض|خصم)/i],
  ["purchase_interest", /(buy|interested|quote|demo|test drive|أشتري|اشتري|مهتم|عرض سعر|تجربة قيادة)/i],
  ["report", /(report|performance|analytics|sales this|تقرير|أداء|مبيعات)/i],
  ["support", /(problem|issue|not working|help with|order status|tracking|مشكلة|ما يشتغل|طلبي|تتبع)/i],
  ["greeting", /^(hi|hello|hey|السلام|مرحبا|هلا|صباح|مساء)\b/i],
  ["faq", /(open|hours|location|where|parking|menu|delivery|دوام|موقع|وين|مواقف|منيو|توصيل)/i],
];

export function classifyIntentRules(text: string): Intent {
  const language = /[؀-ۿ]/.test(text) ? "ar" : "en";
  for (const [kind, re] of RULES) if (re.test(text)) return { kind, confidence: 0.6, language, urgent: kind === "complaint" || kind === "human_request" || kind === "medical" };
  return { kind: "other", confidence: 0.3, language, urgent: false };
}

const ROUTE: Record<IntentKind, AgentRole[]> = {
  booking: ["booking", "receptionist"],
  reschedule: ["booking", "receptionist"],
  cancel: ["booking", "receptionist"],
  purchase_interest: ["sales", "receptionist"],
  pricing: ["sales", "receptionist"],
  complaint: ["support", "receptionist"],
  support: ["support", "receptionist"],
  faq: ["receptionist", "support", "sales"],
  human_request: ["receptionist", "support"],
  report: ["manager"],
  medical: ["receptionist", "support"],
  greeting: ["receptionist", "sales", "support"],
  other: ["receptionist", "support", "sales"],
};

export interface RoutableAgent { id: string; role: AgentRole; status: string; branch_id: string | null; }

/**
 * Pick the agent for an intent. Prefers: same branch → role order → any active agent.
 * Manager agents only ever answer internal (owner) requests, never customers.
 */
export function routeAgent(intent: Intent, agents: RoutableAgent[], opts: { branchId?: string | null; channelAudience: "customer" | "internal" }): RoutableAgent | null {
  const active = agents.filter((a) => a.status === "active" && (opts.channelAudience === "internal" || a.role !== "manager"));
  if (!active.length) return null;
  const order = ROUTE[intent.kind];
  const inBranch = (a: RoutableAgent) => !opts.branchId || !a.branch_id || a.branch_id === opts.branchId;
  for (const role of order) {
    const hit = active.find((a) => a.role === role && inBranch(a)) ?? active.find((a) => a.role === role);
    if (hit) return hit;
  }
  return active.find(inBranch) ?? active[0];
}

/** Hand off to a human regardless of agent: explicit request, repeated failure, or medical question. */
export function needsHumanHandoff(intent: Intent, opts: { failedToolCalls: number; safetyProfile: string }) {
  if (intent.kind === "human_request") return "customer_requested";
  if (intent.kind === "medical" && opts.safetyProfile === "medical") return "medical_question";
  if (opts.failedToolCalls >= 2) return "repeated_failure";
  return null;
}
