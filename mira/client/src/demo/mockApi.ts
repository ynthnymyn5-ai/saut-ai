/**
 * DEMO MODE ONLY (built with VITE_DEMO=1).
 *
 * An in-browser stand-in for the Mira server so the full UI can be shared as
 * a static page: it intercepts fetch("/api/…"), keeps the sample "Noor Studio"
 * data in memory, and answers chat with a small rule-based router (English +
 * Arabic) that mirrors the server's offline mode — including the
 * confirmation gate for actions that send, delete, pay or publish.
 */
import type { AgentId } from "@shared/agents";
import type { BriefDTO, ChatResponse, Lang, PendingActionDTO } from "@shared/types";

// ─── helpers ────────────────────────────────────────────────────────────────
const now = () => new Date();
const day0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const at = (dayOffset: number, h: number, m = 0) => {
  const d = day0();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const iso = () => now().toISOString();
const isAr = (s: string) => (s.match(/[؀-ۿ]/g) ?? []).length > (s.match(/[A-Za-z]/g) ?? []).length * 0.5;
const L = (lang: Lang, en: string, ar: string) => (lang === "ar" ? ar : en);
const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} KWD`;
let seq = 1000;
const nextId = () => ++seq;

// ─── sample data ────────────────────────────────────────────────────────────
type Task = { id: number; title: string; description: string | null; status: "todo" | "in_progress" | "done"; priority: "low" | "medium" | "high" | "urgent"; project: string | null; dueAt: string | null; position: number; createdAt: string; updatedAt: string };
type Lead = { id: number; name: string; company: string | null; email: string | null; phone: string | null; stage: string; value: string; currency: string; nextStep: string | null; followUpAt: string | null; notes: string | null };
type Tx = { id: number; type: "income" | "expense"; amount: string; category: string; description: string | null; occurredAt: string };
type Inv = { id: number; number: string; client: string; amount: string; currency: string; status: string; issuedAt: string; dueAt: string | null };
type Content = { id: number; title: string; platform: string; caption: string | null; status: string; scheduledFor: string | null; createdAt: string };
type Note = { id: number; agentId: string; kind: string; title: string; body: string; codeLanguage: string | null; tags: string[]; data: Record<string, unknown> | null; updatedAt: string };
type Mem = { id: number; kind: string; content: string; source: string; pinned: boolean; updatedAt: string };
type Ev = { id: string; title: string; start: string; end?: string; location?: string | null; source: "local" };
type Mail = { id: string; from: string; subject: string; snippet: string; date: string; unread: boolean; source: "sample" };
type Msg = { id: number; role: "user" | "assistant"; content: string; lang: Lang; agentId: string; createdAt: string };
type Conv = { id: number; title: string; channel: string; updatedAt: string; messages: Msg[] };
type Act = { id: number; actor: string; agentId: string | null; action: string; summary: string; status: string; createdAt: string };

let t = 0;
const task = (title: string, priority: Task["priority"], status: Task["status"], project: string, dueAt: string | null): Task => ({ id: ++t, title, description: null, status, priority, project, dueAt, position: 0, createdAt: iso(), updatedAt: iso() });

const db = {
  tasks: [
    task("Call Ahmed about the corporate gifting order", "urgent", "todo", "Sales", at(0, 11)),
    task("Approve Ramadan collection label designs", "high", "todo", "Ramadan Collection", at(0, 16)),
    task("Order 200 amber glass jars from supplier", "high", "in_progress", "Operations", at(1, 12)),
    task("Send product photos to Talabat Mart listing team", "medium", "todo", "Marketplace", at(2, 10)),
    task("Renew commercial license", "medium", "todo", "Admin", at(9, 9)),
    task("Draft wholesale price list v2", "medium", "in_progress", "Sales", at(3, 15)),
    task("Fix checkout bug on Shopify (KNET redirect)", "urgent", "in_progress", "Website", at(-1, 18)),
    task("Book photographer for new collection shoot", "low", "todo", "Ramadan Collection", at(5, 10)),
    task("Hire part-time packing assistant", "high", "todo", "Team", at(6, 10)),
    task("Reconcile October expenses", "medium", "done", "Finance", null),
    task("Publish Instagram reel: behind the pour", "medium", "done", "Marketing", null),
  ],
  leads: [
    ["Ahmed Al-Sabah", "Gulf Bank — HR", "proposal", 4200, "Confirm 300 gift boxes for staff Ramadan gifts", at(0, 11), "ahmed.alsabah@example.com"],
    ["Sara Al-Mutairi", "The Avenues pop-up", "qualified", 1800, "Send pop-up booth proposal", at(1, 14), "sara@example.com"],
    ["Fahad Al-Kandari", "Kuwait Hotel Group", "contacted", 9500, "Schedule tasting of lobby scents", at(-1, 10), "fahad.k@example.com"],
    ["Layla Hassan", "Wedding planner (freelance)", "new", 1200, "Intro call", at(2, 17), null],
    ["Omar Haddad", "Dar Al Funoon Gallery", "won", 650, "Deliver order", at(3, 12), null],
    ["Noura Al-Rashed", "Boutique Spa Salmiya", "proposal", 2300, "Follow up on spa candle quote", at(0, 15), "noura@example.com"],
    ["Yousef Al-Ali", "Corporate events co.", "lost", 3000, "Went with cheaper supplier", null, null],
    ["Mariam Abdullah", "Instagram reseller (KSA)", "contacted", 1500, "Send wholesale price list", at(4, 11), null],
  ].map(([name, company, stage, value, nextStep, followUpAt, email], i) => ({ id: i + 1, name, company, stage, value: String(value), currency: "KWD", nextStep, followUpAt, email, phone: null, notes: null }) as Lead),
  transactions: [] as Tx[],
  invoices: [
    { id: 1, number: "INV-2026-0041", client: "Dar Al Funoon Gallery", amount: "650", currency: "KWD", status: "paid", issuedAt: at(-20, 10), dueAt: at(-6, 10) },
    { id: 2, number: "INV-2026-0042", client: "Boutique Spa Salmiya", amount: "1150", currency: "KWD", status: "sent", issuedAt: at(-9, 10), dueAt: at(5, 10) },
    { id: 3, number: "INV-2026-0043", client: "Kuwait Hotel Group", amount: "480", currency: "KWD", status: "overdue", issuedAt: at(-35, 10), dueAt: at(-5, 10) },
    { id: 4, number: "INV-2026-0044", client: "Gulf Bank — HR", amount: "2100", currency: "KWD", status: "draft", issuedAt: at(0, 9), dueAt: at(14, 10) },
  ] as Inv[],
  content: [
    { id: 1, title: "Ramadan collection teaser", platform: "instagram", status: "scheduled", scheduledFor: at(2, 19), caption: "Something golden is coming for Ramadan ✨🌙 Hand-poured oud, saffron and rose — in jars you'll keep forever.\n#NoorStudio #Ramadan #Kuwait", createdAt: iso() },
    { id: 2, title: "Behind the pour (reel)", platform: "instagram", status: "published", scheduledFor: at(-3, 20), caption: "60 seconds of pure calm: how every Noor candle is made by hand 🕯️", createdAt: iso() },
    { id: 3, title: "Customer of the week", platform: "instagram", status: "draft", scheduledFor: null, caption: "Our favourite cosy corners this week 💛 Tag us to be featured!", createdAt: iso() },
    { id: 4, title: "Corporate gifting guide", platform: "linkedin", status: "idea", scheduledFor: null, caption: null, createdAt: iso() },
    { id: 5, title: "Scent quiz — which Noor are you?", platform: "tiktok", status: "idea", scheduledFor: null, caption: null, createdAt: iso() },
    { id: 6, title: "National Day limited edition", platform: "instagram", status: "scheduled", scheduledFor: at(8, 18), caption: "🇰🇼 Limited National Day edition — only 150 made.", createdAt: iso() },
  ] as Content[],
  notes: [
    { id: 1, agentId: "researcher", kind: "research", title: "GCC home-fragrance market snapshot", body: "**Key findings**\n- Home fragrance is a fast-growing home category in the GCC, driven by gifting culture and premium oud scents.\n- Instagram and TikTok are the main discovery channels; Ramadan and Eid are peak seasons.\n- Corporate gifting is high-margin with 6–8 week lead times.\n\n**Implication:** lock in corporate Ramadan orders early.", codeLanguage: null, tags: [], data: { sources: [{ title: "Sample source (demo)", url: "https://example.com/gcc-home-fragrance" }] }, updatedAt: iso() },
    { id: 2, agentId: "strategist", kind: "decision", title: "Open a physical pop-up at The Avenues?", body: "**Recommendation:** run a 2-week pilot during Ramadan rather than a 3-month lease.\n\nBreak-even at ~85 candles/week at current margins.", codeLanguage: null, tags: [], data: { pros: ["High footfall during Ramadan", "Brand awareness + content", "Direct customer feedback"], cons: ["~1,800 KWD fixed cost", "Staffing evenings", "Inventory risk"] }, updatedAt: iso() },
    { id: 3, agentId: "strategist", kind: "plan", title: "Q1 growth plan", body: "1. Close 3 corporate gifting accounts (target 12k KWD).\n2. Launch on Talabat Mart.\n3. Grow Instagram from 8.4k → 15k with 3 reels/week.\n4. Introduce a monthly scent subscription box.", codeLanguage: null, tags: [], data: null, updatedAt: iso() },
    { id: 4, agentId: "engineering", kind: "snippet", title: "Shopify webhook → Google Sheet (orders log)", body: "```javascript\nfunction doPost(e) {\n  const order = JSON.parse(e.postData.contents);\n  const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');\n  sheet.appendRow([new Date(), order.name, order.total_price, order.customer?.email]);\n  return ContentService.createTextOutput('ok');\n}\n```", codeLanguage: "javascript", tags: [], data: null, updatedAt: iso() },
    { id: 5, agentId: "engineering", kind: "spec", title: "Spec: KNET checkout redirect fix", body: "**Problem:** KNET payers return to an empty cart.\n\n**Fix:** update the payment return URL and add a thank-you page fallback.\n\n**Done when:** 5 test payments land on the order status page.", codeLanguage: null, tags: [], data: null, updatedAt: iso() },
    { id: 6, agentId: "design", kind: "brief", title: "Ramadan collection — packaging brief", body: "**Goal:** premium giftable packaging for 3 scents.\n**Audience:** gift buyers 25–45, corporate HR.\n**Deliverables:** jar label, gift box, thank-you card.\n**Tone:** warm, golden, minimal Arabic calligraphy.", codeLanguage: null, tags: [], data: null, updatedAt: iso() },
    { id: 7, agentId: "design", kind: "moodboard", title: "Moodboard: Golden nights", body: "Warm candlelight, brushed brass, deep plum velvet, crescent-moon motifs, soft Kufic lettering.", codeLanguage: null, tags: [], data: { colors: ["#2b1638", "#5b2a6e", "#c9a227", "#f3e3c3", "#e08a3c"] }, updatedAt: iso() },
  ] as Note[],
  memories: [
    ["The owner runs Noor Studio, a Kuwait-based brand of handmade candles and home fragrance.", "business", true],
    ["The owner prefers short, direct answers and a morning brief at 7am.", "preference", true],
    ["Ahmed Al-Sabah is the HR manager at Gulf Bank and our biggest corporate gifting prospect.", "person", false],
    ["Fatima is the operations lead who manages packing and couriers.", "person", false],
    ["Best-selling scents are Oud & Saffron, White Musk and Rose Garden.", "business", false],
    ["Retail candle price is 12 KWD; wholesale is 7.5 KWD for orders above 50 units.", "business", false],
    ["The owner speaks Arabic and English and often mixes both.", "preference", false],
    ["Goal for this quarter: close 3 corporate gifting accounts.", "business", false],
  ].map(([content, kind, pinned], i) => ({ id: i + 1, content, kind, pinned, source: "seed", updatedAt: iso() }) as Mem),
  events: [
    ["Weekly planning with Fatima (ops)", at(0, 9, 30), "Studio"],
    ["Call: Ahmed — Gulf Bank gifting order", at(0, 11), "Phone"],
    ["Supplier visit — Al Rai packaging", at(0, 14), "Al Rai industrial area"],
    ["Instagram content shoot", at(0, 17), "Studio"],
    ["Tasting with Kuwait Hotel Group", at(1, 10), "JW Marriott lobby"],
    ["Accountant monthly check-in", at(2, 13), "Google Meet"],
  ].map(([title, start, location], i) => ({ id: String(i + 1), title, start, location, source: "local" }) as Ev),
  mail: [
    ["Ahmed Al-Sabah <ahmed.alsabah@example.com>", "Re: Ramadan staff gifts — quantities", "We'd like to go ahead with 300 boxes but need the logo engraved on the lids. Can you confirm delivery by the 20th?", at(0, 8, 12), true],
    ["Shopify <no-reply@shopify.com>", "You have 7 new orders", "7 new orders totalling 214.500 KWD since yesterday. 2 orders are awaiting fulfilment for more than 48 hours.", at(0, 7, 2), true],
    ["سارة المطيري <sara@example.com>", "عرض البوب أب في الأفنيوز", "مرحباً، هل يمكن إرسال عرض السعر لجناح البوب أب قبل يوم الخميس؟", at(0, 9, 48), true],
    ["Al Rai Packaging <sales@alrai-pack.example.com>", "Quotation for 200 amber jars", "200 amber jars 250ml at 0.420 KWD each, delivery in 5 working days. Valid until Thursday.", at(-1, 15, 40), true],
    ["Fahad Al-Kandari <fahad.k@example.com>", "Lobby scent tasting", "Could you bring 3 options that are fresh rather than heavy oud? Our GM will join.", at(-1, 11, 5), true],
    ["Talabat Mart Partners <partners@talabat.example.com>", "Your listing needs photos", "Please upload at least 6 product photos with white backgrounds.", at(-2, 9, 30), false],
  ].map(([from, subject, snippet, date, unread], i) => ({ id: String(i + 1), from, subject, snippet, date, unread, source: "sample" }) as Mail),
  conversations: [] as Conv[],
  activity: [] as Act[],
  pending: [] as (PendingActionDTO & { run: () => string; agentId: string })[],
};

