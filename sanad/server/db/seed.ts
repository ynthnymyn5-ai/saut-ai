/**
 * Realistic sample data so every screen has something to show.
 * Scenario: the owner runs "Noor Studio", a small Kuwait-based brand selling
 * handmade candles and home fragrance, with a B2B gifting side-line.
 *
 *   npm run db:seed   (wipes business tables and reseeds)
 */
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import { db, pool, schema } from "./index";
import { addDays, startOfDay, zonedDate, zonedParts } from "../lib/time";
import { llm } from "../llm";

const today = startOfDay();
const at = (dayOffset: number, hour: number, minute = 0) => {
  const p = zonedParts(addDays(today, dayOffset));
  return zonedDate(p.year, p.month, p.day, hour, minute);
};

export async function seed() {
  console.log("Seeding sample data…");
  await db.execute(sql`TRUNCATE tasks, reminders, leads, transactions, invoices, content_items, notes, calendar_events, sample_emails, email_drafts, memories, messages, conversations, pending_actions, activity_log, briefs RESTART IDENTITY CASCADE`);

  // ─── Tasks ────────────────────────────────────────────────────────────────
  await db.insert(schema.tasks).values([
    { title: "Call Ahmed about the corporate gifting order", priority: "urgent", status: "todo", project: "Sales", dueAt: at(0, 11) },
    { title: "Approve Ramadan collection label designs", priority: "high", status: "todo", project: "Ramadan Collection", dueAt: at(0, 16) },
    { title: "Order 200 amber glass jars from supplier", priority: "high", status: "in_progress", project: "Operations", dueAt: at(1, 12) },
    { title: "Send product photos to Talabat Mart listing team", priority: "medium", status: "todo", project: "Marketplace", dueAt: at(2, 10) },
    { title: "Renew commercial license", priority: "medium", status: "todo", project: "Admin", dueAt: at(9, 9) },
    { title: "Draft wholesale price list v2", priority: "medium", status: "in_progress", project: "Sales", dueAt: at(3, 15) },
    { title: "Fix checkout bug on Shopify (KNET redirect)", priority: "urgent", status: "in_progress", project: "Website", dueAt: at(-1, 18) },
    { title: "Book photographer for new collection shoot", priority: "low", status: "todo", project: "Ramadan Collection", dueAt: at(5, 10) },
    { title: "Reconcile October expenses", priority: "medium", status: "done", project: "Finance" },
    { title: "Hire part-time packing assistant", priority: "high", status: "todo", project: "Team", dueAt: at(6, 10) },
    { title: "Publish Instagram reel: behind the pour", priority: "medium", status: "done", project: "Marketing" },
    { title: "Test new oud & rose fragrance batch", priority: "low", status: "done", project: "Product" },
  ]);
  await db.insert(schema.reminders).values([{ text: "Call Ahmed about the corporate gifting order", remindAt: at(0, 10, 45) }]);

  // ─── Leads ────────────────────────────────────────────────────────────────
  await db.insert(schema.leads).values([
    { name: "Ahmed Al-Sabah", company: "Gulf Bank — HR", email: "ahmed.alsabah@example.com", phone: "+965 9999 1201", stage: "proposal", value: "4200", nextStep: "Confirm 300 gift boxes for staff Ramadan gifts", followUpAt: at(0, 11), notes: "Wants logo engraving on lids." },
    { name: "Sara Al-Mutairi", company: "The Avenues pop-up", email: "sara@example.com", stage: "qualified", value: "1800", nextStep: "Send pop-up booth proposal", followUpAt: at(1, 14) },
    { name: "Fahad Al-Kandari", company: "Kuwait Hotel Group", email: "fahad.k@example.com", stage: "contacted", value: "9500", nextStep: "Schedule tasting of lobby scents", followUpAt: at(-1, 10), notes: "Interested in signature scent for 3 hotels." },
    { name: "Layla Hassan", company: "Wedding planner (freelance)", phone: "+965 6555 4433", stage: "new", value: "1200", nextStep: "Intro call", followUpAt: at(2, 17) },
    { name: "Omar Haddad", company: "Dar Al Funoon Gallery", stage: "won", value: "650", nextStep: "Deliver order", followUpAt: at(3, 12) },
    { name: "Noura Al-Rashed", company: "Boutique Spa Salmiya", email: "noura@example.com", stage: "proposal", value: "2300", nextStep: "Follow up on spa candle quote", followUpAt: at(0, 15) },
    { name: "Yousef Al-Ali", company: "Corporate events co.", stage: "lost", value: "3000", nextStep: "Went with cheaper supplier" },
    { name: "Mariam Abdullah", company: "Instagram reseller (KSA)", stage: "contacted", value: "1500", nextStep: "Send wholesale price list", followUpAt: at(4, 11) },
  ]);

  // ─── Finance: 6 months of history + this month ────────────────────────────
  const tx: (typeof schema.transactions.$inferInsert)[] = [];
  const p = zonedParts();
  const expenseCats: [string, number, string][] = [
    ["materials", 780, "Wax, wicks and fragrance oils"],
    ["packaging", 320, "Boxes, jars and labels"],
    ["marketing", 260, "Instagram & Snapchat ads"],
    ["software", 85, "Shopify, Canva, Google Workspace"],
    ["rent", 450, "Studio rent"],
    ["salaries", 600, "Part-time help"],
    ["delivery", 140, "Courier fees"],
  ];
  for (let i = 5; i >= 0; i--) {
    let m = p.month - i;
    let y = p.year;
    while (m <= 0) {
      m += 12;
      y--;
    }
    const growth = 1 + (5 - i) * 0.08;
    const isCurrent = i === 0;
    const maxDay = isCurrent ? Math.max(1, p.day) : 28;
    const d = (day: number) => zonedDate(y, m, Math.min(day, maxDay), 12);
    tx.push(
      { type: "income", amount: (2100 * growth).toFixed(2), category: "online store", description: "Shopify sales", occurredAt: d(isCurrent ? Math.max(1, p.day - 1) : 27) },
      { type: "income", amount: (900 * growth).toFixed(2), category: "wholesale", description: "Wholesale orders", occurredAt: d(15) },
      { type: "income", amount: (350 * growth).toFixed(2), category: "pop-up", description: "Weekend market", occurredAt: d(8) },
    );
    for (const [cat, base, desc] of expenseCats) {
      const jitter = 0.85 + ((i * 7 + cat.length) % 5) * 0.07;
      tx.push({ type: "expense", amount: (base * jitter * (cat === "marketing" ? growth : 1)).toFixed(2), category: cat, description: desc, occurredAt: d(cat === "rent" ? 1 : 5 + (cat.length % 15)) });
    }
  }
  await db.insert(schema.transactions).values(tx);

  await db.insert(schema.invoices).values([
    { number: "INV-2026-0041", client: "Dar Al Funoon Gallery", amount: "650", status: "paid", issuedAt: at(-20, 10), dueAt: at(-6, 10) },
    { number: "INV-2026-0042", client: "Boutique Spa Salmiya", amount: "1150", status: "sent", issuedAt: at(-9, 10), dueAt: at(5, 10) },
    { number: "INV-2026-0043", client: "Kuwait Hotel Group", amount: "480", status: "overdue", issuedAt: at(-35, 10), dueAt: at(-5, 10) },
    { number: "INV-2026-0044", client: "Gulf Bank — HR", amount: "2100", status: "draft", issuedAt: at(0, 9), dueAt: at(14, 10) },
  ]);

  // ─── Marketing ────────────────────────────────────────────────────────────
  await db.insert(schema.contentItems).values([
    { title: "Ramadan collection teaser", platform: "instagram", status: "scheduled", scheduledFor: at(2, 19), caption: "Something golden is coming for Ramadan ✨🌙 Hand-poured oud, saffron and rose — in jars you'll keep forever. Launching this Thursday.\n#NoorStudio #Ramadan #Kuwait #HandmadeCandles" },
    { title: "Behind the pour (reel)", platform: "instagram", status: "published", scheduledFor: at(-3, 20), caption: "60 seconds of pure calm: how every Noor candle is made by hand 🕯️" },
    { title: "Customer of the week", platform: "instagram", status: "draft", caption: "Our favourite cosy corners this week 💛 Tag us to be featured!" },
    { title: "Corporate gifting guide", platform: "linkedin", status: "idea" },
    { title: "Scent quiz — which Noor are you?", platform: "tiktok", status: "idea" },
    { title: "National Day limited edition", platform: "instagram", status: "scheduled", scheduledFor: at(8, 18), caption: "🇰🇼 Limited National Day edition — only 150 made." },
  ]);

  // ─── Notes for Researcher / Strategist / Engineering / Design ─────────────
  await db.insert(schema.notes).values([
    {
      agentId: "researcher",
      kind: "research",
      title: "GCC home-fragrance market snapshot",
      body: "**Key findings**\n- Home fragrance is one of the fastest-growing home categories in the GCC, driven by gifting culture and premium oud scents.\n- Instagram and TikTok are the main discovery channels for small brands; Ramadan and Eid are the peak seasons.\n- Corporate gifting is a high-margin B2B channel with long lead times (order 6–8 weeks ahead).\n\n**Implication for Noor Studio:** lock in corporate Ramadan orders early and lead with oud/saffron blends.",
      tags: ["market", "gcc"],
      data: { sources: [{ title: "Sample source — replace after live research", url: "https://example.com/gcc-home-fragrance" }] },
    },
    {
      agentId: "strategist",
      kind: "decision",
      title: "Open a physical pop-up at The Avenues?",
      body: "**Recommendation:** run a 2-week pilot during Ramadan rather than a 3-month lease.\n\nBreak-even at ~85 candles/week at current margins.",
      data: { pros: ["High footfall during Ramadan", "Brand awareness + content", "Direct customer feedback"], cons: ["~1,800 KWD fixed cost", "Staffing evenings", "Inventory risk"] },
    },
    {
      agentId: "strategist",
      kind: "plan",
      title: "Q1 growth plan",
      body: "1. Close 3 corporate gifting accounts (target 12k KWD).\n2. Launch on Talabat Mart.\n3. Grow Instagram from 8.4k → 15k with 3 reels/week.\n4. Introduce subscription box (monthly scent).",
    },
    {
      agentId: "engineering",
      kind: "snippet",
      title: "Shopify webhook → Google Sheet (orders log)",
      codeLanguage: "javascript",
      body: "```javascript\n// Google Apps Script: receive Shopify order webhooks\nfunction doPost(e) {\n  const order = JSON.parse(e.postData.contents);\n  const sheet = SpreadsheetApp.getActive().getSheetByName('Orders');\n  sheet.appendRow([new Date(), order.name, order.total_price, order.customer?.email]);\n  return ContentService.createTextOutput('ok');\n}\n```",
      tags: ["shopify", "automation"],
    },
    {
      agentId: "engineering",
      kind: "spec",
      title: "Spec: KNET checkout redirect fix",
      body: "**Problem:** customers paying with KNET are returned to an empty cart page.\n\n**Cause (suspected):** return URL drops the `?checkout_token` param.\n\n**Fix:** update payment app return URL, add a thank-you page fallback that looks up the last order by email.\n\n**Done when:** 5 test payments land on the order status page.",
    },
    {
      agentId: "design",
      kind: "brief",
      title: "Ramadan collection — packaging brief",
      body: "**Goal:** premium giftable packaging for 3 scents.\n**Audience:** gift buyers 25–45, corporate HR.\n**Deliverables:** jar label, gift box, thank-you card.\n**Tone:** warm, golden, minimal Arabic calligraphy.\n**Constraints:** print-ready by the 1st, budget 0.35 KWD/box.",
    },
    {
      agentId: "design",
      kind: "moodboard",
      title: "Moodboard: Golden nights",
      body: "Warm candlelight, brushed brass, deep plum velvet, crescent-moon motifs, soft Kufic lettering. Textures: linen, kraft paper, gold foil.",
      data: { colors: ["#2b1638", "#5b2a6e", "#c9a227", "#f3e3c3", "#e08a3c"] },
    },
  ]);

  // ─── Calendar (local, used until Google is connected) ─────────────────────
  await db.insert(schema.calendarEvents).values([
    { title: "Weekly planning with Fatima (ops)", startAt: at(0, 9, 30), endAt: at(0, 10), location: "Studio" },
    { title: "Call: Ahmed — Gulf Bank gifting order", startAt: at(0, 11), endAt: at(0, 11, 30), location: "Phone", attendees: ["ahmed.alsabah@example.com"] },
    { title: "Supplier visit — Al Rai packaging", startAt: at(0, 14), endAt: at(0, 15), location: "Al Rai industrial area" },
    { title: "Instagram content shoot", startAt: at(0, 17), endAt: at(0, 18, 30), location: "Studio" },
    { title: "Tasting with Kuwait Hotel Group", startAt: at(1, 10), endAt: at(1, 11), location: "JW Marriott lobby", attendees: ["fahad.k@example.com"] },
    { title: "Accountant monthly check-in", startAt: at(2, 13), endAt: at(2, 13, 45), location: "Google Meet" },
    { title: "Avenues pop-up walkthrough", startAt: at(3, 16), endAt: at(3, 17), location: "The Avenues, Phase 4" },
  ]);

  // ─── Sample inbox (used until Gmail is connected) ─────────────────────────
  await db.insert(schema.sampleEmails).values([
    { fromName: "Ahmed Al-Sabah", fromEmail: "ahmed.alsabah@example.com", subject: "Re: Ramadan staff gifts — quantities", body: "Hi, we'd like to go ahead with 300 boxes but need the logo engraved on the lids. Can you confirm delivery by the 20th and send the final invoice? Thanks, Ahmed", receivedAt: at(0, 8, 12) },
    { fromName: "Shopify", fromEmail: "no-reply@shopify.com", subject: "You have 7 new orders", body: "7 new orders totalling 214.500 KWD since yesterday. 2 orders are awaiting fulfilment for more than 48 hours.", receivedAt: at(0, 7, 2) },
    { fromName: "Al Rai Packaging", fromEmail: "sales@alrai-pack.example.com", subject: "Quotation for 200 amber jars", body: "Dear Noor Studio, please find our quote: 200 amber jars 250ml at 0.420 KWD each, delivery in 5 working days. Valid until Thursday.", receivedAt: at(-1, 15, 40) },
    { fromName: "Fahad Al-Kandari", fromEmail: "fahad.k@example.com", subject: "Lobby scent tasting", body: "Looking forward to the tasting tomorrow at 10. Could you bring 3 options that are fresh rather than heavy oud? Our GM will join.", receivedAt: at(-1, 11, 5) },
    { fromName: "Talabat Mart Partners", fromEmail: "partners@talabat.example.com", subject: "Your listing needs photos", body: "To activate your store, please upload at least 6 product photos with white backgrounds.", receivedAt: at(-2, 9, 30), unread: false },
    { fromName: "سارة المطيري", fromEmail: "sara@example.com", subject: "عرض البوب أب في الأفنيوز", body: "مرحباً، هل يمكن إرسال عرض السعر لجناح البوب أب قبل يوم الخميس؟ نحتاج أيضاً تفاصيل الديكور.", receivedAt: at(0, 9, 48) },
  ]);

  // ─── Memories ─────────────────────────────────────────────────────────────
  const memories: { content: string; kind: string; pinned?: boolean }[] = [
    { content: "The owner runs Noor Studio, a Kuwait-based brand of handmade candles and home fragrance.", kind: "business", pinned: true },
    { content: "The owner prefers short, direct answers and a morning brief at 7am.", kind: "preference", pinned: true },
    { content: "Ahmed Al-Sabah is the HR manager at Gulf Bank and our biggest corporate gifting prospect.", kind: "person" },
    { content: "Fatima is the operations lead who manages packing and couriers.", kind: "person" },
    { content: "Best-selling scents are Oud & Saffron, White Musk and Rose Garden.", kind: "business" },
    { content: "Retail candle price is 12 KWD; wholesale is 7.5 KWD for orders above 50 units.", kind: "business" },
    { content: "The owner speaks Arabic and English and often mixes both.", kind: "preference" },
    { content: "Main supplier for jars and boxes is Al Rai Packaging.", kind: "business" },
    { content: "Goal for this quarter: close 3 corporate gifting accounts.", kind: "business" },
  ];
  const vecs = await llm().embed(memories.map((m) => m.content));
  await db.insert(schema.memories).values(memories.map((m, i) => ({ ...m, source: "seed", pinned: m.pinned ?? false, embedding: vecs[i] })));
  await db
    .insert(schema.settings)
    .values({ key: "embedding_provider", value: llm().isReal ? "openai" : "local" })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: llm().isReal ? "openai" : "local" } });

  // ─── A sample conversation + activity ─────────────────────────────────────
  const [conv] = await db.insert(schema.conversations).values({ title: "Spending check", channel: "web" }).returning();
  await db.insert(schema.messages).values([
    { conversationId: conv.id, role: "user", content: "How much did we spend on marketing last month?", lang: "en", agentId: "chief" },
    { conversationId: conv.id, role: "assistant", content: "Last month marketing cost about 290 KWD — mostly Instagram and Snapchat ads. That's up ~8% month-on-month, in line with sales growth.", lang: "en", agentId: "chief", meta: { delegations: ["finance"] } },
  ]);
  const [conv2] = await db.insert(schema.conversations).values({ title: "مهام اليوم", channel: "telegram" }).returning();
  await db.insert(schema.messages).values([
    { conversationId: conv2.id, role: "user", content: "شو عندي مهام عاجلة اليوم؟", lang: "ar", agentId: "chief" },
    { conversationId: conv2.id, role: "assistant", content: "عندك مهمتان عاجلتان: الاتصال بأحمد بخصوص طلب هدايا الشركات الساعة 11، وإصلاح مشكلة دفع كي نت في المتجر.", lang: "ar", agentId: "chief" },
  ]);

  await db.insert(schema.activityLog).values([
    { action: "add_task", agentId: "operations", summary: "Add task “Call Ahmed about the corporate gifting order”", createdAt: at(-1, 18, 5) },
    { action: "delegate", agentId: "finance", summary: "Chief of Staff → finance: marketing spend last month", createdAt: at(-1, 18, 2) },
    { action: "memory.auto_save", agentId: "memory", summary: "Remembered: Fatima is the operations lead who manages packing and couriers.", createdAt: at(-2, 12, 30) },
    { action: "gmail_send", agentId: "sales", summary: "Cancelled: Send email to sara@example.com", status: "cancelled", actor: "user", createdAt: at(-2, 10, 1) },
    { action: "brief.sent", agentId: "chief", actor: "system", summary: "Morning brief delivered", createdAt: at(-1, 7) },
  ]);

  console.log("✓ Seed complete");
}

// Run directly: `npm run db:seed`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed()
    .then(() => pool.end())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
