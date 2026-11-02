/**
 * Privacy guard for AI tools used in customer-facing channels (WhatsApp, website chat, phone).
 * The person talking to the AI may only look up or change THEIR OWN records — never another
 * customer's, even if they ask the AI to (prompt injection). Pure logic, unit-tested.
 */
export const CUSTOMER_CHANNELS = ["whatsapp", "web_chat", "phone"] as const;

/** Tools whose phone argument must be the conversation's own customer. */
export const PHONE_SCOPED: Record<string, string> = { lookup_customer: "phone", save_customer: "phone", remember_preference: "phone", send_whatsapp: "to" };
/** Tools acting on an appointment that must belong to the conversation's own customer. */
export const APPOINTMENT_SCOPED = new Set(["reschedule_appointment", "cancel_appointment"]);

export const isCustomerFacing = (ctx: { actor: string; channel?: string; test: boolean }) =>
  ctx.actor === "agent" && !ctx.test && (CUSTOMER_CHANNELS as readonly string[]).includes(ctx.channel ?? "");

export const needsScope = (key: string) => key in PHONE_SCOPED || APPOINTMENT_SCOPED.has(key);

const digits = (p: string) => p.replace(/\D/g, "");
/** Same number, tolerating a missing country code ("55001111" vs "+96555001111"). */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = digits(a ?? ""), y = digits(b ?? "");
  if (x.length < 7 || y.length < 7) return false;
  return x === y || (x.length >= 8 && y.endsWith(x)) || (y.length >= 8 && x.endsWith(y));
}

export const PRIVACY_NOTE = "For privacy, in this conversation you can only look up or change the details of the person you are talking to (their own number and their own bookings). Do not reveal anything about other customers; offer a staff callback instead.";
export const UNVERIFIED_NOTE = "The customer's identity isn't verified in this conversation, so customer records can't be looked up or changed here. Offer to take their request for staff or transfer to a human.";

/** Decides a scoped tool call given who the conversation's customer is. null = allowed. */
export function scopeDecision(
  key: string,
  args: Record<string, unknown>,
  who: { phone: string | null; customerId: string | null },
  appointmentCustomerId?: string | null,
): string | null {
  if (key in PHONE_SCOPED) {
    if (!who.phone) return UNVERIFIED_NOTE;
    return samePhone(String(args[PHONE_SCOPED[key]] ?? ""), who.phone) ? null : PRIVACY_NOTE;
  }
  if (APPOINTMENT_SCOPED.has(key)) {
    if (!who.customerId) return UNVERIFIED_NOTE;
    return appointmentCustomerId && appointmentCustomerId === who.customerId ? null : PRIVACY_NOTE;
  }
  return null;
}
