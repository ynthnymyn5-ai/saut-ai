/**
 * Business workflows built on top of the core tools:
 *   1. Invoices: a printable bilingual invoice page (public, signed link) and
 *      `send_invoice`, which emails it to the client — only after approval.
 *   2. Weekly report: last 7 days vs the 7 before (money, tasks, sales,
 *      content), written up by Sanad, delivered Sunday mornings.
 *   3. Automatic follow-ups: for leads whose follow-up date has passed, Sanad
 *      drafts a short email and queues it for approval (never sends on its own).
 */
import crypto from "node:crypto";
import { z } from "zod";
import { and, eq, gte, isNotNull, lt, lte, notInArray, or, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { llm } from "../llm";
import { env, baseUrl } from "../env";
import { defineTool, L, type ToolContext } from "./types";
import { financeTotals } from "./finance";
import { addDays, dateKey, nowForPrompt, startOfDay, TZ } from "../lib/time";
import type { Lang } from "@shared/types";

// ─── 1. Invoices ─────────────────────────────────────────────────────────────
/** HMAC so the public invoice link can't be guessed from the id. */
export const invoiceToken = (id: number) => crypto.createHmac("sha256", env.SESSION_SECRET).update(`invoice:${id}`).digest("hex").slice(0, 24);
export const invoiceUrl = (id: number) => `${baseUrl()}/invoice/${id}/${invoiceToken(id)}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Printable bilingual invoice (A4). The browser's Print → Save as PDF makes the PDF. */
export function renderInvoiceHtml(inv: typeof schema.invoices.$inferSelect): string {
  const d = (x: Date | null) => (x ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(x) : "—");
  const amount = Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const status = { draft: "Draft · مسودة", sent: "Due · مستحقة", paid: "Paid · مدفوعة", overdue: "Overdue · متأخرة" }[inv.status] ?? inv.status;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(inv.number)} — ${esc(env.BUSINESS_NAME)}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  :root{--ink:#1c1426;--muted:#6b6478;--line:#e7e2ee;--accent:#7c3aed;--warm:#ea580c}
  *{box-sizing:border-box} body{margin:0;background:#f6f4f9;color:var(--ink);font:14px/1.5 Inter,"IBM Plex Sans Arabic",sans-serif}
  .page{max-width:800px;margin:24px auto;background:#fff;padding:48px;border-radius:16px;box-shadow:0 10px 40px rgba(28,20,38,.08)}
  header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid var(--accent);padding-bottom:20px}
  h1{margin:0;font-size:28px;letter-spacing:.02em} .ar{font-family:"IBM Plex Sans Arabic",sans-serif;direction:rtl}
  .muted{color:var(--muted)} .status{display:inline-block;margin-top:8px;padding:2px 10px;border-radius:99px;border:1px solid var(--line);font-size:12px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:28px 0}
  .label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:12px 8px;border-bottom:1px solid var(--line);text-align:left} th{font-size:12px;color:var(--muted);font-weight:600}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .total{display:flex;justify-content:flex-end;margin-top:20px} .total div{min-width:260px;gap:24px;padding:16px;border-radius:12px;background:#f3eefc;display:flex;justify-content:space-between;font-size:18px;font-weight:700}
  footer{margin-top:40px;font-size:12px;color:var(--muted);display:flex;justify-content:space-between;gap:16px}
  .print{position:fixed;bottom:20px;right:20px;background:var(--accent);color:#fff;border:0;border-radius:12px;padding:12px 18px;font-weight:600;cursor:pointer}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;border-radius:0}.print{display:none}}
  @media (max-width:600px){.page{padding:24px;margin:0;border-radius:0}.grid{grid-template-columns:1fr}header{flex-direction:column}}
</style></head><body>
<div class="page">
  <header>
    <div><h1>${esc(env.BUSINESS_NAME)}</h1><div class="muted">${esc(env.BUSINESS_DETAILS)}</div></div>
    <div style="text-align:right"><div class="label">Invoice · <span class="ar">فاتورة</span></div><h1 style="font-size:22px">${esc(inv.number)}</h1><span class="status">${status}</span></div>
  </header>
  <div class="grid">
    <div><div class="label">Bill to · <span class="ar">إلى</span></div><div style="font-size:16px;font-weight:600" dir="auto">${esc(inv.client)}</div></div>
    <div style="text-align:right"><div class="label">Issued · <span class="ar">تاريخ الإصدار</span></div><div>${d(inv.issuedAt)}</div>
      <div class="label" style="margin-top:8px">Due · <span class="ar">تاريخ الاستحقاق</span></div><div>${d(inv.dueAt)}</div></div>
  </div>
  <table><thead><tr><th>Description · <span class="ar">الوصف</span></th><th class="num">Amount · <span class="ar">المبلغ</span></th></tr></thead>
  <tbody><tr><td dir="auto">Products and services — ${esc(inv.client)}</td><td class="num">${amount} ${esc(inv.currency)}</td></tr></tbody></table>
  <div class="total"><div><span>Total · <span class="ar">الإجمالي</span></span><span>${amount} ${esc(inv.currency)}</span></div></div>
  <footer><span>Thank you for your business.</span><span class="ar">شكراً لتعاملكم معنا.</span></footer>
</div>
<button class="print" onclick="window.print()">Print / PDF</button>
</body></html>`;
}

