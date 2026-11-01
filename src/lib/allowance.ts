/** Plan-allowance decision for live channels (pure; shared by server code and tests). */
/** 10 % grace above the plan allowance before the AI pauses on live channels. */
export const LIMIT_GRACE = 1.1;
export type AllowanceReason = "no_subscription" | "conversations_limit" | "voice_limit";

/** Pure decision (unit-tested): may the AI keep answering on live channels? A limit of 0 means "not capped". */
export function allowanceDecision(u: { plan: string | null; conversations: { used: number; limit: number }; voiceMinutes: { used: number; limit: number } }, channel: "whatsapp" | "phone" | "web_chat"):
  { ok: true } | { ok: false; reason: AllowanceReason } {
  if (!u.plan) return { ok: false, reason: "no_subscription" };
  const over = (x: { used: number; limit: number }) => x.limit > 0 && x.used >= Math.ceil(x.limit * LIMIT_GRACE);
  if (over(u.conversations)) return { ok: false, reason: "conversations_limit" };
  if (channel === "phone" && over(u.voiceMinutes)) return { ok: false, reason: "voice_limit" };
  return { ok: true };
}

