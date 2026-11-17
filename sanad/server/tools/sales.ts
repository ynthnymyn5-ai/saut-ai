/** Sales agent tools: CRM-style leads pipeline. */
import { z } from "zod";
import { and, asc, eq, ilike, lte, notInArray, or, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { defineTool, L } from "./types";
import { toDate, addDays, startOfDay } from "../lib/time";
import { env } from "../env";

const stage = z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]);

export const addLead = defineTool({
  name: "add_lead",
  description: "Add a lead/prospect to the sales pipeline.",
  agents: ["sales", "chief"],
  mutates: true,
  schema: z.object({
    name: z.string(),
    company: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    stage: stage.nullish(),
    value: z.number().nullish().describe("Estimated deal value"),
    currency: z.string().nullish(),
    nextStep: z.string().nullish(),
    followUpAt: z.string().nullish().describe("ISO-8601 datetime"),
    notes: z.string().nullish(),
  }),
  summarize: (a, lang) => L(lang, `Add lead ${a.name}${a.company ? ` (${a.company})` : ""}`, `إضافة عميل محتمل ${a.name}`),
  async run(a, ctx) {
    const [lead] = await db
      .insert(schema.leads)
      .values({
        name: a.name,
        company: a.company ?? null,
        email: a.email ?? null,
        phone: a.phone ?? null,
        stage: a.stage ?? "new",
        value: String(a.value ?? 0),
        currency: a.currency ?? env.CURRENCY,
        nextStep: a.nextStep ?? null,
        followUpAt: toDate(a.followUpAt),
        notes: a.notes ?? null,
      })
      .returning();
    return { lead, say: L(ctx.lang, `Added ${lead.name} to the pipeline (${lead.stage}).`, `أضفت ${lead.name} إلى مسار المبيعات.`) };
  },
});

export const listLeads = defineTool({
  name: "list_leads",
  description: "List leads. Use dueFollowUps=true for follow-ups due today or overdue.",
  agents: ["sales", "chief"],
  schema: z.object({
    stage: stage.nullish(),
    query: z.string().nullish(),
    dueFollowUps: z.boolean().nullish(),
    includeClosed: z.boolean().nullish(),
  }),
  summarize: (_a, lang) => L(lang, "List leads", "عرض العملاء المحتملين"),
  async run(a, ctx) {
    const conds: SQL[] = [];
    if (a.stage) conds.push(eq(schema.leads.stage, a.stage));
    else if (!a.includeClosed) conds.push(notInArray(schema.leads.stage, ["won", "lost"]));
    if (a.query) conds.push(or(ilike(schema.leads.name, `%${a.query}%`), ilike(schema.leads.company, `%${a.query}%`))!);
    if (a.dueFollowUps) conds.push(lte(schema.leads.followUpAt, addDays(startOfDay(), 1)));
    const rows = await db.select().from(schema.leads).where(conds.length ? and(...conds) : undefined).orderBy(asc(schema.leads.followUpAt)).limit(50);
    const total = rows.reduce((s, l) => s + Number(l.value), 0);
    const lines = rows.slice(0, 10).map((l) => `• ${l.name}${l.company ? ` (${l.company})` : ""} — ${l.stage}, ${Number(l.value).toLocaleString()} ${l.currency}${l.nextStep ? ` → ${l.nextStep}` : ""}`).join("\n");
    return {
      leads: rows,
      totalValue: total,
      say: rows.length
        ? L(ctx.lang, `${rows.length} lead(s), ${total.toLocaleString()} ${env.CURRENCY} in pipeline:\n${lines}`, `${rows.length} عميل محتمل بقيمة ${total.toLocaleString()} ${env.CURRENCY}:\n${lines}`)
        : L(ctx.lang, "No matching leads.", "لا يوجد عملاء مطابقون."),
    };
  },
});

export const updateLead = defineTool({
  name: "update_lead",
  description: "Update a lead: move stage, change value, next step, follow-up date or notes.",
  agents: ["sales", "chief"],
  mutates: true,
  schema: z.object({
    id: z.number().int(),
    stage: stage.nullish(),
    value: z.number().nullish(),
    nextStep: z.string().nullish(),
    followUpAt: z.string().nullish(),
    notes: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
  }),
  summarize: (a, lang) => L(lang, `Update lead #${a.id}${a.stage ? ` → ${a.stage}` : ""}`, `تحديث العميل رقم ${a.id}`),
  async run(a, ctx) {
    const patch: Partial<typeof schema.leads.$inferInsert> = { updatedAt: new Date() };
    if (a.stage) patch.stage = a.stage;
    if (a.value != null) patch.value = String(a.value);
    if (a.nextStep) patch.nextStep = a.nextStep;
    if (a.followUpAt) patch.followUpAt = toDate(a.followUpAt);
    if (a.notes) patch.notes = a.notes;
    if (a.email) patch.email = a.email;
    if (a.phone) patch.phone = a.phone;
    const [l] = await db.update(schema.leads).set(patch).where(eq(schema.leads.id, a.id)).returning();
    if (!l) return { say: L(ctx.lang, "Lead not found.", "العميل غير موجود.") };
    return { lead: l, say: L(ctx.lang, `Updated ${l.name} (${l.stage}).`, `تم تحديث ${l.name}.`) };
  },
});

export const deleteLead = defineTool({
  name: "delete_lead",
  description: "Permanently delete a lead. Requires owner confirmation.",
  agents: ["sales"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.number().int(), name: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Delete lead #${a.id}${a.name ? ` ${a.name}` : ""}`, `حذف العميل رقم ${a.id}`),
  async run(a, ctx) {
    const [l] = await db.delete(schema.leads).where(eq(schema.leads.id, a.id)).returning();
    return { say: l ? L(ctx.lang, `Deleted ${l.name}.`, `تم حذف ${l.name}.`) : L(ctx.lang, "Lead not found.", "العميل غير موجود.") };
  },
});

export const salesTools = [addLead, listLeads, updateLead, deleteLead];
