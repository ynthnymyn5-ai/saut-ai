/** Finance agent tools: income/expense log, invoices, monthly summaries. */
import { z } from "zod";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { defineTool, L } from "./types";
import { toDate, startOfMonth, startOfNextMonth, zonedDate, zonedParts } from "../lib/time";
import { env } from "../env";

/** Income/expense totals and per-category breakdown between two instants. */
export async function financeTotals(from: Date, to: Date) {
  const rows = await db
    .select({
      type: schema.transactions.type,
      category: schema.transactions.category,
      total: sql<string>`sum(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(and(gte(schema.transactions.occurredAt, from), lt(schema.transactions.occurredAt, to)))
    .groupBy(schema.transactions.type, schema.transactions.category);
  let income = 0;
  let expenses = 0;
  const byCategory: Record<string, number> = {};
  for (const r of rows) {
    const v = Number(r.total);
    if (r.type === "income") income += v;
    else {
      expenses += v;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + v;
    }
  }
  return { income, expenses, net: income - expenses, byCategory };
}

/** Last `months` months of income vs expenses for charts. */
export async function monthlySeries(months = 6) {
  const p = zonedParts();
  const out: { month: string; income: number; expenses: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    let m = p.month - i;
    let y = p.year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const from = zonedDate(y, m, 1);
    const to = m === 12 ? zonedDate(y + 1, 1, 1) : zonedDate(y, m + 1, 1);
    const t = await financeTotals(from, to);
    out.push({ month: `${y}-${String(m).padStart(2, "0")}`, income: t.income, expenses: t.expenses });
  }
  return out;
}

const money = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${env.CURRENCY}`;

export const logTransaction = defineTool({
  name: "log_transaction",
  description: "Record income or an expense in the finance log.",
  agents: ["finance", "chief"],
  mutates: true,
  schema: z.object({
    type: z.enum(["income", "expense"]),
    amount: z.number().positive(),
    category: z.string().nullish().describe("e.g. sales, software, marketing, rent, salaries, travel, food"),
    description: z.string().nullish(),
    occurredAt: z.string().nullish().describe("ISO date; defaults to now"),
    currency: z.string().nullish(),
  }),
  summarize: (a, lang) => L(lang, `Log ${a.type} of ${money(a.amount)}`, `تسجيل ${a.type === "income" ? "دخل" : "مصروف"} بقيمة ${money(a.amount)}`),
  async run(a, ctx) {
    const [t] = await db
      .insert(schema.transactions)
      .values({
        type: a.type,
        amount: String(a.amount),
        category: (a.category ?? "general").toLowerCase(),
        description: a.description ?? null,
        occurredAt: toDate(a.occurredAt) ?? new Date(),
        currency: a.currency ?? env.CURRENCY,
      })
      .returning();
    return { transaction: t, say: L(ctx.lang, `Logged ${a.type} of ${money(a.amount)} (${t.category}).`, `تم تسجيل ${money(a.amount)} (${t.category}).`) };
  },
});

export const financeSummary = defineTool({
  name: "finance_summary",
  description: "Income, expenses, net and spending by category for a period. Use for 'how much did I spend this month?'.",
  agents: ["finance", "chief"],
  schema: z.object({
    period: z.enum(["this_month", "last_month", "custom"]).nullish(),
    from: z.string().nullish(),
    to: z.string().nullish(),
  }),
  summarize: (_a, lang) => L(lang, "Finance summary", "ملخص مالي"),
  async run(a, ctx) {
    let from = startOfMonth();
    let to = startOfNextMonth();
    if (a.period === "last_month") {
      to = from;
      from = startOfMonth(new Date(from.getTime() - 86400000));
    } else if (a.period === "custom" && a.from) {
      from = toDate(a.from) ?? from;
      to = toDate(a.to) ?? new Date();
    }
    const t = await financeTotals(from, to);
    const top = Object.entries(t.byCategory).sort((x, y) => y[1] - x[1]).slice(0, 4);
    const cats = top.map(([c, v]) => `${c} ${money(v)}`).join(", ");
    return {
      ...t,
      from,
      to,
      say: L(
        ctx.lang,
        `${a.period === "last_month" ? "Last month" : "This month"} you spent ${money(t.expenses)} and earned ${money(t.income)} — net ${money(t.net)}.${cats ? ` Top spending: ${cats}.` : ""}`,
        `${a.period === "last_month" ? "الشهر الماضي" : "هذا الشهر"} صرفت ${money(t.expenses)} وحققت دخلاً ${money(t.income)} — الصافي ${money(t.net)}.${cats ? ` أكبر المصاريف: ${cats}.` : ""}`,
      ),
    };
  },
});

export const listTransactions = defineTool({
  name: "list_transactions",
  description: "List recent transactions, optionally filtered by type or category.",
  agents: ["finance"],
  schema: z.object({ type: z.enum(["income", "expense"]).nullish(), category: z.string().nullish(), limit: z.number().int().max(100).nullish() }),
  summarize: (_a, lang) => L(lang, "List transactions", "عرض المعاملات"),
  async run(a, ctx) {
    const conds = [];
    if (a.type) conds.push(eq(schema.transactions.type, a.type));
    if (a.category) conds.push(eq(schema.transactions.category, a.category.toLowerCase()));
    const rows = await db.select().from(schema.transactions).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.transactions.occurredAt)).limit(a.limit ?? 15);
    return {
      transactions: rows,
      say: rows.map((r) => `• ${r.occurredAt.toISOString().slice(0, 10)} ${r.type === "income" ? "+" : "−"}${money(Number(r.amount))} ${r.category}${r.description ? ` — ${r.description}` : ""}`).join("\n") || L(ctx.lang, "No transactions.", "لا توجد معاملات."),
    };
  },
});

export const deleteTransaction = defineTool({
  name: "delete_transaction",
  description: "Delete a transaction from the log. Requires owner confirmation.",
  agents: ["finance"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.number().int() }),
  summarize: (a, lang) => L(lang, `Delete transaction #${a.id}`, `حذف المعاملة رقم ${a.id}`),
  async run(a, ctx) {
    const [t] = await db.delete(schema.transactions).where(eq(schema.transactions.id, a.id)).returning();
    return { say: t ? L(ctx.lang, "Transaction deleted.", "تم حذف المعاملة.") : L(ctx.lang, "Not found.", "غير موجودة.") };
  },
});