// six months of finances
(() => {
  const cats: [string, number, string][] = [["materials", 780, "Wax, wicks and fragrance oils"], ["packaging", 320, "Boxes, jars and labels"], ["marketing", 260, "Instagram & Snapchat ads"], ["software", 85, "Shopify, Canva, Google Workspace"], ["rent", 450, "Studio rent"], ["salaries", 600, "Part-time help"], ["delivery", 140, "Courier fees"]];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const maxDay = i === 0 ? Math.max(1, today.getDate()) : 28;
    const d = (day: number) => new Date(m.getFullYear(), m.getMonth(), Math.min(day, maxDay), 12).toISOString();
    const g = 1 + (5 - i) * 0.08;
    db.transactions.push(
      { id: nextId(), type: "income", amount: (2100 * g).toFixed(2), category: "online store", description: "Shopify sales", occurredAt: d(i === 0 ? Math.max(1, today.getDate() - 1) : 27) },
      { id: nextId(), type: "income", amount: (900 * g).toFixed(2), category: "wholesale", description: "Wholesale orders", occurredAt: d(15) },
      { id: nextId(), type: "income", amount: (350 * g).toFixed(2), category: "pop-up", description: "Weekend market", occurredAt: d(8) },
    );
    for (const [c, base, desc] of cats) db.transactions.push({ id: nextId(), type: "expense", amount: (base * (0.85 + ((i * 7 + c.length) % 5) * 0.07) * (c === "marketing" ? g : 1)).toFixed(2), category: c, description: desc, occurredAt: d(c === "rent" ? 1 : 5 + (c.length % 15)) });
  }
  db.transactions.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  db.conversations.push(
    { id: 1, title: "Spending check", channel: "web", updatedAt: at(-1, 18), messages: [
      { id: 1, role: "user", content: "How much did we spend on marketing last month?", lang: "en", agentId: "chief", createdAt: at(-1, 18) },
      { id: 2, role: "assistant", content: "Last month marketing cost about 290 KWD — mostly Instagram and Snapchat ads, up ~8% month-on-month.", lang: "en", agentId: "chief", createdAt: at(-1, 18) },
    ] },
    { id: 2, title: "مهام اليوم", channel: "telegram", updatedAt: at(0, 8), messages: [
      { id: 3, role: "user", content: "شو عندي مهام عاجلة اليوم؟", lang: "ar", agentId: "chief", createdAt: at(0, 8) },
      { id: 4, role: "assistant", content: "عندك مهمتان عاجلتان: الاتصال بأحمد بخصوص طلب هدايا الشركات الساعة 11، وإصلاح مشكلة دفع كي نت في المتجر.", lang: "ar", agentId: "chief", createdAt: at(0, 8) },
    ] },
  );
  log("add_task", "operations", "Add task “Call Ahmed about the corporate gifting order”", "success", at(-1, 18, 5));
  log("delegate", "finance", "Chief of Staff → finance: marketing spend last month", "success", at(-1, 18, 2));
  log("memory.auto_save", "memory", "Remembered: Fatima is the operations lead who manages packing and couriers.", "success", at(-2, 12, 30));
  log("brief.sent", "chief", "Morning brief delivered", "success", at(0, 7), "system");
})();

