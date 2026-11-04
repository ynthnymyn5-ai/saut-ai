import "server-only";
import type OpenAI from "openai";
import { ProviderNotConfiguredError, providerStatus } from "@/lib/env";
import { salesSummary, type SaleOrder } from "@/lib/sales-analytics";
import type { DB } from "@/lib/so/context";
import { RANGE_KEYS, RangeError_, change, customerRanking, lastYearOf, loyalty, previousOf, productTable, resolveRange, totals, weekdays, type AOrder, type Range, type RangeKey } from "./core";

export interface AnalystCtx { db: DB | null; orgId: string; orgName: string; userName: string | null; branchIds: string[] | null; locale: "ar" | "en" }
export interface AnalystReply { answer: string; followups: string[]; tools: string[]; periods: { from: string; to: string }[] }

const MAX_ORDERS = 10000;
type Loaded = { orders: AOrder[]; sale: SaleOrder[]; truncated: boolean };

async function loadOrders(ctx: AnalystCtx, r: Range): Promise<Loaded> {
  let q = ctx.db!.from("orders")
    .select("created_at, status, total, delivery_fee, fulfillment, customer_id, customers(full_name), delivery_zones(name), order_items(name, quantity, line_total)")
    .eq("organization_id", ctx.orgId).gte("created_at", r.from.toISOString()).lt("created_at", r.to.toISOString())
    .order("created_at", { ascending: false }).limit(MAX_ORDERS);
  if (ctx.branchIds) q = q.in("branch_id", ctx.branchIds);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const items = (o: Record<string, unknown>) => ((o.order_items as { name: string; quantity: number; line_total: number }[]) ?? []).map((i) => ({ name: i.name, quantity: Number(i.quantity), line_total: Number(i.line_total) }));
  return {
    truncated: rows.length >= MAX_ORDERS,
    orders: rows.map((o) => ({ created_at: o.created_at as string, status: o.status as string, total: Number(o.total), fulfillment: o.fulfillment as string, customer_id: (o.customer_id as string) ?? null, customer_name: (o.customers as { full_name?: string } | null)?.full_name ?? null, items: items(o) })),
    sale: rows.map((o) => ({ created_at: o.created_at as string, status: o.status as string, total: Number(o.total), delivery_fee: Number(o.delivery_fee ?? 0), fulfillment: o.fulfillment as string, zone: (o.delivery_zones as { name?: string } | null)?.name ?? null, items: items(o) })),
  };
}

function ranges(args: Record<string, unknown>): { cur: Range; cmp: Range; cmpKind: string } {
  const key = (RANGE_KEYS as readonly string[]).includes(String(args.range)) ? (args.range as RangeKey) : "last_30_days";
  const cur = resolveRange(key, new Date(), typeof args.from === "string" ? args.from : undefined, typeof args.to === "string" ? args.to : undefined);
  const cmpKind = args.compare === "last_year" ? "same_period_last_year" : "previous_period";
  return { cur, cmp: cmpKind === "same_period_last_year" ? lastYearOf(cur) : previousOf(cur), cmpKind };
}

