/**
 * Unit tests for the SO engine's pure logic. Run: `npx tsx --test scripts/test-engine.ts`
 * (no database or network needed).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, resolveEffect } from "../src/lib/so/permissions";
import { classifyIntentRules, needsHumanHandoff, routeAgent, type RoutableAgent } from "../src/lib/so/router";
import { isTransient, PermanentError, withRetry } from "../src/lib/so/retry";
import { scoreLead, suggestFollowUp } from "../src/lib/so/scoring";
import { effectiveStatus, isWithinHours } from "../src/lib/so/status";
import { runWorkflowTree, validateWorkflow, type WfNode } from "../src/lib/so/workflow-core";
import { buildAgentPrompt, INDUSTRY_TEMPLATES, ROLE_TEMPLATES } from "../src/lib/so/templates";

test("guardrails: payments and data export are never allowed, even if configured", () => {
  assert.equal(resolveEffect("manager", "payments.refund", { "payments.refund": "allow" }), "deny");
  assert.equal(resolveEffect("sales", "customers.export", { "customers.export": "allow" }), "deny");
  assert.equal(resolveEffect("receptionist", "messages.bulk_send", { "messages.bulk_send": "allow" }), "deny");
});
test("guardrails: cancellation always needs confirmation; defaults follow role", () => {
  assert.equal(resolveEffect("booking", "appointments.cancel", { "appointments.cancel": "allow" }), "confirm");
  assert.equal(resolveEffect("booking", "appointments.write"), "allow");
  assert.equal(resolveEffect("support", "appointments.write"), "deny");
  assert.equal(resolveEffect("support", "appointments.write", { "appointments.write": "allow" }), "allow");
  assert.equal(resolveEffect("custom", "messages.send"), "deny");
});
test("guardrails: decision matrix", () => {
  assert.equal(decide("deny", false, true), "deny");
  assert.equal(decide("allow", false, true), "simulate");
  assert.equal(decide("allow", true, false), "confirm");
  assert.equal(decide("confirm", false, false), "confirm");
  assert.equal(decide("allow", false, false), "run");
});

test("brain fallback: Arabic and English intents", () => {
  assert.equal(classifyIntentRules("أبي أحجز طاولة لأربعة").kind, "booking");
  assert.equal(classifyIntentRules("I want to speak to a manager").kind, "human_request");
  assert.equal(classifyIntentRules("بكم سعر الباقة؟").kind, "pricing");
  assert.equal(classifyIntentRules("عندي شكوى على الطلب").kind, "complaint");
  assert.equal(classifyIntentRules("What medication dose should I take?").kind, "medical");
  assert.equal(classifyIntentRules("أبي أحجز").language, "ar");
});
test("router: role preference, branch preference, managers never face customers", () => {
  const agents: RoutableAgent[] = [
    { id: "r", role: "receptionist", status: "active", branch_id: null },
    { id: "b1", role: "booking", status: "active", branch_id: "salmiya" },
    { id: "b2", role: "booking", status: "active", branch_id: "hawally" },
    { id: "s", role: "sales", status: "paused", branch_id: null },
    { id: "m", role: "manager", status: "active", branch_id: null },
  ];
  const booking = classifyIntentRules("book a table");
  assert.equal(routeAgent(booking, agents, { branchId: "hawally", channelAudience: "customer" })?.id, "b2");
  assert.equal(routeAgent(classifyIntentRules("how much is it"), agents, { channelAudience: "customer" })?.id, "r"); // sales paused
  assert.equal(routeAgent(classifyIntentRules("monthly sales report"), agents, { channelAudience: "customer" })?.id, "r");
  assert.equal(routeAgent(classifyIntentRules("monthly sales report"), agents, { channelAudience: "internal" })?.id, "m");
  assert.equal(routeAgent(booking, [], { channelAudience: "customer" }), null);
});
test("handoff rules", () => {
  assert.equal(needsHumanHandoff(classifyIntentRules("أبي أكلم المدير"), { failedToolCalls: 0, safetyProfile: "standard" }), "customer_requested");
  assert.equal(needsHumanHandoff(classifyIntentRules("what dose of ibuprofen"), { failedToolCalls: 0, safetyProfile: "medical" }), "medical_question");
  assert.equal(needsHumanHandoff(classifyIntentRules("hello"), { failedToolCalls: 2, safetyProfile: "standard" }), "repeated_failure");
  assert.equal(needsHumanHandoff(classifyIntentRules("hello"), { failedToolCalls: 0, safetyProfile: "standard" }), null);
});

test("retry: transient errors retried with backoff, permanent ones not", async () => {
  let n = 0;
  const r = await withRetry(async () => { if (++n < 3) throw Object.assign(new Error("boom"), { status: 503 }); return "ok"; }, { sleep: async () => {} });
  assert.deepEqual(r, { value: "ok", attempts: 3 });
  let m = 0;
  await assert.rejects(withRetry(async () => { m++; throw new PermanentError("invalid date"); }, { sleep: async () => {} }));
  assert.equal(m, 1);
  assert.equal(isTransient(new Error("fetch failed")), true);
  assert.equal(isTransient(new Error("violates check constraint")), false);
});

test("lead scoring is bounded and explained", () => {
  const hot = scoreLead({ stage: "qualified", conversations: 4, appointments: 2, completedAppointments: 1, lastContactDaysAgo: 1, askedPricing: true, hasEstimatedValue: true, negativeSentiment: false, source: "whatsapp" });
  assert.ok(hot.score >= 80 && hot.score <= 99, String(hot.score));
  assert.ok(hot.reasons.length > 3);
  const coldSignals = { stage: "new", conversations: 0, appointments: 0, completedAppointments: 0, lastContactDaysAgo: 45, askedPricing: false, hasEstimatedValue: false, negativeSentiment: true, source: "manual" } as const;
  const cold = scoreLead(coldSignals);
  assert.equal(cold.score, 0);
  assert.equal(scoreLead({ ...coldSignals, stage: "converted" }).score, 100);
  assert.equal(suggestFollowUp({ ...coldSignals, negativeSentiment: true })?.action, "call_back_personally");
  assert.equal(suggestFollowUp({ ...coldSignals, stage: "lost" }), null);
});

test("live status: stale transient status decays; inactive is offline", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const base = { status: "active", hasChannel: true, withinHours: true, pendingAttention: 0 } as const;
  assert.equal(effectiveStatus({ ...base, live_status: "speaking", live_updated_at: "2026-10-30T11:59:30Z" }, now), "speaking");
  assert.equal(effectiveStatus({ ...base, live_status: "speaking", live_updated_at: "2026-10-30T11:50:00Z" }, now), "online");
  assert.equal(effectiveStatus({ ...base, hasChannel: false, live_status: null, live_updated_at: null }, now), "offline");
  assert.equal(effectiveStatus({ ...base, status: "paused", live_status: "speaking", live_updated_at: "2026-10-30T11:59:59Z" }, now), "offline");
  assert.equal(effectiveStatus({ ...base, pendingAttention: 1, live_status: "online", live_updated_at: null }, now), "needs_attention");
});
test("working hours in Kuwait time, including overnight ranges", () => {
  const h = { fri: [["13:00", "23:59"]], sat: [["20:00", "02:00"]] } as Record<string, [string, string][]>;
  assert.equal(isWithinHours(h, "Asia/Kuwait", new Date("2026-10-30T12:00:00Z")), true);  // Fri 15:00 KWT
  assert.equal(isWithinHours(h, "Asia/Kuwait", new Date("2026-10-30T08:00:00Z")), false); // Fri 11:00 KWT
  assert.equal(isWithinHours(h, "Asia/Kuwait", new Date("2026-10-31T22:30:00Z")), true);  // Sun 01:30 → covered by Sat overnight? no: day is Sun
  assert.equal(isWithinHours({}, "Asia/Kuwait"), true);
});

const N = (n: Partial<WfNode> & Pick<WfNode, "key" | "kind" | "type">): WfNode => ({ config: {}, parent_key: null, branch: null, position: 0, ...n });
test("workflow: branches, context passing, failure stops the run", async () => {
  const nodes = [
    N({ key: "id", kind: "action", type: "identify_customer", position: 0 }),
    N({ key: "c1", kind: "condition", type: "intent_is", config: { value: "booking" }, position: 1 }),
    N({ key: "book", kind: "action", type: "book_appointment", parent_key: "c1", branch: "yes", position: 0 }),
    N({ key: "wa", kind: "action", type: "send_whatsapp", parent_key: "c1", branch: "yes", position: 1 }),
    N({ key: "note", kind: "action", type: "notify_owner", parent_key: "c1", branch: "no", position: 0 }),
  ];
  assert.deepEqual(validateWorkflow(nodes), []);
  const seen: string[] = [];
  const r = await runWorkflowTree(nodes, { intent: "booking" }, async (n, ctx) => {
    seen.push(n.key);
    if (n.type === "identify_customer") return { outcome: "ok", ctx: { customer_id: "c-1" } };
    if (n.type === "book_appointment") assert.equal(ctx.customer_id, "c-1");
    return { outcome: "ok" };
  });
  assert.equal(r.status, "succeeded");
  assert.deepEqual(seen, ["id", "book", "wa"]);
  const r2 = await runWorkflowTree(nodes, { intent: "booking" }, async (n) => ({ outcome: n.type === "book_appointment" ? "failed" : "ok" }));
  assert.equal(r2.status, "failed");
  assert.equal(r2.log.find((s) => s.key === "wa")?.outcome, "skipped");
  const r3 = await runWorkflowTree(nodes, { intent: "faq" }, async () => ({ outcome: "ok" }));
  assert.deepEqual(r3.log.map((s) => `${s.key}:${s.outcome}`), ["id:ok", "c1:no", "note:ok"]);
});
test("workflow validation catches bad graphs", () => {
  assert.ok(validateWorkflow([N({ key: "a", kind: "condition", type: "intent_is" })]).includes("no_actions"));
  assert.ok(validateWorkflow([N({ key: "a", kind: "action", type: "rm_rf" })]).includes("unknown_action:rm_rf"));
  assert.ok(validateWorkflow([N({ key: "a", kind: "action", type: "notify_owner", parent_key: "zzz", branch: "yes" })]).includes("missing_parent:a"));
});

test("templates: 5 roles, 10 industries, medical safety rules", () => {
  assert.deepEqual(Object.keys(ROLE_TEMPLATES).sort(), ["booking", "manager", "receptionist", "sales", "support"]);
  assert.equal(Object.keys(INDUSTRY_TEMPLATES).length, 10);
  const clinic = INDUSTRY_TEMPLATES.clinic;
  assert.equal(clinic.safetyProfile, "medical");
  const p = buildAgentPrompt({ name: "Mira", role: "receptionist", dialect: "kuwaiti", safetyProfile: "medical", businessName: "Al Noor Clinic", industry: "clinic", instructions: "", knowledge: [], memory: [] });
  assert.match(p, /never diagnose/i);
  assert.match(p, /never prescribe/i);
});

import { freeSlots } from "../src/lib/so/availability";
test("availability: Kuwait time, busy slots and capacity respected", () => {
  const hours = { fri: [["13:00", "15:00"]] } as Record<string, [string, string][]>;
  const busy = [{ starts_at: "2026-10-30T10:00:00Z", ends_at: "2026-10-30T10:30:00Z" }]; // 13:00 KWT
  const s = freeSlots({ date: "2026-10-30", hours, busy });
  assert.deepEqual(s.map((x) => x.local), ["13:30", "14:00", "14:30"]);
  assert.equal(s[0].starts_at, "2026-10-30T10:30:00.000Z");
  assert.equal(freeSlots({ date: "2026-10-30", hours, busy, capacity: 2 })[0].local, "13:00");
  assert.equal(freeSlots({ date: "2026-10-31", hours, busy }).length, 0); // closed Saturday
  assert.equal(freeSlots({ date: "2026-10-30", hours, busy, notBefore: new Date("2026-10-30T11:10:00Z") })[0].local, "14:30");
});
