import "server-only";
import type { ToolCtx } from "./context";
import { isCustomerFacing, needsScope, samePhone, scopeDecision } from "./customer-scope-core";

/**
 * Returns a refusal note when an AI tool call in a customer-facing conversation targets someone
 * other than the person in that conversation; null when the call may proceed.
 */
export async function customerScopeRefusal(ctx: ToolCtx, key: string, args: Record<string, unknown>): Promise<string | null> {
  if (!needsScope(key) || !isCustomerFacing(ctx) || !ctx.db) return null;
  const db = ctx.db;
  let customerId = ctx.customerId ?? null;
  let phone: string | null = null;

  if (!customerId && ctx.conversationId) {
    const { data: conv } = await db.from("conversations").select("customer_id").eq("id", ctx.conversationId).eq("organization_id", ctx.orgId).maybeSingle();
    customerId = (conv?.customer_id as string | null) ?? null;
  }
  if (customerId) {
    const { data: c } = await db.from("customers").select("phone").eq("id", customerId).eq("organization_id", ctx.orgId).maybeSingle();
    phone = (c?.phone as string | null) ?? null;
  }
  // Phone calls: the caller ID Twilio reported is the identity.
  if (!phone && ctx.channel === "phone" && ctx.conversationId) {
    const { data: call } = await db.from("calls").select("from_number").eq("conversation_id", ctx.conversationId).eq("organization_id", ctx.orgId).maybeSingle();
    phone = (call?.from_number as string | null) ?? null;
    if (phone && !customerId) {
      const { data: rows } = await db.from("customers").select("id, phone").eq("organization_id", ctx.orgId).limit(1000).ilike("phone", `%${phone.replace(/\D/g, "").slice(-8)}`);
      customerId = ((rows ?? []).find((r) => samePhone(r.phone as string, phone))?.id as string | undefined) ?? null;
    }
  }

  let apptCustomer: string | null = null;
  if (typeof args.appointment_id === "string") {
    const { data: a } = await db.from("appointments").select("customer_id").eq("id", args.appointment_id).eq("organization_id", ctx.orgId).maybeSingle();
    apptCustomer = (a?.customer_id as string | null) ?? null;
  }
  return scopeDecision(key, args, { phone, customerId }, apptCustomer);
}