const RANGE_PROPS = {
  range: { type: "string", enum: [...RANGE_KEYS], description: "Period. Use custom with from/to for specific dates." },
  from: { type: ["string", "null"], description: "YYYY-MM-DD, only for custom" },
  to: { type: ["string", "null"], description: "YYYY-MM-DD inclusive, only for custom" },
  compare: { type: "string", enum: ["previous_period", "last_year"], description: "What to compare with. Default previous_period." },
} as const;
const fn = (name: string, description: string, extra: Record<string, unknown> = {}, required: string[] = []): OpenAI.Chat.ChatCompletionTool => ({
  type: "function",
  function: { name, description, parameters: { type: "object", additionalProperties: false, required: ["range", "from", "to", "compare", ...required], properties: { ...RANGE_PROPS, ...extra } } },
});

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  fn("sales_overview", "Sales from real orders: number of orders, revenue, average order, cancellations, compared with another period; revenue by day, by weekday, by hour, by delivery area; delivery share; best sellers."),
  fn("product_performance", "Every product sold: quantity, revenue, share of revenue, and change versus the comparison period. Optional name filter.", { product: { type: ["string", "null"], description: "Part of a product name, or null for all" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, ["product", "limit"]),
  fn("top_customers", "Customers ranked by spend or by number of orders, with average order and last order date.", { by: { type: "string", enum: ["revenue", "orders"] }, limit: { type: "integer", minimum: 1, maximum: 25 } }, ["by", "limit"]),
  fn("customer_loyalty", "New versus returning buyers, repeat buying and orders per buyer, compared with another period."),
  fn("operations_metrics", "Non-sales activity: calls (answered/missed), conversations by channel, escalations, appointments, leads and conversion, new customers, per-AI-employee performance, compared with another period."),
];

async function runTool(ctx: AnalystCtx, name: string, args: Record<string, unknown>, periods: AnalystReply["periods"]): Promise<unknown> {
  if (!ctx.db) return { ok: false, note: "DEMO MODE: no real business data is connected. Say so; do not invent numbers." };
  let rg: ReturnType<typeof ranges>;
  try { rg = ranges(args); } catch (e) { return { ok: false, note: e instanceof RangeError_ ? e.message : "bad range" }; }
  const { cur, cmp, cmpKind } = rg;
  periods.push(cur.label);
  const head = { ok: true, measured: true, period: cur.label, compared_with: { kind: cmpKind, ...cmp.label }, currency: "KWD" };

  if (name === "operations_metrics") {
    if (ctx.branchIds) return { ok: false, note: "Only available to users with access to the whole business." };
    const { computeMetrics } = await import("@/lib/so/bi");
    const [a, b] = await Promise.all([computeMetrics(ctx.db, ctx.orgId, cur.from, cur.to, null), computeMetrics(ctx.db, ctx.orgId, cmp.from, cmp.to, null)]);
    return { ...head, current: { ...a, agents: a.agents.slice(0, 10), revenue: undefined }, previous: { ...b, agents: undefined, revenue: undefined }, note: "Revenue is in sales_overview (from orders)." };
  }

  const [A, B] = await Promise.all([loadOrders(ctx, cur), loadOrders(ctx, cmp)]);
  const warn = A.truncated || B.truncated ? `Only the latest ${MAX_ORDERS} orders per period were analysed.` : undefined;
  if (!A.orders.length && !B.orders.length) return { ...head, no_orders: true, note: "There are no orders in either period. Say so plainly." };

  if (name === "sales_overview") {
    const s = salesSummary(A.sale), t1 = totals(A.orders), t0 = totals(B.orders);
    return {
      ...head, warning: warn,
      orders: change(t1.orders, t0.orders), revenue: change(t1.revenue, t0.revenue), average_order: change(t1.average_order, t0.average_order), canceled: change(t1.canceled, t0.canceled),
      delivery_share_pct: s.deliveryShare, peak_hour_kuwait: s.peakHour,
      best_sellers: s.topItems.slice(0, 5), by_weekday: weekdays(A.orders),
      by_day: s.byDay.length <= 62 ? s.byDay : undefined, by_day_note: s.byDay.length > 62 ? "Too many days to list; ask for a shorter range for a daily breakdown." : undefined,
      by_area: s.zones.slice(0, 10),
    };
  }
  if (name === "product_performance") {
    const all = productTable(A.orders, B.orders, typeof args.product === "string" ? args.product : undefined);
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 15));
    return { ...head, warning: warn, products_found: all.length, products: all.slice(0, limit), not_sold_this_period: all.filter((p) => p.quantity === 0).map((p) => p.name).slice(0, 20) };
  }
  if (name === "top_customers") {
    const by = args.by === "orders" ? "orders" : "revenue";
    return { ...head, warning: warn, ranked_by: by, ...customerRanking(A.orders, by, Number(args.limit) || 10) };
  }
  if (name === "customer_loyalty") {
    const earlier = async (orders: AOrder[], before: Date) => {
      const ids = [...new Set(orders.map((o) => o.customer_id).filter(Boolean) as string[])];
      const seen = new Set<string>();
      for (let i = 0; i < ids.length; i += 300) {
        const { data } = await ctx.db!.from("orders").select("customer_id").eq("organization_id", ctx.orgId).in("customer_id", ids.slice(i, i + 300)).neq("status", "canceled").lt("created_at", before.toISOString()).limit(5000);
        for (const r of data ?? []) seen.add(r.customer_id as string);
      }
      return seen;
    };
    const [e1, e0] = await Promise.all([earlier(A.orders, cur.from), earlier(B.orders, cmp.from)]);
    return { ...head, warning: warn, current: loyalty(A.orders, e1), previous: loyalty(B.orders, e0) };
  }
  return { ok: false, note: "Unknown tool" };
}

