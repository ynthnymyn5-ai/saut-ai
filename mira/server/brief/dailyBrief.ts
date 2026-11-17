/**
 * Daily brief: today's meetings, urgent tasks, follow-ups due and key
 * numbers, written up by the Chief of Staff in the owner's language.
 */
import { z } from "zod";
import { and, desc, eq, inArray, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { llm } from "../llm";
import { addDays, dateKey, nowForPrompt, startOfDay, startOfMonth, startOfNextMonth, TZ } from "../lib/time";
import { listEvents } from "../integrations/google/calendar";
import { unreadCount } from "../integrations/google/gmail";
import { financeTotals } from "../tools/finance";
import { defineTool, L } from "../tools/types";
import { env } from "../env";
import type { BriefDTO, Lang } from "@shared/types";

export async function buildBriefData(): Promise<BriefDTO["data"]> {
  const today = startOfDay();
  const tomorrow = addDays(today, 1);
  const [events, urgent, followUps, month, pipeline, open, unread] = await Promise.all([
    listEvents(today, tomorrow).catch(() => []),
    db
      .select()
      .from(schema.tasks)
      .where(and(ne(schema.tasks.status, "done"), or(inArray(schema.tasks.priority, ["urgent", "high"]), lte(schema.tasks.dueAt, tomorrow))))
      .orderBy(sql`case ${schema.tasks.priority} when 'urgent' then 0 when 'high' then 1 else 2 end`, schema.tasks.dueAt)
      .limit(8),
    db
      .select()
      .from(schema.leads)
      .where(and(lte(schema.leads.followUpAt, tomorrow), notInArray(schema.leads.stage, ["won", "lost"])))
      .orderBy(schema.leads.followUpAt)
      .limit(8),
    financeTotals(startOfMonth(), startOfNextMonth()),
    db.select({ v: sql<string>`coalesce(sum(${schema.leads.value}),0)` }).from(schema.leads).where(notInArray(schema.leads.stage, ["won", "lost"])),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.tasks).where(ne(schema.tasks.status, "done")),
    unreadCount().catch(() => 0),
  ]);
  return {
    meetings: events.map((e) => ({ title: e.title, start: e.start, end: e.end, location: e.location ?? null })),
    urgentTasks: urgent.map((t) => ({ id: t.id, title: t.title, priority: t.priority, dueAt: t.dueAt?.toISOString() ?? null })),
    followUps: followUps.map((l) => ({ id: l.id, name: l.name, company: l.company, nextStep: l.nextStep, followUpAt: l.followUpAt?.toISOString() ?? null })),
    numbers: {
      monthIncome: month.income,
      monthExpenses: month.expenses,
      net: month.net,
      pipelineValue: Number(pipeline[0].v),
      openTasks: open[0].n,
      unreadEmails: unread,
      currency: env.CURRENCY,
    },
  };
}

/** Deterministic text used offline (and as the fallback if the model fails). */
function templateBrief(d: BriefDTO["data"], lang: Lang): string {
  const t = (iso: string) => new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const n = d.numbers;
  if (lang === "ar") {
    return [
      "صباح الخير! هذا موجزك لليوم:",
      d.meetings.length ? `📅 ${d.meetings.length} اجتماع: ${d.meetings.map((m) => `${t(m.start)} ${m.title}`).join("، ")}` : "📅 لا توجد اجتماعات اليوم.",
      d.urgentTasks.length ? `🔥 مهام عاجلة: ${d.urgentTasks.slice(0, 4).map((x) => x.title).join("، ")}` : "✅ لا توجد مهام عاجلة.",
      d.followUps.length ? `🤝 متابعات مستحقة: ${d.followUps.map((f) => f.name).join("، ")}` : "",
      `💰 هذا الشهر: دخل ${n.monthIncome.toLocaleString()} ومصاريف ${n.monthExpenses.toLocaleString()} ${n.currency}. المسار البيعي ${n.pipelineValue.toLocaleString()} ${n.currency}. ${n.unreadEmails} رسالة غير مقروءة.`,
    ].filter(Boolean).join("\n");
  }
  return [
    "Good morning! Here's your brief for today:",
    d.meetings.length ? `📅 ${d.meetings.length} meeting(s): ${d.meetings.map((m) => `${t(m.start)} ${m.title}`).join(", ")}` : "📅 No meetings today.",
    d.urgentTasks.length ? `🔥 Urgent: ${d.urgentTasks.slice(0, 4).map((x) => x.title).join(", ")}` : "✅ Nothing urgent.",
    d.followUps.length ? `🤝 Follow-ups due: ${d.followUps.map((f) => `${f.name}${f.nextStep ? ` (${f.nextStep})` : ""}`).join(", ")}` : "",
    `💰 This month: ${n.monthIncome.toLocaleString()} ${n.currency} in, ${n.monthExpenses.toLocaleString()} out (net ${n.net.toLocaleString()}). Pipeline ${n.pipelineValue.toLocaleString()} ${n.currency}. ${n.unreadEmails} unread email(s).`,
  ].filter(Boolean).join("\n");
}

export async function generateBrief(lang: Lang = "en", force = false): Promise<BriefDTO> {
  const key = dateKey();
  if (!force) {
    const [existing] = await db.select().from(schema.briefs).where(and(eq(schema.briefs.date, key), eq(schema.briefs.lang, lang))).orderBy(desc(schema.briefs.createdAt)).limit(1);
    if (existing && Date.now() - existing.createdAt.getTime() < 3 * 3600_000) {
      return { date: existing.date, lang, text: existing.text, data: existing.data as BriefDTO["data"], generatedAt: existing.createdAt.toISOString() };
    }
  }
  const data = await buildBriefData();
  let text = templateBrief(data, lang);
  if (llm().isReal) {
    try {
      const res = await llm().chat({
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: `You are Mira, the owner's Chief of Staff. ${nowForPrompt()}
Write a crisp morning brief in ${lang === "ar" ? "Arabic" : "English"} from the JSON data: greeting, meetings with times, the 3 most important things to do today, follow-ups due, and the key numbers.
Close with one sharp recommendation. Max ~170 words, short lines, a few emoji as section markers, no markdown headings. Times are in ${TZ}.`,
          },
          { role: "user", content: JSON.stringify(data) },
        ],
      });
      if (res.content) text = res.content.trim();
    } catch (e) {
      console.error("[brief] model failed, using template", e);
    }
  }
  const [row] = await db.insert(schema.briefs).values({ date: key, lang, text, data }).returning();
  return { date: key, lang, text, data, generatedAt: row.createdAt.toISOString() };
}

export const getDailyBriefTool = defineTool({
  name: "get_daily_brief",
  description: "Get today's brief: meetings, urgent tasks, follow-ups due and key numbers.",
  agents: ["chief"],
  schema: z.object({ refresh: z.boolean().nullish() }),
  summarize: (_a, lang) => L(lang, "Prepare daily brief", "إعداد الموجز اليومي"),
  async run(a, ctx) {
    const b = await generateBrief(ctx.lang, Boolean(a.refresh));
    return { brief: b.data, say: b.text };
  },
});
