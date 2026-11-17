/**
 * REST endpoints behind the agent panels (Kanban, CRM, finance, content,
 * notes, memory, calendar, inbox). The UI asks for confirmation before
 * calling DELETE; Mira's own deletions go through pending actions instead.
 */
import { Router, type Request } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, ilike, lt, lte, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { toDate, addDays, startOfDay, startOfMonth, startOfNextMonth } from "../lib/time";
import { logActivity } from "../lib/activity";
import { addMemory, updateMemory, searchMemories } from "../memory/service";
import { financeTotals, monthlySeries } from "../tools/finance";
import { listEvents } from "../integrations/google/calendar";
import { listMail } from "../integrations/google/gmail";
import { env } from "../env";

export const dataRouter = Router();

const id = (req: Request) => Number(req.params.id);
const dateish = z.union([z.string(), z.null()]).optional().transform((v) => (v === undefined ? undefined : toDate(v)));
const userLog = (action: string, summary: string, agentId: string) => logActivity({ action, summary, agentId, actor: "user" });

// ─── Tasks ───────────────────────────────────────────────────────────────────
const taskBody = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  project: z.string().nullish(),
  dueAt: dateish,
  position: z.number().int().optional(),
});

dataRouter.get("/tasks", async (_req, res) => {
  res.json(await db.select().from(schema.tasks).orderBy(asc(schema.tasks.position), desc(schema.tasks.createdAt)));
});
dataRouter.post("/tasks", async (req, res) => {
  const b = taskBody.parse(req.body);
  const [t] = await db.insert(schema.tasks).values({ ...b, dueAt: b.dueAt ?? null }).returning();
  await userLog("add_task", `Added task “${t.title}”`, "operations");
  res.json(t);
});
dataRouter.patch("/tasks/:id", async (req, res) => {
  const b = taskBody.partial().parse(req.body);
  const [t] = await db.update(schema.tasks).set({ ...b, updatedAt: new Date() }).where(eq(schema.tasks.id, id(req))).returning();
  res.json(t);
});
dataRouter.delete("/tasks/:id", async (req, res) => {
  const [t] = await db.delete(schema.tasks).where(eq(schema.tasks.id, id(req))).returning();
  if (t) await userLog("delete_task", `Deleted task “${t.title}”`, "operations");
  res.json({ ok: true });
});

// ─── Leads ───────────────────────────────────────────────────────────────────
const leadBody = z.object({
  name: z.string().min(1),
  company: z.string().nullish(),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  stage: z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]).optional(),
  value: z.coerce.number().optional().transform((v) => (v === undefined ? undefined : String(v))),
  currency: z.string().optional(),
  nextStep: z.string().nullish(),
  followUpAt: dateish,
  notes: z.string().nullish(),
});
dataRouter.get("/leads", async (_req, res) => {
  res.json(await db.select().from(schema.leads).orderBy(asc(schema.leads.followUpAt)));
});
dataRouter.post("/leads", async (req, res) => {
  const b = leadBody.parse(req.body);
  const [l] = await db.insert(schema.leads).values({ ...b, followUpAt: b.followUpAt ?? null, currency: b.currency ?? env.CURRENCY }).returning();
  await userLog("add_lead", `Added lead ${l.name}`, "sales");
  res.json(l);
});
dataRouter.patch("/leads/:id", async (req, res) => {
  const b = leadBody.partial().parse(req.body);
  const [l] = await db.update(schema.leads).set({ ...b, updatedAt: new Date() }).where(eq(schema.leads.id, id(req))).returning();
  res.json(l);
});
dataRouter.delete("/leads/:id", async (req, res) => {
  const [l] = await db.delete(schema.leads).where(eq(schema.leads.id, id(req))).returning();
  if (l) await userLog("delete_lead", `Deleted lead ${l.name}`, "sales");
  res.json({ ok: true });
});