function log(action: string, agentId: string | null, summary: string, status = "success", createdAt = iso(), actor = "mira") {
  db.activity.unshift({ id: nextId(), actor, agentId, action, summary, status, createdAt });
}

// ─── computations ───────────────────────────────────────────────────────────
function totals(from: Date, to: Date) {
  let income = 0;
  let expenses = 0;
  const byCategory: Record<string, number> = {};
  for (const x of db.transactions) {
    const d = new Date(x.occurredAt);
    if (d < from || d >= to) continue;
    const v = Number(x.amount);
    if (x.type === "income") income += v;
    else {
      expenses += v;
      byCategory[x.category] = (byCategory[x.category] ?? 0) + v;
    }
  }
  return { income, expenses, net: income - expenses, byCategory };
}
const monthStart = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
};
const sameDay = (a: string, offset = 0) => {
  const d = day0();
  d.setDate(d.getDate() + offset);
  const x = new Date(a);
  return x >= d && x.getTime() < d.getTime() + 86400000;
};
const openLeads = () => db.leads.filter((l) => !["won", "lost"].includes(l.stage));
const dueLeads = () => openLeads().filter((l) => l.followUpAt && new Date(l.followUpAt).getTime() < day0().getTime() + 2 * 86400000);
const fmtTime = (s: string, lang: Lang) => new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(s));

