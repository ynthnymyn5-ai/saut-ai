import "server-only";
import { z } from "zod";
import { providerStatus } from "@/lib/env";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/messaging/whatsapp";
import { freeSlots } from "./availability";
import { maskPhone, notify, type ToolCtx } from "./context";
import { searchKnowledge } from "./knowledge";
import { remember } from "./memory";
import type { Permission } from "./permissions";
import { PermanentError } from "./retry";

export interface ToolResult { ok: boolean; note: string; data?: unknown; transfer?: boolean; pending?: boolean }
interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  key: string;
  permission: Permission;
  sensitive?: boolean;          // always requires human confirmation before running
  description: string;
  schema: S;
  run: (ctx: ToolCtx & { db: NonNullable<ToolCtx["db"]> }, args: z.infer<S>) => Promise<ToolResult>;
}
const def = <S extends z.ZodTypeAny>(d: ToolDef<S>) => d as unknown as ToolDef;

const phone = z.string().trim().regex(/^\+?[0-9 ]{6,20}$/, "invalid phone");
const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "invalid datetime");
const normPhone = (p: string) => (p.startsWith("+") ? "+" : "") + p.replace(/\D/g, "");
const emit = async (ctx: ToolCtx, trigger: string, payload: Record<string, unknown>) => {
  if (ctx.test || !ctx.db || ctx.actor === "workflow") return; // workflows don't re-trigger workflows
  const { emitEvent } = await import("./events");
  await emitEvent(ctx.orgId, trigger as never, payload, { branchId: ctx.branchId });
};

async function upsertCustomer(ctx: ToolCtx & { db: NonNullable<ToolCtx["db"]> }, p: string, name?: string) {
  const { data, error } = await ctx.db.from("customers").upsert(
    { organization_id: ctx.orgId, phone: normPhone(p), ...(name ? { full_name: name } : {}), branch_id: ctx.branchId ?? null, last_contact_at: new Date().toISOString() },
    { onConflict: "organization_id,phone" },
  ).select("id").single();
  if (error) throw new PermanentError(error.message);
  return data.id as string;
}