// ─── Finance ─────────────────────────────────────────────────────────────────
const txBody = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.coerce.number().positive().transform(String),
  category: z.string().default("general"),
  description: z.string().nullish(),
  occurredAt: dateish,
});
dataRouter.get("/finance/transactions", async (_req, res) => {
  res.json(await db.select().from(schema.transactions).orderBy(desc(schema.transactions.occurredAt)).limit(200));
});
dataRouter.post("/finance/transactions", async (req, res) => {
  const b = txBody.parse(req.body);
  const [t] = await db.insert(schema.transactions).values({ ...b, category: b.category.toLowerCase(), occurredAt: b.occurredAt ?? new Date(), currency: env.CURRENCY }).returning();
  await userLog("log_transaction", `Logged ${t.type} ${t.amount} ${t.currency}`, "finance");
  res.json(t);
});
dataRouter.delete("/finance/transactions/:id", async (req, res) => {
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id(req)));
  await userLog("delete_transaction", `Deleted transaction #${id(req)}`, "finance");
  res.json({ ok: true });
});
dataRouter.get("/finance/summary", async (_req, res) => {
  const month = await financeTotals(startOfMonth(), startOfNextMonth());
  const series = await monthlySeries(6);
  res.json({ month, series, currency: env.CURRENCY });
});
dataRouter.get("/finance/invoices", async (_req, res) => {
  res.json(await db.select().from(schema.invoices).orderBy(desc(schema.invoices.issuedAt)));
});
dataRouter.patch("/finance/invoices/:id", async (req, res) => {
  const b = z.object({ status: z.enum(["draft", "sent", "paid", "overdue"]) }).parse(req.body);
  const [inv] = await db.update(schema.invoices).set(b).where(eq(schema.invoices.id, id(req))).returning();
  if (inv && b.status === "paid") {
    await db.insert(schema.transactions).values({ type: "income", amount: inv.amount, currency: inv.currency, category: "sales", description: `Invoice ${inv.number} — ${inv.client}` });
  }
  await userLog("update_invoice_status", `Invoice ${inv?.number} → ${b.status}`, "finance");
  res.json(inv);
});

// ─── Marketing content ───────────────────────────────────────────────────────
const contentBody = z.object({
  title: z.string().min(1),
  platform: z.string().optional(),
  caption: z.string().nullish(),
  status: z.enum(["idea", "draft", "scheduled", "published"]).optional(),
  scheduledFor: dateish,
});
dataRouter.get("/content", async (_req, res) => {
  res.json(await db.select().from(schema.contentItems).orderBy(asc(schema.contentItems.scheduledFor), desc(schema.contentItems.createdAt)));
});
dataRouter.post("/content", async (req, res) => {
  const b = contentBody.parse(req.body);
  const [c] = await db.insert(schema.contentItems).values({ ...b, scheduledFor: b.scheduledFor ?? null }).returning();
  res.json(c);
});
dataRouter.patch("/content/:id", async (req, res) => {
  const b = contentBody.partial().parse(req.body);
  const [c] = await db.update(schema.contentItems).set({ ...b, updatedAt: new Date() }).where(eq(schema.contentItems.id, id(req))).returning();
  if (b.status === "published") await userLog("publish_content", `Marked “${c.title}” as published`, "marketing");
  res.json(c);
});
dataRouter.delete("/content/:id", async (req, res) => {
  await db.delete(schema.contentItems).where(eq(schema.contentItems.id, id(req)));
  res.json({ ok: true });
});

// ─── Notes ───────────────────────────────────────────────────────────────────
const noteBody = z.object({
  agentId: z.enum(["researcher", "strategist", "engineering", "design"]),
  kind: z.string().default("note"),
  title: z.string().min(1),
  body: z.string().default(""),
  codeLanguage: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  data: z.record(z.string(), z.unknown()).nullish(),
});
dataRouter.get("/notes", async (req, res) => {
  const agent = req.query.agent as string | undefined;
  res.json(await db.select().from(schema.notes).where(agent ? eq(schema.notes.agentId, agent) : undefined).orderBy(desc(schema.notes.updatedAt)));
});
dataRouter.post("/notes", async (req, res) => {
  const b = noteBody.parse(req.body);
  const [n] = await db.insert(schema.notes).values(b).returning();
  res.json(n);
});
dataRouter.patch("/notes/:id", async (req, res) => {
  const b = noteBody.partial().parse(req.body);
  const [n] = await db.update(schema.notes).set({ ...b, updatedAt: new Date() }).where(eq(schema.notes.id, id(req))).returning();
  res.json(n);
});
dataRouter.delete("/notes/:id", async (req, res) => {
  const [n] = await db.delete(schema.notes).where(eq(schema.notes.id, id(req))).returning();
  if (n) await userLog("delete_note", `Deleted note “${n.title}”`, n.agentId);
  res.json({ ok: true });
});

// ─── Memory ──────────────────────────────────────────────────────────────────
const memKind = z.enum(["fact", "person", "business", "preference"]);
dataRouter.get("/memories", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const strip = <T extends { embedding?: unknown }>(m: T) => ({ ...m, embedding: undefined });
  if (q) return res.json((await searchMemories(q, 20)).map(strip));
  res.json((await db.select().from(schema.memories).orderBy(desc(schema.memories.pinned), desc(schema.memories.updatedAt))).map(strip));
});
dataRouter.post("/memories", async (req, res) => {
  const b = z.object({ content: z.string().min(2), kind: memKind.default("fact") }).parse(req.body);
  const m = await addMemory(b.content, b.kind, "manual");
  await userLog("save_memory", `Saved memory: ${b.content}`, "memory");
  res.json({ ...m, embedding: undefined });
});
dataRouter.patch("/memories/:id", async (req, res) => {
  const b = z.object({ content: z.string().min(2).optional(), kind: memKind.optional(), pinned: z.boolean().optional() }).parse(req.body);
  const m = await updateMemory(id(req), b);
  res.json({ ...m, embedding: undefined });
});
dataRouter.delete("/memories/:id", async (req, res) => {
  const [m] = await db.delete(schema.memories).where(eq(schema.memories.id, id(req))).returning();
  if (m) await userLog("delete_memory", `Forgot: ${m.content}`, "memory");
  res.json({ ok: true });
});