function briefData(): BriefDTO["data"] {
  const m = totals(monthStart(), monthStart(1));
  const tomorrow = day0().getTime() + 2 * 86400000;
  return {
    meetings: db.events.filter((e) => sameDay(e.start)).map((e) => ({ title: e.title, start: e.start, end: e.end, location: e.location ?? null })),
    urgentTasks: db.tasks.filter((x) => x.status !== "done" && (["urgent", "high"].includes(x.priority) || (x.dueAt && new Date(x.dueAt).getTime() < tomorrow))).sort((a, b) => ["urgent", "high", "medium", "low"].indexOf(a.priority) - ["urgent", "high", "medium", "low"].indexOf(b.priority)).slice(0, 8).map((x) => ({ id: x.id, title: x.title, priority: x.priority, dueAt: x.dueAt })),
    followUps: dueLeads().map((l) => ({ id: l.id, name: l.name, company: l.company, nextStep: l.nextStep, followUpAt: l.followUpAt })),
    numbers: { monthIncome: m.income, monthExpenses: m.expenses, net: m.net, pipelineValue: openLeads().reduce((s, l) => s + Number(l.value), 0), openTasks: db.tasks.filter((x) => x.status !== "done").length, unreadEmails: db.mail.filter((x) => x.unread).length, currency: "KWD" },
  };
}
function briefText(lang: Lang) {
  const d = briefData();
  const n = d.numbers;
  return lang === "ar"
    ? ["صباح الخير! هذا موجزك لليوم:", `📅 ${d.meetings.length} اجتماعات: ${d.meetings.map((m) => `${fmtTime(m.start, lang)} ${m.title}`).join("، ")}`, `🔥 الأهم اليوم: ${d.urgentTasks.slice(0, 3).map((x) => x.title).join("، ")}`, `🤝 متابعات مستحقة: ${d.followUps.map((f) => f.name).join("، ")}`, `💰 هذا الشهر: دخل ${money(n.monthIncome)} ومصاريف ${money(n.monthExpenses)}. المسار البيعي ${money(n.pipelineValue)}. ${n.unreadEmails} رسائل غير مقروءة.`, "💡 توصيتي: أكّد طلب أحمد (٣٠٠ علبة) اليوم قبل أي شيء آخر."].join("\n")
    : ["Good morning! Here's your brief for today:", `📅 ${d.meetings.length} meetings: ${d.meetings.map((m) => `${fmtTime(m.start, lang)} ${m.title}`).join(", ")}`, `🔥 Top priorities: ${d.urgentTasks.slice(0, 3).map((x) => x.title).join("; ")}`, `🤝 Follow-ups due: ${d.followUps.map((f) => `${f.name} (${f.nextStep})`).join(", ")}`, `💰 This month: ${money(n.monthIncome)} in, ${money(n.monthExpenses)} out (net ${money(n.net)}). Pipeline ${money(n.pipelineValue)}. ${n.unreadEmails} unread emails.`, "💡 My recommendation: lock in Ahmed's 300-box order before anything else today."].join("\n");
}

// ─── chat router ────────────────────────────────────────────────────────────
function parseWhen(s: string): string | null {
  const x = s.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).toLowerCase();
  let off: number | null = null;
  if (/today|tonight|اليوم/.test(x)) off = 0;
  else if (/tomorrow|غد|غدا|غداً|بكرة|بكره/.test(x)) off = 1;
  const tm = x.match(/(?:at|الساعة|الساعه)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|صباحا|صباحاً|مساء|مساءً)?/);
  if (off === null && !tm) return null;
  let h = tm ? Number(tm[1]) : 9;
  if (tm?.[3] && /pm|مساء/.test(tm[3]) && h < 12) h += 12;
  return at(off ?? 0, h, tm?.[2] ? Number(tm[2]) : 0);
}
function taskTitle(s: string) {
  return (
    s
      .replace(/^(please\s+)?(add|create|new)\s+(a\s+)?task\s*(to\s+)?/i, "")
      .replace(/^(please\s+)?remind me to\s+/i, "")
      .replace(/^(أضف|اضف)\s+مهمة\s*(لـ|ل)?\s*/, "")
      .replace(/^ذكّ?رني\s*(أن|ب)?\s*/, "")
      .replace(/\s+(today|tomorrow|tonight|at \d.*)\b.*$/i, "")
      .replace(/\s+(اليوم|غداً|غدا|بكرة|الساعة).*$/, "")
      .trim()
      .replace(/[.؟?!]+$/, "") || s
  );
}

interface Turn {
  reply: string;
  agent?: AgentId[];
  actions?: { tool: string; summary: string }[];
  pending?: PendingActionDTO[];
}

function queue(tool: string, summary: string, agentId: string, args: Record<string, unknown>, run: () => string): PendingActionDTO {
  const p = { id: nextId(), tool, summary, args, status: "pending" as const, createdAt: iso(), run, agentId };
  db.pending.unshift(p);
  log(tool, agentId, `Awaiting approval: ${summary}`, "pending");
  const { run: _r, agentId: _a, ...dto } = p;
  return dto;
}