export const TOOLS: ToolDef[] = [
  def({
    key: "lookup_customer", permission: "customers.read", description: "Find a customer by phone with recent appointments and open leads.",
    schema: z.object({ phone }),
    run: async (ctx, a) => {
      const { data: c } = await ctx.db.from("customers").select("id, full_name, tags, preferred_lang, last_contact_at").eq("organization_id", ctx.orgId).eq("phone", normPhone(a.phone)).maybeSingle();
      if (!c) return { ok: true, note: "No customer with this phone yet (new customer).", data: { is_new: true } };
      const [appts, leads] = await Promise.all([
        ctx.db.from("appointments").select("id, kind, starts_at, status").eq("organization_id", ctx.orgId).eq("customer_id", c.id).order("starts_at", { ascending: false }).limit(3),
        ctx.db.from("leads").select("id, stage, interest").eq("organization_id", ctx.orgId).eq("customer_id", c.id).not("stage", "in", "(converted,lost)").limit(3),
      ]);
      return { ok: true, note: `Found ${c.full_name ?? "customer"}.`, data: { is_new: false, customer: c, appointments: appts.data ?? [], open_leads: leads.data ?? [] } };
    },
  }),
  def({
    key: "save_customer", permission: "customers.write", description: "Create or update a customer's name and add a note.",
    schema: z.object({ phone, name: z.string().trim().max(120).optional(), note: z.string().trim().max(1000).optional() }),
    run: async (ctx, a) => {
      const id = await upsertCustomer(ctx, a.phone, a.name);
      if (a.note) await ctx.db.from("customer_notes").insert({ organization_id: ctx.orgId, customer_id: id, author_agent: ctx.agent?.id ?? null, author_user: ctx.userId ?? null, body: a.note });
      return { ok: true, note: "Customer saved.", data: { customer_id: id } };
    },
  }),
  def({
    key: "remember_preference", permission: "customers.write", description: "Remember a durable customer preference (e.g. seating, allergies, preferred stylist).",
    schema: z.object({ phone, preference: z.string().trim().min(3).max(300) }),
    run: async (ctx, a) => {
      const id = await upsertCustomer(ctx, a.phone);
      await remember(ctx.db, { orgId: ctx.orgId, agentId: ctx.agent?.id, customerId: id, conversationId: ctx.conversationId, kind: "preference", content: a.preference });
      return { ok: true, note: "Preference remembered." };
    },
  }),
  def({
    key: "search_knowledge", permission: "knowledge.read", description: "Search the business knowledge base (menus, prices, policies, FAQs).",
    schema: z.object({ query: z.string().trim().min(2).max(200) }),
    run: async (ctx, a) => {
      const hits = await searchKnowledge(ctx.db, ctx.orgId, a.query, { branchId: ctx.branchId });
      return { ok: true, note: hits.length ? `${hits.length} result(s).` : "Nothing found in the knowledge base. Say you don't know and offer a teammate.", data: hits };
    },
  }),
  def({
    key: "check_availability", permission: "appointments.read", description: "List free appointment slots on a date (YYYY-MM-DD, local time).",
    schema: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), duration_min: z.number().int().min(10).max(480).optional() }),
    run: async (ctx, a) => {
      const branch = ctx.branchId ? (await ctx.db.from("branches").select("opening_hours").eq("id", ctx.branchId).eq("organization_id", ctx.orgId).maybeSingle()).data : null;
      const { data: agent } = ctx.agent ? await ctx.db.from("ai_employees").select("working_hours, business_info").eq("id", ctx.agent.id).maybeSingle() : { data: null };
      const hours = (branch?.opening_hours as Record<string, [string, string][]>) ?? ((agent?.working_hours as { days?: Record<string, [string, string][]> })?.days ?? {});
      const capacity = Number((agent?.business_info as { capacity_per_slot?: number })?.capacity_per_slot ?? 1);
      const dayStart = new Date(`${a.date}T00:00:00+03:00`), dayEnd = new Date(dayStart.getTime() + 86400000);
      let q = ctx.db.from("appointments").select("starts_at, ends_at").eq("organization_id", ctx.orgId).in("status", ["pending", "confirmed"]).gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString());
      if (ctx.branchId) q = q.eq("branch_id", ctx.branchId);
      const { data: busy } = await q;
      const slots = freeSlots({ date: a.date, hours, busy: busy ?? [], durationMin: a.duration_min, capacity, notBefore: new Date(Date.now() + 30 * 60000) });
      return { ok: true, note: slots.length ? `Free: ${slots.map((s) => s.local).join(", ")}` : "No free slots that day.", data: slots };
    },
  }),
  def({
    key: "book_appointment", permission: "appointments.write", description: "Create a confirmed appointment or reservation. Check availability first.",
    schema: z.object({ customer_name: z.string().trim().min(1).max(120), phone, starts_at: iso, kind: z.enum(["appointment", "reservation", "viewing", "callback"]), duration_min: z.number().int().min(10).max(480).optional(), party_size: z.number().int().min(1).max(100).optional(), notes: z.string().max(1000).optional() }),
    run: async (ctx, a) => {
      const starts = new Date(a.starts_at);
      if (starts.getTime() < Date.now()) throw new PermanentError("That time is in the past.");
      const ends = new Date(starts.getTime() + (a.duration_min ?? 30) * 60000);
      const { validateBooking } = await import("./booking-rules");
      const slot = await validateBooking(ctx.db, { orgId: ctx.orgId, branchId: ctx.branchId, employeeId: ctx.agent?.id, startsAt: starts, durationMin: a.duration_min ?? 30 });
      if (!slot.ok) return { ok: false, note: slot.reason === "outside_hours" ? `That time is outside opening hours. Free times that day: ${slot.alternatives.join(", ") || "none"}.` : `That time is fully booked. Free times that day: ${slot.alternatives.join(", ") || "none"}.`, data: { alternatives: slot.alternatives } };
      const customerId = await upsertCustomer(ctx, a.phone, a.customer_name);
      const { data, error } = await ctx.db.from("appointments").insert({
        organization_id: ctx.orgId, branch_id: ctx.branchId ?? null, customer_id: customerId, employee_id: ctx.agent?.id ?? null, conversation_id: ctx.conversationId ?? null,
        kind: a.kind, starts_at: starts.toISOString(), ends_at: ends.toISOString(), party_size: a.party_size ?? null, notes: a.notes ?? null, status: "confirmed",
      }).select("id").single();
      if (error) throw new PermanentError(error.message);
      await emit(ctx, "appointment_created", { appointment_id: data.id, customer_id: customerId, phone: a.phone, starts_at: starts.toISOString() });
      return { ok: true, note: `Booked ${a.kind} for ${starts.toISOString()}.`, data: { appointment_id: data.id, customer_id: customerId } };
    },
  }),
  def({
    key: "reschedule_appointment", permission: "appointments.write", description: "Move an existing appointment to a new time.",
    schema: z.object({ appointment_id: z.string().uuid(), starts_at: iso }),
    run: async (ctx, a) => {
      const starts = new Date(a.starts_at);
      if (starts.getTime() < Date.now()) throw new PermanentError("That time is in the past.");
      const { validateBooking } = await import("./booking-rules");
      const slot = await validateBooking(ctx.db, { orgId: ctx.orgId, branchId: ctx.branchId, employeeId: ctx.agent?.id, startsAt: starts, durationMin: 30, ignoreAppointmentId: a.appointment_id });
      if (!slot.ok) return { ok: false, note: `That time is not available (${slot.reason === "full" ? "fully booked" : "outside opening hours"}). Free times: ${slot.alternatives.join(", ") || "none"}.` };
      const { data, error } = await ctx.db.from("appointments").update({ starts_at: starts.toISOString(), ends_at: new Date(starts.getTime() + 30 * 60000).toISOString() }).eq("id", a.appointment_id).eq("organization_id", ctx.orgId).in("status", ["pending", "confirmed"]).select("id").maybeSingle();
      if (error) throw new PermanentError(error.message);
      return data ? { ok: true, note: "Appointment moved." } : { ok: false, note: "Appointment not found or already closed." };
    },
  }),
  def({
    key: "cancel_appointment", permission: "appointments.cancel", description: "Cancel an appointment (requires staff confirmation).",
    schema: z.object({ appointment_id: z.string().uuid(), reason: z.string().max(300).optional() }),
    run: async (ctx, a) => {
      const { data, error } = await ctx.db.from("appointments").update({ status: "canceled", notes: a.reason ?? null }).eq("id", a.appointment_id).eq("organization_id", ctx.orgId).select("id, customer_id").maybeSingle();
      if (error) throw new PermanentError(error.message);
      if (!data) return { ok: false, note: "Appointment not found." };
      await emit(ctx, "appointment_canceled", { appointment_id: data.id, customer_id: data.customer_id });
      return { ok: true, note: "Appointment canceled." };
    },
  }),
  def({
    key: "create_lead", permission: "leads.write", description: "Record a sales lead with what they are interested in.",
    schema: z.object({ phone, name: z.string().trim().max(120).optional(), interest: z.string().trim().max(500).optional(), estimated_value: z.number().min(0).max(10_000_000).optional() }),
    run: async (ctx, a) => {
      const customerId = await upsertCustomer(ctx, a.phone, a.name);
      const { data: open } = await ctx.db.from("leads").select("id").eq("organization_id", ctx.orgId).eq("customer_id", customerId).not("stage", "in", "(converted,lost)").maybeSingle();
      if (open) {
        await ctx.db.from("leads").update({ interest: a.interest ?? undefined, estimated_value: a.estimated_value ?? undefined }).eq("id", open.id);
        return { ok: true, note: "Updated the existing open lead.", data: { lead_id: open.id } };
      }
      const { data, error } = await ctx.db.from("leads").insert({
        organization_id: ctx.orgId, branch_id: ctx.branchId ?? null, customer_id: customerId, agent_id: ctx.agent?.id ?? null,
        source: ctx.channel === "whatsapp" ? "whatsapp" : ctx.channel === "web_chat" ? "web_chat" : ctx.actor === "human" ? "manual" : "phone",
        interest: a.interest ?? null, estimated_value: a.estimated_value ?? null,
      }).select("id").single();
      if (error) throw new PermanentError(error.message);
      const { rescoreLead } = await import("./crm");
      const score = await rescoreLead(ctx.db, ctx.orgId, data.id);
      await emit(ctx, "lead_created", { lead_id: data.id, customer_id: customerId, lead_score: score });
      return { ok: true, note: "Lead recorded.", data: { lead_id: data.id } };
    },
  }),
  def({
    key: "update_lead_stage", permission: "leads.write", description: "Move a lead through the pipeline.",
    schema: z.object({ lead_id: z.string().uuid(), stage: z.enum(["new", "contacted", "interested", "qualified", "converted", "lost"]), lost_reason: z.string().max(300).optional() }),
    run: async (ctx, a) => {
      const { data, error } = await ctx.db.from("leads").update({ stage: a.stage, lost_reason: a.stage === "lost" ? a.lost_reason ?? null : null, stage_changed_at: new Date().toISOString() }).eq("id", a.lead_id).eq("organization_id", ctx.orgId).select("id").maybeSingle();
      if (error) throw new PermanentError(error.message);
      if (!data) return { ok: false, note: "Lead not found." };
      const { rescoreLead } = await import("./crm");
      await rescoreLead(ctx.db, ctx.orgId, a.lead_id);
      return { ok: true, note: `Lead moved to ${a.stage}.` };
    },
  }),
  def({
    key: "create_support_case", permission: "tasks.write", description: "Open a support case for staff to resolve.",
    schema: z.object({ subject: z.string().trim().min(3).max(200), details: z.string().max(5000).optional(), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), phone: phone.optional() }),
    run: async (ctx, a) => {
      const customerId = a.phone ? await upsertCustomer(ctx, a.phone) : ctx.customerId ?? null;
      const { data, error } = await ctx.db.from("agent_tasks").insert({
        organization_id: ctx.orgId, branch_id: ctx.branchId ?? null, kind: "support_case", title: a.subject, details: a.details ?? null, priority: a.priority,
        conversation_id: ctx.conversationId ?? null, customer_id: customerId, created_by_agent: ctx.agent?.id ?? null, created_by_user: ctx.userId ?? null,
      }).select("id").single();
      if (error) throw new PermanentError(error.message);
      if (a.priority === "urgent" || a.priority === "high") await notify(ctx.db, { orgId: ctx.orgId, kind: "task", title: `Support case: ${a.subject}`, link: "/dashboard/live" });
      await emit(ctx, "ticket_created", { task_id: data.id, customer_id: customerId, text: `${a.subject}\n${a.details ?? ""}`, phone: a.phone });
      return { ok: true, note: `Support case opened (ref ${String(data.id).slice(0, 8)}).`, data: { task_id: data.id } };
    },
  }),
  def({
    key: "create_task", permission: "tasks.write", description: "Create a follow-up task, optionally delegated to another AI employee role.",
    schema: z.object({ title: z.string().trim().min(2).max(200), kind: z.enum(["follow_up", "callback", "booking", "support_case", "escalation", "report", "custom"]).default("follow_up"), details: z.string().max(5000).optional(), due_minutes: z.number().int().min(0).max(60 * 24 * 60).optional(), delegate_to_role: z.enum(["receptionist", "sales", "support", "manager", "booking"]).optional() }),
    run: async (ctx, a) => {
      let delegate: string | null = null;
      if (a.delegate_to_role) {
        const { data: ag } = await ctx.db.from("ai_employees").select("id").eq("organization_id", ctx.orgId).eq("role", a.delegate_to_role).eq("status", "active").limit(1).maybeSingle();
        delegate = (ag?.id as string) ?? null;
      }
      const { data, error } = await ctx.db.from("agent_tasks").insert({
        organization_id: ctx.orgId, branch_id: ctx.branchId ?? null, agent_id: delegate, kind: a.kind, title: a.title, details: a.details ?? null,
        due_at: a.due_minutes !== undefined ? new Date(Date.now() + a.due_minutes * 60000).toISOString() : null,
        conversation_id: ctx.conversationId ?? null, customer_id: ctx.customerId ?? null, created_by_agent: ctx.agent?.id ?? null, created_by_user: ctx.userId ?? null,
      }).select("id").single();
      if (error) throw new PermanentError(error.message);
      return { ok: true, note: delegate ? `Task delegated to the ${a.delegate_to_role} AI employee.` : a.delegate_to_role ? `No active ${a.delegate_to_role} AI employee; task left for staff.` : "Task created for staff.", data: { task_id: data.id } };
    },
  }),
  def({
    key: "send_whatsapp", permission: "messages.send", description: "Send a WhatsApp message. Free text only inside the 24-hour window after the customer's last message; otherwise an approved template.",
    schema: z.object({ to: phone, text: z.string().trim().min(1).max(4096).optional(), template: z.string().regex(/^[a-z0-9_]{1,512}$/).optional(), template_params: z.array(z.string().max(200)).max(10).optional() }).refine((v) => v.text || v.template, "text or template required"),
    run: async (ctx, a) => {
      if (!providerStatus("whatsapp").configured) return { ok: false, note: "WhatsApp is not configured on the server; message NOT sent." };
      const { data: integ } = await ctx.db.from("integrations").select("status").eq("organization_id", ctx.orgId).eq("provider", "whatsapp").maybeSingle();
      if (integ?.status !== "connected") return { ok: false, note: "WhatsApp is not connected for this business; message NOT sent." };
      const to = normPhone(a.to);
      const { data: cust } = await ctx.db.from("customers").select("id, whatsapp_opt_in, whatsapp_last_inbound_at").eq("organization_id", ctx.orgId).eq("phone", to).maybeSingle();
      const inWindow = cust?.whatsapp_last_inbound_at && Date.now() - new Date(cust.whatsapp_last_inbound_at).getTime() < 24 * 3600 * 1000;
      let r: { ok: true; id: string } | { ok: false; error: string };
      if (a.text && inWindow) r = await sendWhatsAppText(to, a.text);
      else {
        if (!cust?.whatsapp_opt_in) return { ok: false, note: "Customer has not opted in to WhatsApp messages and is outside the 24-hour window; message NOT sent." };
        if (!a.template) return { ok: false, note: "Outside the 24-hour window an approved template is required; message NOT sent." };
        const { data: tpl } = await ctx.db.from("whatsapp_templates").select("name, language, status").eq("organization_id", ctx.orgId).eq("name", a.template).eq("status", "approved").limit(1).maybeSingle();
        if (!tpl) return { ok: false, note: `Template "${a.template}" is not approved; message NOT sent.` };
        r = await sendWhatsAppTemplate(to, tpl.name as string, tpl.language as string, a.template_params ?? []);
      }
      if (!r.ok) throw new Error(r.error); // may be transient → retry policy decides
      if (ctx.conversationId) await ctx.db.from("messages").insert({ conversation_id: ctx.conversationId, organization_id: ctx.orgId, role: "ai", content: a.text ?? `[template:${a.template}]`, provider_message_id: r.id, delivery_status: "sent" });
      await ctx.db.from("usage_records").insert({ organization_id: ctx.orgId, employee_id: ctx.agent?.id ?? null, metric: "whatsapp_messages", quantity: 1, period_start: new Date().toISOString().slice(0, 10) });
      return { ok: true, note: `WhatsApp accepted by Meta (to ${maskPhone(to)}).`, data: { message_id: r.id } };
    },
  }),
  def({
    key: "list_products", permission: "orders.read", description: "The business's real product/menu list with current prices. Use it before quoting any price.",
    schema: z.object({ search: z.string().trim().max(80).optional() }),
    run: async (ctx, a) => {
      let q = ctx.db.from("products").select("id, name, price, currency, description").eq("organization_id", ctx.orgId).eq("is_active", true).order("name").limit(40);
      if (a.search) q = q.ilike("name", `%${a.search.replace(/[%_]/g, "")}%`);
      const { data } = await q;
      if (!data?.length) return { ok: true, note: "No products are listed. Do not quote prices; offer to check with staff." , data: [] };
      return { ok: true, note: `${data.length} products.`, data };
    },
  }),
  def({
    key: "take_order", permission: "orders.write", description: "Place an order from the product list. Prices and total are calculated by the system; the order is created as PENDING for staff to confirm.",
    schema: z.object({
      items: z.array(z.object({ product: z.string().trim().min(1).max(160), quantity: z.number().int().min(1).max(99) })).min(1).max(20),
      phone, customer_name: z.string().trim().max(120).optional(),
      fulfillment: z.enum(["pickup", "delivery", "dine_in"]).default("pickup"), notes: z.string().max(500).optional(),
      address: z.object({
        area: z.string().trim().max(80), block: z.string().trim().max(20), street: z.string().trim().max(120).optional(), avenue: z.string().trim().max(60).optional(),
        house: z.string().trim().max(40).optional(), floor: z.string().trim().max(20).optional(), apartment: z.string().trim().max(20).optional(), notes: z.string().trim().max(300).optional(),
      }).optional().describe("Required for delivery: Kuwait address — area, block, street, house (avenue/floor/apartment if any)."),
    }),
    run: async (ctx, a) => {
      if (a.fulfillment === "delivery") {
        const { missingAddressParts } = await import("@/lib/orders");
        const miss = missingAddressParts(a.address);
        if (miss.length) return { ok: false, note: `Ask the customer for their delivery address: ${miss.join(", ").replace("house_or_street", "house number or street")}. Nothing was ordered yet.` };
      }
      const { data: catalogue } = await ctx.db.from("products").select("id, name").eq("organization_id", ctx.orgId).eq("is_active", true);
      const byName = (n: string) => (catalogue ?? []).find((p: { id: string; name: string }) => p.id === n || p.name.toLowerCase() === n.toLowerCase())
        ?? (catalogue ?? []).filter((p: { name: string }) => p.name.toLowerCase().includes(n.toLowerCase())).at(0);
      const missing = a.items.filter((i) => !byName(i.product)).map((i) => i.product);
      if (missing.length) return { ok: false, note: `Not on the menu: ${missing.join(", ")}. Call list_products and ask the customer to choose.` };
      const customerId = await upsertCustomer(ctx, a.phone, a.customer_name);
      const { data: id, error } = await ctx.db.rpc("create_order", {
        p_org: ctx.orgId, p_items: a.items.map((i) => ({ product_id: byName(i.product)!.id, quantity: i.quantity })),
        p_customer: customerId, p_conversation: ctx.conversationId ?? null, p_fulfillment: a.fulfillment, p_notes: a.notes ?? null, p_agent: ctx.agent?.id ?? null, p_status: "pending",
        p_address: a.fulfillment === "delivery" ? a.address ?? null : null,
      });
      if (error) {
        const { orderErrorMessage } = await import("@/lib/orders");
        const friendly = orderErrorMessage(error.message);
        if (friendly) return { ok: false, note: `${friendly} Nothing was ordered. Call list_delivery_areas if it's about the area.` };
        throw new PermanentError(error.message);
      }
      const { data: o } = await ctx.db.from("orders").select("order_no, total, delivery_fee, currency").eq("id", id).eq("organization_id", ctx.orgId).single();
      await notify(ctx.db, { orgId: ctx.orgId, kind: "task", title: `New order #${o?.order_no} to confirm`, body: `${o?.total} ${o?.currency}`, link: "/dashboard/orders" });
      const fee = Number(o?.delivery_fee ?? 0) > 0 ? ` (includes delivery ${o?.delivery_fee} ${o?.currency})` : "";
      return { ok: true, note: `Order #${o?.order_no} placed as PENDING, total ${o?.total} ${o?.currency}${fee}. Tell the customer staff will confirm it.`, data: { order_id: id, order_no: o?.order_no, total: o?.total, delivery_fee: o?.delivery_fee } };
    },
  }),
  def({
    key: "list_delivery_areas", permission: "orders.read", description: "Areas the business delivers to, with delivery fee and minimum order. Use before promising delivery or quoting a delivery fee.",
    schema: z.object({}),
    run: async (ctx) => {
      const { data } = await ctx.db.from("delivery_zones").select("name, areas, fee, min_order").eq("organization_id", ctx.orgId).eq("is_active", true).order("name").limit(60);
      if (!data?.length) return { ok: true, note: "No delivery zones are configured: delivery is possible anywhere without a fee unless staff say otherwise. Don't promise delivery times.", data: [] };
      return { ok: true, note: `${data.length} delivery zones.`, data };
    },
  }),
  def({
    key: "lookup_order", permission: "orders.read", description: "Status of one of THIS customer's orders by order number.",
    schema: z.object({ order_no: z.number().int().min(1).max(99999999) }),
    run: async (ctx, a) => {
      if (!ctx.customerId) return { ok: false, note: "I can't verify who the customer is in this conversation, so I can't share order details. Offer a staff callback." };
      const { data: o } = await ctx.db.from("orders").select("order_no, status, total, currency, fulfillment, created_at, customer_id, out_for_delivery_at").eq("organization_id", ctx.orgId).eq("order_no", a.order_no).maybeSingle();
      if (!o || o.customer_id !== ctx.customerId) return { ok: false, note: "No order with that number for this customer." };
      return { ok: true, note: `Order #${o.order_no} is ${o.status}.`, data: { order_no: o.order_no, status: o.status, total: o.total, currency: o.currency, fulfillment: o.fulfillment, placed_at: o.created_at } };
    },
  }),
  def({
    key: "transfer_to_human", permission: "calls.transfer", description: "Escalate the conversation to a human staff member.",
    schema: z.object({ reason: z.string().trim().min(2).max(300) }),
    run: async (ctx, a) => {
      if (ctx.conversationId) await ctx.db.from("conversations").update({ status: "transferred", escalated_at: new Date().toISOString(), current_task: `Escalated: ${a.reason}` }).eq("id", ctx.conversationId).eq("organization_id", ctx.orgId);
      await notify(ctx.db, { orgId: ctx.orgId, kind: "escalation", title: `Escalation from ${ctx.agent?.name ?? "AI employee"}`, body: a.reason, link: "/dashboard/live" });
      return { ok: true, transfer: true, note: "Escalated. Tell the customer a team member will take over." };
    },
  }),
  def({
    key: "get_business_metrics", permission: "reports.read", description: "Measured business metrics for a period (calls, conversations, appointments, leads, agents).",
    schema: z.object({ period: z.enum(["today", "last_7_days", "this_month", "last_month", "last_30_days"]).default("this_month") }),
    run: async (ctx, a) => {
      const { computeMetrics, periodRange } = await import("./bi");
      const [from, to] = periodRange(a.period);
      return { ok: true, note: "Measured metrics (from your data).", data: await computeMetrics(ctx.db, ctx.orgId, from, to, ctx.branchId ?? null) };
    },
  }),
];

export const toolByKey = (k: string) => TOOLS.find((t) => t.key === k);

/** OpenAI function-tool specs for a set of tool keys. */
export async function openAiToolSpecs(keys: string[]) {
  const { zodToJsonSchema } = await import("./zod-json");
  return TOOLS.filter((t) => keys.includes(t.key)).map((t) => ({ type: "function" as const, function: { name: t.key, description: t.description, parameters: zodToJsonSchema(t.schema) } }));
}
