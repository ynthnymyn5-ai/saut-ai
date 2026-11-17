/** Operations agent tools: tasks (Kanban) and reminders. */
import { z } from "zod";
import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { defineTool, L } from "./types";
import { toDate, TZ } from "../lib/time";

const fmt = (d: Date | null, lang: "en" | "ar") =>
  d ? new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) : "";

const priority = z.enum(["low", "medium", "high", "urgent"]);
const status = z.enum(["todo", "in_progress", "done"]);

export const addTask = defineTool({
  name: "add_task",
  description: "Create a task on the Operations Kanban board. Use for to-dos, calls, follow-ups the owner must do.",
  agents: ["operations", "chief"],
  mutates: true,
  schema: z.object({
    title: z.string().min(1).describe("Short imperative title, e.g. 'Call Ahmed'"),
    description: z.string().nullish(),
    dueAt: z.string().nullish().describe("ISO-8601 datetime with offset"),
    priority: priority.nullish(),
    project: z.string().nullish(),
    remind: z.boolean().nullish().describe("Also send a reminder notification at the due time (default true when dueAt has a time)"),
  }),
  summarize: (a, lang) => L(lang, `Add task “${a.title}”`, `إضافة مهمة «${a.title}»`),
  async run(a, ctx) {
    const due = toDate(a.dueAt);
    const [task] = await db
      .insert(schema.tasks)
      .values({ title: a.title, description: a.description ?? null, dueAt: due, priority: a.priority ?? "medium", project: a.project ?? null })
      .returning();
    if (due && a.remind !== false && due.getTime() > Date.now()) {
      await db.insert(schema.reminders).values({ text: a.title, remindAt: due, taskId: task.id });
    }
    return {
      task,
      say: L(ctx.lang, `Added task “${task.title}”${due ? ` for ${fmt(due, "en")}` : ""}${due ? " — I'll remind you then." : "."}`, `أضفت مهمة «${task.title}»${due ? ` بتاريخ ${fmt(due, "ar")} وسأذكّرك في وقتها.` : "."}`),
    };
  },
});

export const listTasks = defineTool({
  name: "list_tasks",
  description: "List tasks. Filter by status ('open' = not done), priority, project or text.",
  agents: ["operations", "chief"],
  schema: z.object({
    status: z.enum(["open", "todo", "in_progress", "done", "all"]).nullish(),
    priority: priority.nullish(),
    query: z.string().nullish(),
    limit: z.number().int().min(1).max(100).nullish(),
  }),
  summarize: (_a, lang) => L(lang, "List tasks", "عرض المهام"),
  async run(a, ctx) {
    const conds = [];
    const st = a.status ?? "open";
    if (st === "open") conds.push(ne(schema.tasks.status, "done"));
    else if (st !== "all") conds.push(eq(schema.tasks.status, st));
    if (a.priority) conds.push(eq(schema.tasks.priority, a.priority));
    if (a.query) conds.push(or(ilike(schema.tasks.title, `%${a.query}%`), ilike(schema.tasks.project, `%${a.query}%`)));
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(sql`case ${schema.tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`, asc(schema.tasks.dueAt))
      .limit(a.limit ?? 20);
    const lines = rows.map((t) => `• ${t.title} [${t.priority}${t.dueAt ? `, ${fmt(t.dueAt, ctx.lang)}` : ""}]`).join("\n");
    return {
      tasks: rows,
      say: rows.length ? L(ctx.lang, `You have ${rows.length} task(s):\n${lines}`, `لديك ${rows.length} مهمة:\n${lines}`) : L(ctx.lang, "No matching tasks.", "لا توجد مهام مطابقة."),
    };
  },
});

export const updateTask = defineTool({
  name: "update_task",
  description: "Update a task (status, priority, title, due date, project). Find the id with list_tasks first.",
  agents: ["operations", "chief"],
  mutates: true,
  schema: z.object({
    id: z.number().int(),
    title: z.string().nullish(),
    status: status.nullish(),
    priority: priority.nullish(),
    dueAt: z.string().nullish(),
    project: z.string().nullish(),
    description: z.string().nullish(),
  }),
  summarize: (a, lang) => L(lang, `Update task #${a.id}${a.status ? ` → ${a.status}` : ""}`, `تحديث المهمة رقم ${a.id}`),
  async run(a, ctx) {
    const patch: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: new Date() };
    if (a.title) patch.title = a.title;
    if (a.status) patch.status = a.status;
    if (a.priority) patch.priority = a.priority;
    if (a.project !== undefined && a.project !== null) patch.project = a.project;
    if (a.description) patch.description = a.description;
    if (a.dueAt) patch.dueAt = toDate(a.dueAt);
    const [t] = await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, a.id)).returning();
    if (!t) return { say: L(ctx.lang, `Task #${a.id} not found.`, `لم أجد المهمة رقم ${a.id}.`) };
    return { task: t, say: L(ctx.lang, `Updated “${t.title}” (${t.status.replace("_", " ")}).`, `تم تحديث «${t.title}».`) };
  },
});

export const deleteTask = defineTool({
  name: "delete_task",
  description: "Permanently delete a task. Requires owner confirmation.",
  agents: ["operations", "chief"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.number().int(), title: z.string().nullish().describe("task title, for the confirmation message") }),
  summarize: (a, lang) => L(lang, `Delete task #${a.id}${a.title ? ` “${a.title}”` : ""}`, `حذف المهمة رقم ${a.id}${a.title ? ` «${a.title}»` : ""}`),
  async run(a, ctx) {
    const [t] = await db.delete(schema.tasks).where(eq(schema.tasks.id, a.id)).returning();
    return { say: t ? L(ctx.lang, `Deleted “${t.title}”.`, `تم حذف «${t.title}».`) : L(ctx.lang, "Task not found.", "المهمة غير موجودة.") };
  },
});

export const createReminder = defineTool({
  name: "create_reminder",
  description: "Schedule a push/Telegram reminder at a specific time (without creating a task).",
  agents: ["operations", "chief"],
  mutates: true,
  schema: z.object({ text: z.string(), remindAt: z.string().describe("ISO-8601 datetime with offset") }),
  summarize: (a, lang) => L(lang, `Remind: ${a.text}`, `تذكير: ${a.text}`),
  async run(a, ctx) {
    const at = toDate(a.remindAt);
    if (!at) return { say: L(ctx.lang, "I couldn't understand that time.", "لم أفهم الوقت المطلوب.") };
    const [r] = await db.insert(schema.reminders).values({ text: a.text, remindAt: at }).returning();
    return { reminder: r, say: L(ctx.lang, `Reminder set for ${fmt(at, "en")}.`, `تم ضبط التذكير ${fmt(at, "ar")}.`) };
  },
});

export const recentDoneTasks = async () =>
  db.select().from(schema.tasks).where(eq(schema.tasks.status, "done")).orderBy(desc(schema.tasks.updatedAt)).limit(5);

export const operationsTools = [addTask, listTasks, updateTask, deleteTask, createReminder];
