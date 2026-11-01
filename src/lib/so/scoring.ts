/**
 * Lead scoring — transparent, rule-based, computed only from recorded interactions.
 * Every point comes with a reason so the CRM can show why a lead scored what it did.
 */
export interface LeadSignals {
  stage: "new" | "contacted" | "interested" | "qualified" | "converted" | "lost";
  conversations: number;
  appointments: number;
  completedAppointments: number;
  lastContactDaysAgo: number | null;
  askedPricing: boolean;
  hasEstimatedValue: boolean;
  negativeSentiment: boolean;
  source: string;
}

export function scoreLead(s: LeadSignals) {
  if (s.stage === "converted") return { score: 100, reasons: [{ points: 100, reason: "converted" }] };
  if (s.stage === "lost") return { score: 0, reasons: [{ points: 0, reason: "lost" }] };
  const r: { points: number; reason: string }[] = [];
  const add = (points: number, reason: string) => r.push({ points, reason });
  add({ new: 5, contacted: 15, interested: 30, qualified: 45 }[s.stage], `stage:${s.stage}`);
  if (s.conversations > 0) add(Math.min(15, s.conversations * 5), `conversations:${s.conversations}`);
  if (s.appointments > 0) add(Math.min(15, s.appointments * 8), `appointments:${s.appointments}`);
  if (s.completedAppointments > 0) add(10, "attended_appointment");
  if (s.askedPricing) add(8, "asked_pricing");
  if (s.hasEstimatedValue) add(5, "value_known");
  if (s.source === "whatsapp" || s.source === "phone") add(3, `inbound_${s.source}`);
  if (s.lastContactDaysAgo !== null) {
    if (s.lastContactDaysAgo <= 3) add(7, "recent_contact");
    else if (s.lastContactDaysAgo > 30) add(-15, "stale_30d");
    else if (s.lastContactDaysAgo > 14) add(-8, "stale_14d");
  }
  if (s.negativeSentiment) add(-10, "negative_sentiment");
  const score = Math.max(0, Math.min(99, r.reduce((a, x) => a + x.points, 0)));
  return { score, reasons: r };
}

/** Rule-based next step, derived from the same signals (shown when no AI provider is configured). */
export function suggestFollowUp(s: LeadSignals): { action: string; dueInDays: number } | null {
  if (s.stage === "converted" || s.stage === "lost") return null;
  if (s.negativeSentiment) return { action: "call_back_personally", dueInDays: 0 };
  if (s.askedPricing && s.stage !== "qualified") return { action: "send_quote", dueInDays: 1 };
  if (s.appointments > 0 && s.completedAppointments === 0) return { action: "confirm_appointment", dueInDays: 1 };
  if (s.lastContactDaysAgo !== null && s.lastContactDaysAgo > 7) return { action: "re_engage", dueInDays: 0 };
  if (s.stage === "new") return { action: "first_contact", dueInDays: 0 };
  return { action: "check_in", dueInDays: 3 };
}