export const sendInvoiceTool = defineTool({
  name: "send_invoice",
  description: "Email an invoice to the client with a link to the printable invoice, and mark it as sent. ALWAYS requires owner confirmation.",
  agents: ["finance", "chief", "sales"],
  confirm: true,
  mutates: true,
  schema: z.object({ invoiceId: z.number().int(), to: z.string().describe("Client email address"), message: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Send invoice #${a.invoiceId} to ${a.to}`, `إرسال الفاتورة رقم ${a.invoiceId} إلى ${a.to}`),
  async run(a, ctx) {
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, a.invoiceId));
    if (!inv) return { say: L(ctx.lang, "Invoice not found.", "الفاتورة غير موجودة.") };
    const amount = `${Number(inv.amount).toLocaleString("en-US", { minimumFractionDigits: 3 })} ${inv.currency}`;
    const body = [
      a.message || `Dear ${inv.client},`,
      "",
      `Please find invoice ${inv.number} for ${amount}${inv.dueAt ? `, due ${inv.dueAt.toISOString().slice(0, 10)}` : ""}.`,
      `View or download it here: ${invoiceUrl(inv.id)}`,
      "",
      "Thank you,",
      env.BUSINESS_NAME,
    ].join("\n");
    // Reuse the Gmail plugin's sender (sample mode when Gmail isn't connected)
    const { getTool } = await import("./registry");
    const out = await getTool("gmail_send")!.run({ to: a.to, subject: `Invoice ${inv.number} — ${env.BUSINESS_NAME}`, body } as never, ctx);
    if (inv.status === "draft") await db.update(schema.invoices).set({ status: "sent" }).where(eq(schema.invoices.id, inv.id));
    return { say: L(ctx.lang, `Invoice ${inv.number} sent to ${a.to}. ${out.say}`, `أُرسلت الفاتورة ${inv.number} إلى ${a.to}. ${out.say}`) };
  },
});

export const invoiceLinkTool = defineTool({
  name: "invoice_link",
  description: "Get the shareable link to a printable invoice (to view, print or save as PDF).",
  agents: ["finance", "chief"],
  schema: z.object({ invoiceId: z.number().int() }),
  summarize: (_a, lang) => L(lang, "Invoice link", "رابط الفاتورة"),
  async run(a, ctx) {
    return { url: invoiceUrl(a.invoiceId), say: L(ctx.lang, `Here's the invoice: ${invoiceUrl(a.invoiceId)}`, `رابط الفاتورة: ${invoiceUrl(a.invoiceId)}`) };
  },
});

// ─── 2. Weekly report ────────────────────────────────────────────────────────
export interface WeeklyData {
  from: string;
  to: string;
  income: number;
  expenses: number;
  net: number;
  prevIncome: number;
  prevExpenses: number;
  tasksDone: number;
  tasksAdded: number;
  overdueTasks: number;
  newLeads: number;
  dealsWon: { name: string; value: number }[];
  pipelineValue: number;
  contentPublished: number;
  topExpense: { category: string; amount: number } | null;
  currency: string;
}