export const createInvoice = defineTool({
  name: "create_invoice",
  description: "Create a draft invoice (does not send it).",
  agents: ["finance"],
  mutates: true,
  schema: z.object({ client: z.string(), amount: z.number().positive(), dueAt: z.string().nullish(), currency: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Create invoice for ${a.client} — ${money(a.amount)}`, `إنشاء فاتورة لـ ${a.client}`),
  async run(a, ctx) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.invoices);
    const number = `INV-${new Date().getFullYear()}-${String(n + 1).padStart(4, "0")}`;
    const [inv] = await db
      .insert(schema.invoices)
      .values({ number, client: a.client, amount: String(a.amount), currency: a.currency ?? env.CURRENCY, dueAt: toDate(a.dueAt), status: "draft" })
      .returning();
    return { invoice: inv, say: L(ctx.lang, `Draft invoice ${number} for ${a.client} (${money(a.amount)}) created.`, `تم إنشاء مسودة الفاتورة ${number} لـ ${a.client}.`) };
  },
});

export const listInvoices = defineTool({
  name: "list_invoices",
  description: "List invoices, optionally by status.",
  agents: ["finance", "chief"],
  schema: z.object({ status: z.enum(["draft", "sent", "paid", "overdue"]).nullish() }),
  summarize: (_a, lang) => L(lang, "List invoices", "عرض الفواتير"),
  async run(a, ctx) {
    const rows = await db.select().from(schema.invoices).where(a.status ? eq(schema.invoices.status, a.status) : undefined).orderBy(desc(schema.invoices.issuedAt)).limit(30);
    const unpaid = rows.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.amount), 0);
    return {
      invoices: rows,
      say:
        rows.map((r) => `• ${r.number} ${r.client} — ${money(Number(r.amount))} (${r.status})`).join("\n") +
        (unpaid ? L(ctx.lang, `\nOutstanding: ${money(unpaid)}.`, `\nالمستحق: ${money(unpaid)}.`) : ""),
    };
  },
});

export const updateInvoiceStatus = defineTool({
  name: "update_invoice_status",
  description: "Change an invoice's status (e.g. mark as paid when the client pays). Marking paid also logs the income.",
  agents: ["finance"],
  mutates: true,
  schema: z.object({ id: z.number().int(), status: z.enum(["draft", "sent", "paid", "overdue"]) }),
  summarize: (a, lang) => L(lang, `Mark invoice #${a.id} as ${a.status}`, `تغيير حالة الفاتورة رقم ${a.id}`),
  async run(a, ctx) {
    const [inv] = await db.update(schema.invoices).set({ status: a.status }).where(eq(schema.invoices.id, a.id)).returning();
    if (!inv) return { say: L(ctx.lang, "Invoice not found.", "الفاتورة غير موجودة.") };
    if (a.status === "paid") {
      await db.insert(schema.transactions).values({ type: "income", amount: inv.amount, currency: inv.currency, category: "sales", description: `Invoice ${inv.number} — ${inv.client}` });
    }
    return { invoice: inv, say: L(ctx.lang, `${inv.number} is now ${a.status}.`, `الفاتورة ${inv.number} أصبحت ${a.status}.`) };
  },
});

export const financeTools = [logTransaction, financeSummary, listTransactions, deleteTransaction, createInvoice, listInvoices, updateInvoiceStatus];
