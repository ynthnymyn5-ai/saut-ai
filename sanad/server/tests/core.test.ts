/**
 * Core behaviour tests (run against the dev database: `npm test`).
 * Covers date parsing, the confirmation gate, and the offline command router.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, pool, schema } from "../db";
import { parseNaturalDate, zonedParts } from "../lib/time";
import { invokeTool, resolvePending, allTools, toSpec } from "../tools/registry";
import { runTurn, detectLang } from "../agents/orchestrator";

after(() => pool.end());

test("natural dates resolve in the owner's timezone", () => {
  const now = new Date("2026-03-10T05:00:00Z"); // 08:00 in Kuwait (UTC+3)
  const d = parseNaturalDate("tomorrow at 10", now)!;
  const p = zonedParts(d);
  assert.equal(p.day, 11);
  assert.equal(p.hour, 10);
  const ar = parseNaturalDate("بكرة الساعة ٣ مساء", now)!;
  assert.equal(zonedParts(ar).hour, 15);
  assert.equal(parseNaturalDate("no date here", now), null);
});

test("language detection", () => {
  assert.equal(detectLang("What are my meetings today?"), "en");
  assert.equal(detectLang("ما هي اجتماعاتي اليوم؟"), "ar");
});

test("every tool produces a valid JSON-schema spec", () => {
  for (const t of allTools) {
    const s = toSpec(t);
    assert.equal((s.parameters as { type: string }).type, "object", t.name);
  }
});

test("irreversible actions are queued, not executed, until approved", async () => {
  const [task] = await db.insert(schema.tasks).values({ title: "TEST delete me" }).returning();
  const ctx = { agentId: "operations" as const, lang: "en" as const, channel: "web" as const };

  const r = await invokeTool("delete_task", { id: task.id, title: task.title }, ctx);
  assert.ok(r.pending, "delete_task must create a pending action");
  assert.equal(r.output.status, "awaiting_confirmation");
  const still = await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id));
  assert.equal(still.length, 1, "task must still exist before approval");

  const cancelled = await resolvePending(r.pending!.id, false);
  assert.equal(cancelled.action.status, "cancelled");
  assert.equal((await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id))).length, 1);

  const r2 = await invokeTool("delete_task", { id: task.id }, ctx);
  const done = await resolvePending(r2.pending!.id, true);
  assert.equal(done.action.status, "executed");
  assert.equal((await db.select().from(schema.tasks).where(eq(schema.tasks.id, task.id))).length, 0);

  // A second approval of the same action is a no-op
  const again = await resolvePending(r2.pending!.id, true);
  assert.match(again.say, /already/);
});

test("sending email always requires confirmation", async () => {
  const r = await invokeTool("gmail_send", { to: "test@example.com", subject: "Hi", body: "Test" }, { agentId: "chief", lang: "en", channel: "web" });
  assert.ok(r.pending);
  await resolvePending(r.pending!.id, false);
});

test("invalid tool arguments are rejected", async () => {
  const r = await invokeTool("add_task", { title: "" }, { agentId: "operations", lang: "en", channel: "web" });
  assert.equal(r.output.error, true);
});

test("a chat turn creates a task (offline router or real model)", async () => {
  const res = await runTurn({ text: "Add a task to TESTCALL Ahmed tomorrow at 10" });
  assert.ok(res.reply.length > 0);
  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.title, "TESTCALL Ahmed"));
  if (res.provider.startsWith("local")) assert.equal(rows.length, 1);
  await db.delete(schema.tasks).where(eq(schema.tasks.title, "TESTCALL Ahmed"));
  await db.delete(schema.conversations).where(eq(schema.conversations.id, res.conversationId));
});

test("sending an invoice is queued for approval and the public link is signed", async () => {
  const { invoiceToken, renderInvoiceHtml } = await import("../tools/business");
  const [inv] = await db.insert(schema.invoices).values({ number: "INV-TEST-1", client: "Test Client", amount: "100" }).returning();
  assert.notEqual(invoiceToken(inv.id), invoiceToken(inv.id + 1));
  assert.match(renderInvoiceHtml(inv), /INV-TEST-1/);
  const r = await invokeTool("send_invoice", { invoiceId: inv.id, to: "client@example.com" }, { agentId: "finance", lang: "en", channel: "web" });
  assert.ok(r.pending, "send_invoice must wait for approval");
  await resolvePending(r.pending!.id, false);
  const [after] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, inv.id));
  assert.equal(after.status, "draft", "cancelled send leaves the invoice untouched");
  await db.delete(schema.invoices).where(eq(schema.invoices.id, inv.id));
});

test("automatic follow-ups only draft — every email waits for approval", async () => {
  const { runAutoFollowUps } = await import("../tools/business");
  const [lead] = await db.insert(schema.leads).values({ name: "FOLLOWTEST Lead", email: "lead@example.com", stage: "contacted", followUpAt: new Date(Date.now() - 3600_000) }).returning();
  const q = await runAutoFollowUps(10);
  const mine = q.find((x) => x.lead === "FOLLOWTEST Lead");
  assert.ok(mine?.pending, "a pending gmail_send was queued");
  assert.equal(mine!.pending!.tool, "gmail_send");
  const again = await runAutoFollowUps(10);
  assert.ok(!again.some((x) => x.lead === "FOLLOWTEST Lead"), "no duplicate draft for the same follow-up date");
  for (const x of q) if (x.pendingId) await resolvePending(x.pendingId, false);
  await db.delete(schema.leads).where(eq(schema.leads.id, lead.id));
});

test("weekly report compares this week with the last", async () => {
  const { buildWeeklyData } = await import("../tools/business");
  const w = await buildWeeklyData();
  assert.ok(w.from < w.to);
  assert.equal(typeof w.prevIncome, "number");
});