export async function buildWeeklyData(): Promise<WeeklyData> {
  const to = startOfDay();
  const from = addDays(to, -7);
  const prevFrom = addDays(from, -7);
  const n = sql<number>`count(*)::int`;
  const [cur, prev, done, added, overdue, newLeads, won, pipeline, published] = await Promise.all([
    financeTotals(from, to),
    financeTotals(prevFrom, from),
    db.select({ n }).from(schema.tasks).where(and(eq(schema.tasks.status, "done"), gte(schema.tasks.updatedAt, from), lt(schema.tasks.updatedAt, to))),
    db.select({ n }).from(schema.tasks).where(and(gte(schema.tasks.createdAt, from), lt(schema.tasks.createdAt, to))),
    db.select({ n }).from(schema.tasks).where(and(sql`${schema.tasks.status} <> 'done'`, lt(schema.tasks.dueAt, to))),
    db.select({ n }).from(schema.leads).where(and(gte(schema.leads.createdAt, from), lt(schema.leads.createdAt, to))),
    db.select().from(schema.leads).where(and(eq(schema.leads.stage, "won"), gte(schema.leads.updatedAt, from), lt(schema.leads.updatedAt, to))),
    db.select({ v: sql<string>`coalesce(sum(${schema.leads.value}),0)` }).from(schema.leads).where(notInArray(schema.leads.stage, ["won", "lost"])),
    db.select({ n }).from(schema.contentItems).where(and(eq(schema.contentItems.status, "published"), gte(schema.contentItems.updatedAt, from), lt(schema.contentItems.updatedAt, to))),
  ]);
  const top = Object.entries(cur.byCategory).sort((a, b) => b[1] - a[1])[0];
  return {
    from: dateKey(from),
    to: dateKey(addDays(to, -1)),
    income: cur.income,
    expenses: cur.expenses,
    net: cur.net,
    prevIncome: prev.income,
    prevExpenses: prev.expenses,
    tasksDone: done[0].n,
    tasksAdded: added[0].n,
    overdueTasks: overdue[0].n,
    newLeads: newLeads[0].n,
    dealsWon: won.map((l) => ({ name: l.name, value: Number(l.value) })),
    pipelineValue: Number(pipeline[0].v),
    contentPublished: published[0].n,
    topExpense: top ? { category: top[0], amount: top[1] } : null,
    currency: env.CURRENCY,
  };
}

const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%` : "—");

function weeklyTemplate(w: WeeklyData, lang: Lang) {
  const m = (x: number) => `${Math.round(x).toLocaleString("en-US")} ${w.currency}`;
  return lang === "ar"
    ? [
        `📊 تقرير الأسبوع (${w.from} → ${w.to})`,
        `💰 الدخل ${m(w.income)} (${pct(w.income, w.prevIncome)}) · المصاريف ${m(w.expenses)} (${pct(w.expenses, w.prevExpenses)}) · الصافي ${m(w.net)}`,
        `✅ أُنجزت ${w.tasksDone} مهام وأُضيفت ${w.tasksAdded}، والمتأخر ${w.overdueTasks}.`,
        `🤝 ${w.newLeads} عملاء جدد، صفقات مكسوبة: ${w.dealsWon.map((d) => d.name).join("، ") || "لا شيء"}. المسار ${m(w.pipelineValue)}.`,
        `📣 منشورات هذا الأسبوع: ${w.contentPublished}.`,
      ].join("\n")
    : [
        `📊 Weekly report (${w.from} → ${w.to})`,
        `💰 Income ${m(w.income)} (${pct(w.income, w.prevIncome)}) · Expenses ${m(w.expenses)} (${pct(w.expenses, w.prevExpenses)}) · Net ${m(w.net)}`,
        `✅ ${w.tasksDone} tasks done, ${w.tasksAdded} added, ${w.overdueTasks} overdue.`,
        `🤝 ${w.newLeads} new leads; won: ${w.dealsWon.map((d) => d.name).join(", ") || "none"}. Pipeline ${m(w.pipelineValue)}.`,
        `📣 ${w.contentPublished} post(s) published.`,
      ].join("\n");
}

export async function generateWeeklyReport(lang: Lang = "en", force = false) {
  const key = `W-${dateKey(startOfDay())}`;
  if (!force) {
    const [row] = await db.select().from(schema.briefs).where(and(eq(schema.briefs.date, key), eq(schema.briefs.lang, lang))).limit(1);
    if (row) return { key, lang, text: row.text, data: row.data as WeeklyData, generatedAt: row.createdAt.toISOString() };
  }
  const data = await buildWeeklyData();
  let text = weeklyTemplate(data, lang);
  if (llm().isReal) {
    try {
      const r = await llm().chat({
        messages: [
          {
            role: "system",
            content: `You are Sanad, the owner's Chief of Staff (male). ${nowForPrompt()}