function systemPrompt(ctx: AnalystCtx) {
  const now = new Date(Date.now() + 3 * 3600_000);
  return [
    `You are the AI Analyst of SAUT AI for "${ctx.orgName}", talking to ${ctx.userName ?? "the owner"}. Today is ${now.toISOString().slice(0, 10)} (${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getUTCDay()]}), Asia/Kuwait.`,
    ctx.locale === "ar" ? "Answer in clear Gulf/Kuwaiti business Arabic unless the user writes in English. Use Western digits (0-9)." : "Answer in English unless the user writes in Arabic.",
    "ACCURACY RULES (most important):",
    "- Every number must come from a tool result in this conversation. Copy numbers exactly; never estimate, round differently, extrapolate or add up numbers yourself unless the tool gave both parts and you state the formula.",
    "- Always say which period the numbers cover (dates) and what they are compared with.",
    "- Money is Kuwaiti dinar with 3 decimals, e.g. 12.500 د.ك.",
    "- If a tool returns no data, an error, or the question needs data SAUT AI does not have (costs, expenses, profit, stock, staff wages, marketing spend), say exactly what is missing. Never guess. Sales are revenue, not profit.",
    "- Causes are hypotheses: label them (\"احتمال\" / \"possibly\") and cite the number behind each.",
    "- If the question is ambiguous about the period, use last_30_days and say so.",
    "STYLE: start with the direct answer in one sentence, then up to 6 short bullet points with the key numbers and changes, then at most 2 practical recommendations tied to the data. Use **bold** for key numbers. No tables, no headings.",
    "You only read data; you cannot change orders, prices or settings.",
    'Return JSON {"answer": string, "followups": string[]} — followups are up to 3 short next questions the owner might ask, in the same language.',
  ].join("\n");
}

/** One analyst turn: model ↔ read-only measured tools (max 4 rounds). */
export async function analystTurn(ctx: AnalystCtx, text: string, history: { role: "user" | "assistant"; content: string }[]): Promise<AnalystReply> {
  if (!providerStatus("openai").configured) throw new ProviderNotConfiguredError("OPENAI_API_KEY");
  const { openai, models } = await import("@/lib/ai/openai");
  const model = process.env.OPENAI_ANALYST_MODEL || models.chat();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt(ctx) }, ...history.slice(-8), { role: "user", content: text }];
  const used: string[] = [];
  const periods: AnalystReply["periods"] = [];

  for (let round = 0; round < 5; round++) {
    const r = await openai().chat.completions.create({
      model, messages, temperature: 0.1, max_tokens: 900,
      tools: round < 4 ? TOOLS : undefined,
      response_format: { type: "json_schema", json_schema: { name: "analyst_reply", strict: true, schema: { type: "object", additionalProperties: false, required: ["answer", "followups"], properties: { answer: { type: "string" }, followups: { type: "array", items: { type: "string" } } } } } },
    });
    const msg = r.choices[0].message;
    if (!msg.tool_calls?.length) {
      let out: { answer?: string; followups?: string[] } = {};
      try { out = JSON.parse(msg.content ?? "{}"); } catch { out = { answer: msg.content ?? "" }; }
      return { answer: (out.answer ?? "").trim(), followups: (out.followups ?? []).filter((x) => typeof x === "string").slice(0, 3), tools: used, periods };
    }
    messages.push(msg);
    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* empty */ }
      used.push(call.function.name);
      const result = await runTool(ctx, call.function.name, args, periods).catch(() => ({ ok: false, note: "The data could not be loaded right now. Tell the user to try again." }));
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 14000) });
    }
  }
  return { answer: ctx.locale === "ar" ? "ما قدرت أكمل التحليل. جرّب تسأل بشكل أبسط أو بفترة أقصر." : "I couldn't finish the analysis. Try a simpler question or a shorter period.", followups: [], tools: used, periods };
}