function route(text: string, lang: Lang): Turn {
  const s = text.trim();
  // delete a task → confirmation
  if (/^(delete|remove)\b.*task|احذف|امسح/i.test(s)) {
    const words = s.toLowerCase().replace(/delete|remove|the|task|احذف|امسح|مهمة/g, "").trim().split(/\s+/).filter((w) => w.length > 2);
    const found = db.tasks.find((x) => words.some((w) => x.title.toLowerCase().includes(w))) ?? db.tasks.find((x) => x.status === "done");
    if (!found) return { reply: L(lang, "I couldn't find that task.", "لم أجد هذه المهمة.") };
    const summary = L(lang, `Delete task “${found.title}”`, `حذف المهمة «${found.title}»`);
    const p = queue("delete_task", summary, "operations", { id: found.id }, () => {
      db.tasks = db.tasks.filter((x) => x.id !== found.id);
      return L(lang, `Deleted “${found.title}”.`, `تم حذف «${found.title}».`);
    });
    return { reply: L(lang, `Deleting “${found.title}” needs your approval — check the confirmation card.`, `حذف «${found.title}» يحتاج موافقتك — راجع بطاقة التأكيد.`), agent: ["operations"], pending: [p] };
  }
  // reply / send email → draft + confirmation
  if (/(send|reply|email|write).*(ahmed|أحمد)|(رد|أرسل|ارسل).*(أحمد|احمد)/i.test(s)) {
    const body = L(lang, "Hi Ahmed,\n\nThank you — confirmed: 300 gift boxes with your logo engraved on the lids, delivered by the 20th. I'll send the final invoice today.\n\nBest regards,\nNoor Studio", "مرحباً أحمد،\n\nشكراً لك — نؤكد ٣٠٠ علبة هدايا مع نقش شعاركم على الأغطية، والتسليم قبل يوم ٢٠. سأرسل الفاتورة النهائية اليوم.\n\nمع التحية،\nنور ستوديو");
    const summary = L(lang, "Send email to ahmed.alsabah@example.com: “Re: Ramadan staff gifts”", "إرسال بريد إلى ahmed.alsabah@example.com: «بخصوص هدايا رمضان»");
    const p = queue("gmail_send", summary, "sales", { to: "ahmed.alsabah@example.com", subject: "Re: Ramadan staff gifts", body }, () => L(lang, "Marked as sent to Ahmed (demo — nothing was actually sent).", "تم وضع علامة مُرسل (عرض تجريبي — لم يُرسل شيء فعلياً)."));
    return { reply: L(lang, `Here's a draft reply:\n\n${body}\n\nSending needs your approval.`, `هذه مسودة الرد:\n\n${body}\n\nالإرسال يحتاج موافقتك.`), agent: ["sales"], actions: [{ tool: "gmail_create_draft", summary: L(lang, "Draft email to Ahmed", "مسودة رسالة لأحمد") }], pending: [p] };
  }
  if (/(add|create|new) (a )?task|remind me|أضف مهمة|اضف مهمة|ذكرني|ذكّرني/i.test(s)) {
    const title = taskTitle(s);
    const dueAt = parseWhen(s);
    const tk: Task = { ...task(title, /urgent|عاجل/i.test(s) ? "urgent" : "medium", "todo", "", dueAt), id: nextId(), project: null };
    db.tasks.unshift(tk);
    const summary = L(lang, `Add task “${title}”`, `إضافة مهمة «${title}»`);
    log("add_task", "operations", summary);
    const when = dueAt ? new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(dueAt)) : "";
    return { reply: L(lang, `Added “${title}”${when ? ` for ${when} — I'll remind you then` : ""}.`, `أضفت مهمة «${title}»${when ? ` يوم ${when} وسأذكّرك في وقتها` : ""}.`), agent: ["operations"], actions: [{ tool: "add_task", summary }] };
  }
  if (/^remember|remember that|تذكر أن|تذكري أن|احفظ/i.test(s)) {
    const content = s.replace(/^(please )?(remember( that)?|تذكر(ي)? أن|احفظ(ي)?)\s*/i, "");
    db.memories.unshift({ id: nextId(), content, kind: "fact", source: "manual", pinned: false, updatedAt: iso() });
    log("save_memory", "memory", `Remember: ${content}`);
    return { reply: L(lang, `Got it — I'll remember that ${content}.`, `تمام، سأتذكر: ${content}`), agent: ["memory"], actions: [{ tool: "save_memory", summary: content }] };
  }
  if (/what do you (know|remember)|ماذا تعرف|شو تعرف/i.test(s)) {
    return { reply: L(lang, "Here's what I remember:\n", "هذا ما أتذكره:\n") + db.memories.slice(0, 7).map((m) => `• ${m.content}`).join("\n"), agent: ["memory"] };
  }
  if (/brief|morning|موجز|ملخص اليوم/i.test(s)) return { reply: briefText(lang) };
  if (/meeting|schedule|calendar|agenda|اجتماع|مواعيد|موعد|جدول/i.test(s)) {
    const off = /tomorrow|غد|بكرة/i.test(s) ? 1 : 0;
    const ev = db.events.filter((e) => sameDay(e.start, off));
    const lbl = off ? L(lang, "tomorrow", "غداً") : L(lang, "today", "اليوم");
    return { reply: ev.length ? L(lang, `You have ${ev.length} meetings ${lbl}:\n`, `لديك ${ev.length} اجتماعات ${lbl}:\n`) + ev.map((e) => `• ${fmtTime(e.start, lang)} — ${e.title} (${e.location})`).join("\n") : L(lang, `No meetings ${lbl}.`, `لا اجتماعات ${lbl}.`) };
  }
  if (/e-?mail|inbox|\bmail\b|بريد|إيميل|ايميل|رسائل/i.test(s)) {
    const u = db.mail.filter((m) => m.unread);
    return {
      reply: L(lang, `You have ${u.length} unread emails. The ones that matter:\n`, `لديك ${u.length} رسائل غير مقروءة. الأهم منها:\n`) +
        L(lang, "• **Ahmed (Gulf Bank)** wants 300 boxes with engraved lids by the 20th — needs your confirmation and the final invoice.\n• **Shopify**: 7 new orders (214.5 KWD), 2 waiting over 48h to ship.\n• **Sara** asks for the Avenues pop-up quote before Thursday.\n• **Al Rai Packaging** quoted 0.420 KWD/jar, valid until Thursday.\n• **Fahad** wants 3 fresh (not heavy oud) scents for tomorrow's tasting.\n\nWant me to draft a reply to Ahmed?", "• **أحمد (بنك الخليج)** يريد ٣٠٠ علبة بأغطية منقوشة قبل يوم ٢٠ — يحتاج تأكيدك والفاتورة.\n• **Shopify**: ٧ طلبات جديدة (٢١٤٫٥ د.ك)، اثنان متأخران أكثر من ٤٨ ساعة.\n• **سارة** تطلب عرض سعر البوب أب قبل الخميس.\n• **الراي للتغليف**: ٠٫٤٢٠ د.ك للبرطمان، العرض حتى الخميس.\n• **فهد** يريد ٣ روائح منعشة لتذوق الغد.\n\nهل أكتب رداً لأحمد؟"),
    };
  }
  if (/spen[dt]|expense|cost|مصروف|مصاريف|صرفت|أنفقت|income|revenue|profit|دخل|إيراد|ربح/i.test(s)) {
    const last = /last month|الشهر الماضي/i.test(s);
    const m = last ? totals(monthStart(-1), monthStart()) : totals(monthStart(), monthStart(1));
    const top = Object.entries(m.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${money(v)}`).join(", ");
    return { reply: L(lang, `${last ? "Last month" : "This month"} you spent **${money(m.expenses)}** and earned **${money(m.income)}** — net **${money(m.net)}**. Biggest costs: ${top}.`, `${last ? "الشهر الماضي" : "هذا الشهر"} صرفت **${money(m.expenses)}** وحققت **${money(m.income)}** — الصافي **${money(m.net)}**. أكبر المصاريف: ${top}.`), agent: ["finance"] };
  }
  if (/caption|instagram|post|tiktok|منشور|كابشن|انستغرام|انستقرام/i.test(s)) {
    const caption = isAr(s) ? "✨ وصل الجديد من نور ستوديو! شموع مصبوبة يدوياً بالعود والزعفران — هدية تبقى ذكراها. اطلبها الآن والرابط في البايو 💜\n#نور_ستوديو #شموع #الكويت #هدايا" : "✨ New from Noor Studio: hand-poured oud & saffron candles, made to be gifted and kept. Light one tonight — link in bio 💜\n#NoorStudio #HandmadeCandles #Kuwait #GiftIdeas";
    db.content.unshift({ id: nextId(), title: L(lang, "New product launch post", "منشور إطلاق المنتج الجديد"), platform: "instagram", status: "draft", caption, scheduledFor: null, createdAt: iso() });
    log("save_content_item", "marketing", L(lang, "Save instagram draft “New product launch post”", "حفظ مسودة انستغرام"));
    return { reply: L(lang, `Here's a caption for the new product:\n\n${caption}\n\nSaved to your content calendar as a draft.`, `هذا كابشن للمنتج الجديد:\n\n${caption}\n\nحفظته كمسودة في تقويم المحتوى.`), agent: ["marketing"], actions: [{ tool: "save_content_item", summary: L(lang, "Saved caption draft", "حفظ مسودة") }] };
  }
  if (/lead|pipeline|deal|client|follow.?up|عميل|عملاء|صفقة|متابعة/i.test(s)) {
    const d = dueLeads();
    return { reply: L(lang, `Pipeline: ${openLeads().length} open deals worth ${money(openLeads().reduce((a, l) => a + Number(l.value), 0))}. Follow-ups due:\n`, `المسار: ${openLeads().length} صفقات مفتوحة بقيمة ${money(openLeads().reduce((a, l) => a + Number(l.value), 0))}. المتابعات المستحقة:\n`) + d.map((l) => `• ${l.name} (${l.company}) — ${l.nextStep}`).join("\n"), agent: ["sales"] };
  }
  if (/task|to-?do|urgent|مهام|المهام|مهمة|عاجل/i.test(s)) {
    const open = db.tasks.filter((x) => x.status !== "done").sort((a, b) => ["urgent", "high", "medium", "low"].indexOf(a.priority) - ["urgent", "high", "medium", "low"].indexOf(b.priority)).slice(0, 6);
    return { reply: L(lang, "Your top open tasks:\n", "أهم مهامك المفتوحة:\n") + open.map((x) => `• ${x.title} [${x.priority}]`).join("\n"), agent: ["operations"] };
  }
  return {
    reply: L(
      lang,
      "This is a **live demo** of Mira running in your browser with sample data, so I understand a set of commands. Try:\n• What are my meetings today?\n• Summarize my unread emails\n• How much did I spend this month?\n• Add a task to call Ahmed tomorrow at 10\n• Write an Instagram caption for my new product\n• Reply to Ahmed's email *(shows the approval step)*\n• Delete the task about the photographer *(approval step)*\n• Remember that my accountant is Khalid\n\nThe full app uses GPT-4o for open conversation.",
      "هذا **عرض تجريبي** لميرا يعمل في متصفحك ببيانات تجريبية، لذا أفهم أوامر محددة. جرّب:\n• ما هي اجتماعاتي اليوم؟\n• لخّص رسائلي غير المقروءة\n• كم صرفت هذا الشهر؟\n• أضف مهمة للاتصال بأحمد بكرة الساعة ١٠\n• اكتب كابشن انستغرام لمنتجي الجديد\n• رد على إيميل أحمد *(يُظهر خطوة الموافقة)*\n• احذف مهمة المصور *(خطوة الموافقة)*\n• تذكر أن محاسبي اسمه خالد\n\nالتطبيق الكامل يستخدم GPT-4o للمحادثة المفتوحة.",
    ),
  };
}

// ─── HTTP layer ─────────────────────────────────────────────────────────────
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const strip = <T extends { run?: unknown; agentId?: unknown }>(p: T) => {
  const { run: _r, ...rest } = p;
  return rest;
};

async function handle(method: string, path: string, query: URLSearchParams, body: Record<string, any>): Promise<Response> {
  const seg = path.replace(/^\/api\//, "").split("/");
  const id = Number(seg[1]);
  const find = <T extends { id: number }>(arr: T[]) => arr.find((x) => x.id === id);

  switch (`${method} ${seg[0]}`) {
    case "GET auth":
      return json({ user: { id: "demo", name: "Demo owner", email: null, image: null }, mode: "demo" });
    case "GET status":
      return json({ provider: "demo (runs in your browser)", aiConfigured: false, demo: true, serverVoice: false, webSearch: false, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, briefHour: 7, currency: "KWD", confirmTools: ["delete_task", "gmail_send"] });
    case "PUT settings":
      return json({ ok: true });
    case "GET voice":
      return json({ serverVoice: false });
    case "POST voice":
      return json({ error: "voice_not_configured" }, 503);
    case "GET overview": {
      const m = totals(monthStart(), monthStart(1));
      const cnt = (a: string) => db.notes.filter((n) => n.agentId === a).length;
      return json({
        chief: { label: "unread", value: db.mail.filter((x) => x.unread).length },
        operations: { label: "open", value: db.tasks.filter((x) => x.status !== "done").length, alert: db.tasks.filter((x) => x.status !== "done" && x.priority === "urgent").length },
        sales: { label: "leads", value: openLeads().length, alert: dueLeads().length },
        marketing: { label: "scheduled", value: db.content.filter((x) => x.status === "scheduled").length },
        finance: { label: "net", value: Math.round(m.net), currency: "KWD" },
        memory: { label: "memories", value: db.memories.length },
        researcher: { label: "notes", value: cnt("researcher") },
        strategist: { label: "notes", value: cnt("strategist") },
        engineering: { label: "notes", value: cnt("engineering") },
        design: { label: "notes", value: cnt("design") },
      });
    }
    case "POST chat": {
      const text = String(body.message ?? "");
      const lang: Lang = isAr(text) ? "ar" : "en";
      await new Promise((r) => setTimeout(r, 650)); // let the orb "think"
      const turn = route(text, lang);
      let conv = db.conversations.find((c) => c.id === body.conversationId);
      if (!conv) {
        conv = { id: nextId(), title: text.slice(0, 60), channel: "web", updatedAt: iso(), messages: [] };
        db.conversations.unshift(conv);
      }
      conv.messages.push({ id: nextId(), role: "user", content: text, lang, agentId: "chief", createdAt: iso() });
      const msgId = nextId();
      conv.messages.push({ id: msgId, role: "assistant", content: turn.reply, lang, agentId: "chief", createdAt: iso() });
      conv.updatedAt = iso();
      for (const a of turn.agent ?? []) log("delegate", a, `Chief of Staff → ${a}: ${text.slice(0, 120)}`);
      const res: ChatResponse = { conversationId: conv.id, messageId: msgId, reply: turn.reply, lang, agent: (body.agentId ?? "chief") as AgentId, delegations: turn.agent ?? [], actions: turn.actions ?? [], pending: turn.pending ?? [], provider: "demo" };
      return json(res);
    }
    case "GET actions":
      return json(db.pending.filter((p) => p.status === "pending").map(strip));
    case "POST actions": {
      const p = db.pending.find((x) => x.id === id);
      if (!p) return json({ error: "not found" }, 404);
      const approve = seg[2] === "confirm";
      const lang: Lang = body.lang === "ar" ? "ar" : "en";
      let say: string;
      if (p.status !== "pending") say = L(lang, "This action was already handled.", "تمت معالجته مسبقاً.");
      else if (approve) {
        say = p.run();
        p.status = "executed";
        log(p.tool, p.agentId, `Approved & done: ${p.summary}`, "success", iso(), "mira");
      } else {
        p.status = "cancelled";
        say = L(lang, `Cancelled: ${p.summary}`, `تم الإلغاء: ${p.summary}`);
        log(p.tool, p.agentId, `Cancelled: ${p.summary}`, "cancelled", iso(), "user");
      }
      return json({ action: strip(p), say });
    }
    case "GET brief": {
      const lang: Lang = query.get("lang") === "ar" ? "ar" : "en";
      return json({ date: iso().slice(0, 10), lang, text: briefText(lang), data: briefData(), generatedAt: iso() } satisfies BriefDTO);
    }
    case "POST brief":
      return json({ ok: true });
    case "GET integrations":
      return json(
        [
          ["google_calendar", "Google Calendar", "Read your schedule and create or move events.", "calendar", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "Demo uses a local calendar with sample events."],
          ["gmail", "Gmail", "Read and summarise email, draft replies. Sending always asks you first.", "email", ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], "Demo uses a sample inbox."],
          ["telegram", "Telegram bot", "Chat with Mira and get reminders and your daily brief on Telegram.", "messaging", ["TELEGRAM_BOT_TOKEN", "TELEGRAM_OWNER_CHAT_ID"], undefined],
          ["whatsapp", "WhatsApp Business", "Talk to Mira on WhatsApp and let her send messages (with your approval).", "messaging", ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_OWNER_NUMBER"], undefined],
          ["notion", "Notion", "Search, read and write documents in your Notion workspace.", "documents", ["NOTION_TOKEN"], undefined],
        ].map(([id, name, description, category, requiredSecrets, detail]) => ({ id, name, description, category, requiredSecrets, detail, configured: false, connected: false })),
      );
    case "GET push":
      return json({ error: "Push notifications aren't available in the demo." }, 503);
    case "POST push":
      return json({ delivered: 0 });

    // tasks
    case "GET tasks":
      return json(db.tasks);
    case "POST tasks": {
      const tk = { ...task(body.title, body.priority ?? "medium", body.status ?? "todo", body.project ?? null, body.dueAt ?? null), id: nextId(), description: body.description ?? null };
      db.tasks.unshift(tk);
      log("add_task", "operations", `Added task “${tk.title}”`, "success", iso(), "user");
      return json(tk);
    }
    case "PATCH tasks": {
      const x = find(db.tasks);
      if (x) Object.assign(x, body, { updatedAt: iso() });
      return json(x);
    }
    case "DELETE tasks":
      db.tasks = db.tasks.filter((x) => x.id !== id);
      log("delete_task", "operations", `Deleted task #${id}`, "success", iso(), "user");
      return json({ ok: true });

    // leads
    case "GET leads":
      return json(db.leads);
    case "POST leads": {
      const l = { id: nextId(), currency: "KWD", ...body, value: String(body.value ?? 0) } as Lead;
      db.leads.push(l);
      return json(l);
    }
    case "PATCH leads": {
      const x = find(db.leads);
      if (x) Object.assign(x, body, body.value !== undefined ? { value: String(body.value) } : {});
      return json(x);
    }
    case "DELETE leads":
      db.leads = db.leads.filter((x) => x.id !== id);
      return json({ ok: true });

    // finance
    case "GET finance": {
      if (seg[1] === "transactions") return json(db.transactions);
      if (seg[1] === "invoices") return json(db.invoices);
      const series = [5, 4, 3, 2, 1, 0].map((i) => {
        const tt = totals(monthStart(-i), monthStart(-i + 1));
        const m = monthStart(-i);
        return { month: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`, income: tt.income, expenses: tt.expenses };
      });
      return json({ month: totals(monthStart(), monthStart(1)), series, currency: "KWD" });
    }
    case "POST finance": {
      const x: Tx = { id: nextId(), type: body.type, amount: String(body.amount), category: String(body.category || "general").toLowerCase(), description: body.description ?? null, occurredAt: iso() };
      db.transactions.unshift(x);
      return json(x);
    }
    case "PATCH finance": {
      const inv = db.invoices.find((x) => x.id === Number(seg[2]));
      if (inv) {
        inv.status = body.status;
        if (body.status === "paid") db.transactions.unshift({ id: nextId(), type: "income", amount: inv.amount, category: "sales", description: `Invoice ${inv.number} — ${inv.client}`, occurredAt: iso() });
      }
      return json(inv);
    }
    case "DELETE finance":
      db.transactions = db.transactions.filter((x) => x.id !== Number(seg[2]));
      return json({ ok: true });

    // content
    case "GET content":
      return json(db.content);
    case "POST content": {
      const c = { id: nextId(), createdAt: iso(), platform: "instagram", status: "idea", caption: null, scheduledFor: null, ...body } as Content;
      db.content.unshift(c);
      return json(c);
    }
    case "PATCH content": {
      const x = find(db.content);
      if (x) Object.assign(x, body);
      return json(x);
    }
    case "DELETE content":
      db.content = db.content.filter((x) => x.id !== id);
      return json({ ok: true });

    // notes
    case "GET notes":
      return json(db.notes.filter((n) => !query.get("agent") || n.agentId === query.get("agent")));
    case "POST notes": {
      const n = { id: nextId(), updatedAt: iso(), tags: [], data: null, codeLanguage: null, ...body } as unknown as Note;
      db.notes.unshift(n);
      return json(n);
    }
    case "PATCH notes": {
      const x = find(db.notes);
      if (x) Object.assign(x, body, { updatedAt: iso() });
      return json(x);
    }
    case "DELETE notes":
      db.notes = db.notes.filter((x) => x.id !== id);
      return json({ ok: true });

    // memories
    case "GET memories": {
      const q = (query.get("q") ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      if (!q.length) return json([...db.memories].sort((a, b) => Number(b.pinned) - Number(a.pinned)));
      return json(
        db.memories
          .map((m) => ({ ...m, similarity: q.filter((w) => m.content.toLowerCase().includes(w)).length / q.length }))
          .filter((m) => m.similarity > 0)
          .sort((a, b) => b.similarity - a.similarity),
      );
    }
    case "POST memories": {
      const m = { id: nextId(), content: body.content, kind: body.kind ?? "fact", source: "manual", pinned: false, updatedAt: iso() };
      db.memories.unshift(m);
      log("save_memory", "memory", `Saved memory: ${m.content}`, "success", iso(), "user");
      return json(m);
    }
    case "PATCH memories": {
      const x = find(db.memories);
      if (x) Object.assign(x, body, { updatedAt: iso() });
      return json(x);
    }
    case "DELETE memories":
      db.memories = db.memories.filter((x) => x.id !== id);
      return json({ ok: true });

    case "GET calendar":
      return json(db.events);
    case "GET inbox":
      return json(db.mail);

    // history
    case "GET conversations": {
      if (seg[1]) {
        const c = db.conversations.find((x) => x.id === id);
        return c ? json({ conversation: c, messages: c.messages }) : json({ error: "not_found" }, 404);
      }
      const q = (query.get("q") ?? "").toLowerCase();
      if (q) {
        const hits = db.conversations.flatMap((c) => c.messages.filter((m) => m.content.toLowerCase().includes(q)).map((m) => ({ conversationId: c.id, title: c.title, channel: c.channel, messageId: m.id, role: m.role, content: m.content, createdAt: m.createdAt })));
        return json({ hits });
      }
      return json({ conversations: db.conversations.map(({ messages: _m, ...c }) => c) });
    }
    case "DELETE conversations":
      db.conversations = db.conversations.filter((x) => x.id !== id);
      return json({ ok: true });

    case "GET activity": {
      const agent = query.get("agent");
      const q = (query.get("q") ?? "").toLowerCase();
      return json(db.activity.filter((a) => (!agent || a.agentId === agent) && (!q || `${a.summary} ${a.action}`.toLowerCase().includes(q))));
    }
  }
  return json({ error: "not_found" }, 404);
}

/** Route fetch("/api/…") to the in-browser demo server. */
export function installMockApi() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith("/api/") && !url.pathname.includes("/api/")) return real(input, init);
    const path = url.pathname.slice(url.pathname.indexOf("/api/"));
    let body: Record<string, unknown> = {};
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        /* not JSON */
      }
    }
    return handle((init?.method ?? "GET").toUpperCase(), path, url.searchParams, body);
  };
}
