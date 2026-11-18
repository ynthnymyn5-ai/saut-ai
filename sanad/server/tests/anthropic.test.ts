/**
 * Claude provider against a local mock of the Messages API: checks the request
 * shape (model, effort, fallbacks, cached tools, grouped tool results, raw
 * blocks replayed) and that a full Sanad turn runs a tool through Claude.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const requests: any[] = [];
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = JSON.parse(body);
    requests.push({ url: req.url, headers: req.headers, body: json });
    const hasToolResult = json.messages.some((m: any) => Array.isArray(m.content) && m.content.some((b: any) => b.type === "tool_result"));
    const content = hasToolResult
      ? [{ type: "text", text: "Added — I'll remind you tomorrow at 10." }]
      : [
          { type: "thinking", thinking: "", signature: "sig-abc" },
          { type: "tool_use", id: "toolu_1", name: "add_task", input: { title: "CLAUDETEST call Ahmed", priority: "high" } },
        ];
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason: hasToolResult ? "end_turn" : "tool_use", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
  });
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
process.env.LLM_PROVIDER = "anthropic";

const { runTurn } = await import("../agents/orchestrator");
const { db, pool, schema } = await import("../db");
const { eq } = await import("drizzle-orm");

after(async () => {
  await pool.end();
  server.close();
});

test("a Sanad turn runs a tool through Claude and replays raw blocks", async () => {
  const res = await runTurn({ text: "Add a task to call Ahmed tomorrow at 10", agentId: "operations" });
  assert.equal(res.provider, "anthropic:claude-opus-5-5");
  assert.match(res.reply, /remind you/);
  assert.deepEqual(res.actions.map((a) => a.tool), ["add_task"]);

  const [first, second] = requests;
  assert.equal(first.body.model, "claude-opus-5-5");
  assert.equal(first.body.fallbacks, "default");
  assert.match(String(first.headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
  assert.equal(first.body.output_config.effort, "medium");
  assert.equal(first.body.temperature, undefined, "sampling params are rejected by current models");
  assert.ok(first.body.system.includes("Sanad"));
  assert.deepEqual(first.body.tools.at(-1).cache_control, { type: "ephemeral" });
  assert.equal(first.body.tools.filter((t: any) => t.cache_control).length, 1);

  // Second request: assistant turn replayed unchanged (thinking + tool_use), then one tool_result
  const msgs = second.body.messages;
  const assistant = msgs.at(-2);
  assert.equal(assistant.role, "assistant");
  assert.deepEqual(assistant.content.map((b: any) => b.type), ["thinking", "tool_use"]);
  assert.equal(assistant.content[0].signature, "sig-abc");
  const results = msgs.at(-1);
  assert.equal(results.role, "user");
  assert.equal(results.content[0].type, "tool_result");
  assert.equal(results.content[0].tool_use_id, "toolu_1");

  const rows = await db.select().from(schema.tasks).where(eq(schema.tasks.title, "CLAUDETEST call Ahmed"));
  assert.equal(rows.length, 1);
  await db.delete(schema.tasks).where(eq(schema.tasks.title, "CLAUDETEST call Ahmed"));
  await db.delete(schema.conversations).where(eq(schema.conversations.id, res.conversationId));
});