// ─── Calendar + inbox (Google when connected, local/sample otherwise) ────────
dataRouter.get("/calendar", async (req, res) => {
  const from = toDate(req.query.from as string) ?? startOfDay();
  const to = toDate(req.query.to as string) ?? addDays(from, 7);
  try {
    res.json(await listEvents(from, to));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});
dataRouter.get("/inbox", async (req, res) => {
  try {
    res.json(await listMail(req.query.unread !== "false", String(req.query.q ?? ""), 20));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// ─── Conversation history (searchable) ───────────────────────────────────────
dataRouter.get("/conversations", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q) {
    const hits = await db
      .select({ m: schema.messages, c: schema.conversations })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
      .where(ilike(schema.messages.content, `%${q}%`))
      .orderBy(desc(schema.messages.createdAt))
      .limit(50);
    return res.json({ hits: hits.map((h) => ({ conversationId: h.c.id, title: h.c.title, channel: h.c.channel, messageId: h.m.id, role: h.m.role, content: h.m.content, createdAt: h.m.createdAt })) });
  }
  res.json({ conversations: await db.select().from(schema.conversations).orderBy(desc(schema.conversations.updatedAt)).limit(100) });
});
dataRouter.get("/conversations/:id", async (req, res) => {
  const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id(req)));
  if (!c) return res.status(404).json({ error: "not_found" });
  const msgs = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, c.id)).orderBy(asc(schema.messages.createdAt));
  res.json({ conversation: c, messages: msgs });
});
dataRouter.delete("/conversations/:id", async (req, res) => {
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id(req)));
  res.json({ ok: true });
});

// ─── Activity log ────────────────────────────────────────────────────────────
dataRouter.get("/activity", async (req, res) => {
  const conds: SQL[] = [];
  if (req.query.agent) conds.push(eq(schema.activityLog.agentId, String(req.query.agent)));
  if (req.query.q) conds.push(or(ilike(schema.activityLog.summary, `%${req.query.q}%`), ilike(schema.activityLog.action, `%${req.query.q}%`))!);
  if (req.query.since) conds.push(gte(schema.activityLog.createdAt, new Date(String(req.query.since))));
  if (req.query.before) conds.push(lt(schema.activityLog.createdAt, new Date(String(req.query.before))));
  res.json(await db.select().from(schema.activityLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.activityLog.createdAt)).limit(200));
});

// ─── Overview counts for the dashboard module badges ─────────────────────────
dataRouter.get("/overview", async (_req, res) => {
  const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const n = sqlCount();
  const [openTasks, urgentTasks, openLeads, dueFollowUps, scheduled, memories, notes, month, unread] = await Promise.all([
    count(db.select({ n }).from(schema.tasks).where(ne(schema.tasks.status, "done"))),
    count(db.select({ n }).from(schema.tasks).where(and(ne(schema.tasks.status, "done"), eq(schema.tasks.priority, "urgent")))),
    count(db.select({ n }).from(schema.leads).where(notInArray(schema.leads.stage, ["won", "lost"]))),
    count(db.select({ n }).from(schema.leads).where(and(notInArray(schema.leads.stage, ["won", "lost"]), lte(schema.leads.followUpAt, addDays(startOfDay(), 1))))),
    count(db.select({ n }).from(schema.contentItems).where(eq(schema.contentItems.status, "scheduled"))),
    count(db.select({ n }).from(schema.memories)),
    db.select({ agent: schema.notes.agentId, n }).from(schema.notes).groupBy(schema.notes.agentId),
    financeTotals(startOfMonth(), startOfNextMonth()),
    listMail(true, "", 50).then((m) => m.length).catch(() => 0),
  ]);
  const noteCount = Object.fromEntries(notes.map((r) => [r.agent, r.n]));
  res.json({
    chief: { label: "unread", value: unread },
    operations: { label: "open", value: openTasks, alert: urgentTasks },
    sales: { label: "leads", value: openLeads, alert: dueFollowUps },
    marketing: { label: "scheduled", value: scheduled },
    finance: { label: "net", value: Math.round(month.net), currency: env.CURRENCY },
    memory: { label: "memories", value: memories },
    researcher: { label: "notes", value: noteCount.researcher ?? 0 },
    strategist: { label: "notes", value: noteCount.strategist ?? 0 },
    engineering: { label: "notes", value: noteCount.engineering ?? 0 },
    design: { label: "notes", value: noteCount.design ?? 0 },
  });
});

function sqlCount() {
  return sql<number>`count(*)::int`;
}