Write the weekly business report in ${lang === "ar" ? "Arabic" : "English"} from the JSON: the headline number first, what went well, what needs attention, and the 3 priorities for next week.
Compare with the previous week where the data allows. Max ~200 words, short lines, no markdown headings. Use only the numbers given.`,
          },
          { role: "user", content: JSON.stringify(data) },
        ],
      });
      if (r.content) text = r.content.trim();
    } catch (e) {
      console.error("[weekly] model failed, using template", e);
    }
  }
  await db.delete(schema.briefs).where(and(eq(schema.briefs.date, key), eq(schema.briefs.lang, lang)));
  const [row] = await db.insert(schema.briefs).values({ date: key, lang, text, data }).returning();
  return { key, lang, text, data, generatedAt: row.createdAt.toISOString() };
}

export const weeklyReportTool = defineTool({
  name: "get_weekly_report",
  description: "Weekly business report: last 7 days vs the previous 7 (income, expenses, tasks, leads, deals, content) with priorities.",
  agents: ["chief", "finance", "strategist"],
  schema: z.object({ refresh: z.boolean().nullish() }),
  summarize: (_a, lang) => L(lang, "Weekly report", "التقرير الأسبوعي"),
  async run(a, ctx) {
    const r = await generateWeeklyReport(ctx.lang, Boolean(a.refresh));
    return { report: r.data, say: r.text };
  },
});

// ─── 3. Automatic follow-ups ─────────────────────────────────────────────────
async function followUpEmail(lead: typeof schema.leads.$inferSelect): Promise<{ subject: string; body: string }> {
  const fallback = {
    subject: `Following up — ${env.BUSINESS_NAME}`,
    body: `Hi ${lead.name.split(" ")[0]},\n\nI wanted to follow up${lead.nextStep ? ` on: ${lead.nextStep.toLowerCase()}` : ""}. Is there anything you need from us to move forward?\n\nBest regards,\n${env.BUSINESS_NAME}`,
  };
  if (!llm().isReal) return fallback;
  try {
    const r = await llm().chat({
      json: true,
      fast: true,
      messages: [
        {
          role: "system",
          content: `Write a short, warm, professional follow-up email from ${env.BUSINESS_NAME} to a sales lead. 60-110 words, one clear ask, no pressure, no invented facts or prices. Write in Arabic only if the lead's name is written in Arabic, otherwise English. Return JSON {"subject":"...","body":"..."} and sign the body as ${env.BUSINESS_NAME}.`,
        },
        { role: "user", content: JSON.stringify({ name: lead.name, company: lead.company, stage: lead.stage, nextStep: lead.nextStep, notes: lead.notes }) },
      ],
    });
    const j = JSON.parse(r.content || "{}");
    return j.subject && j.body ? { subject: String(j.subject), body: String(j.body) } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Draft follow-ups for leads whose follow-up date has passed (max `limit`),
 * each queued as a pending gmail_send that the owner must approve.
 */
export async function runAutoFollowUps(limit = 5, ctxLang: Lang = "en") {
  const now = new Date();
  const due = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        notInArray(schema.leads.stage, ["won", "lost"]),
        isNotNull(schema.leads.email),
        lte(schema.leads.followUpAt, now),
        or(isNull(schema.leads.autoDraftedAt), lt(schema.leads.autoDraftedAt, schema.leads.followUpAt)),
      ),
    )
    .orderBy(schema.leads.followUpAt)
    .limit(limit);
  const { invokeTool } = await import("./registry");
  const ctx: ToolContext = { agentId: "sales", lang: ctxLang, channel: "web" };
  const queued: { lead: string; pendingId?: number; pending?: import("@shared/types").PendingActionDTO }[] = [];
  for (const lead of due) {
    const mail = await followUpEmail(lead);
    const r = await invokeTool("gmail_send", { to: lead.email, subject: mail.subject, body: mail.body }, ctx);
    await db.update(schema.leads).set({ autoDraftedAt: now }).where(eq(schema.leads.id, lead.id));
    queued.push({ lead: lead.name, pendingId: r.pending?.id, pending: r.pending });
  }
  return queued;
}

export const draftFollowUpsTool = defineTool({
  name: "draft_follow_ups",
  description: "Draft follow-up emails for every lead whose follow-up date has passed; each one waits for the owner's approval before sending.",
  agents: ["sales", "chief"],
  mutates: true,
  schema: z.object({ limit: z.number().int().min(1).max(10).nullish() }),
  summarize: (_a, lang) => L(lang, "Draft overdue follow-ups", "صياغة المتابعات المتأخرة"),
  async run(a, ctx) {
    const q = await runAutoFollowUps(a.limit ?? 5, ctx.lang);
    return {
      queued: q.map((x) => x.lead),
      pendingActions: q.map((x) => x.pending).filter(Boolean),
      say: q.length
        ? L(ctx.lang, `Drafted ${q.length} follow-up email(s) for ${q.map((x) => x.lead).join(", ")}. Each one is waiting for your approval.`, `صغت ${q.length} رسائل متابعة لـ ${q.map((x) => x.lead).join("، ")}. كل رسالة بانتظار موافقتك.`)
        : L(ctx.lang, "No follow-ups are due (leads need an email address and a past follow-up date).", "لا توجد متابعات مستحقة."),
    };
  },
});

export const businessTools = [sendInvoiceTool, invoiceLinkTool, weeklyReportTool, draftFollowUpsTool];
