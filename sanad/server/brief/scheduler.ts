/**
 * Background jobs (checked every minute):
 *   - due reminders → push notification + Telegram
 *   - the morning brief at BRIEF_HOUR (owner timezone) → push + Telegram
 * Replit "Reserved VM"/always-on deployments keep this running; on autoscale
 * deployments, hit POST /api/brief/generate from an external cron instead.
 */
import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { dateKey, zonedParts } from "../lib/time";
import { notifyAll } from "../push/webpush";
import { telegramSend } from "../integrations/messaging";
import { generateBrief } from "./dailyBrief";
import { logActivity } from "../lib/activity";
import { generateWeeklyReport, runAutoFollowUps } from "../tools/business";

async function getSetting<T>(key: string): Promise<T | undefined> {
  const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return r?.value as T | undefined;
}
async function setSetting(key: string, value: unknown) {
  await db.insert(schema.settings).values({ key, value: value as object }).onConflictDoUpdate({ target: schema.settings.key, set: { value: value as object, updatedAt: new Date() } });
}

export async function runReminders() {
  const due = await db.select().from(schema.reminders).where(and(eq(schema.reminders.sent, false), lte(schema.reminders.remindAt, new Date())));
  for (const r of due) {
    await db.update(schema.reminders).set({ sent: true }).where(eq(schema.reminders.id, r.id));
    const n = await notifyAll({ title: "⏰ Sanad reminder", body: r.text, url: "/agents/operations", tag: `reminder-${r.id}` });
    const tg = await telegramSend(`⏰ ${r.text}`).catch(() => false);
    await logActivity({ action: "reminder.sent", agentId: "operations", actor: "system", summary: `Reminder: ${r.text} (${n} device(s)${tg ? " + Telegram" : ""})` });
  }
}

export async function runMorningBrief(force = false) {
  const p = zonedParts();
  const today = dateKey();
  if (!force && (p.hour !== env.BRIEF_HOUR || (await getSetting<string>("brief_sent_on")) === today)) return;
  await setSetting("brief_sent_on", today);
  const lang = ((await getSetting<string>("preferred_lang")) as "en" | "ar" | undefined) ?? "en";
  const brief = await generateBrief(lang, true);
  await notifyAll({ title: lang === "ar" ? "☀️ موجزك اليومي" : "☀️ Your daily brief", body: brief.text.slice(0, 180), url: "/agents/chief", tag: "brief" });
  await telegramSend(brief.text).catch(() => false);
  await logActivity({ action: "brief.sent", agentId: "chief", actor: "system", summary: `Morning brief delivered for ${today}` });
}

/** Sunday morning (start of the Gulf work week): weekly report to push + Telegram. */
export async function runWeeklyReport(force = false) {
  const p = zonedParts();
  const today = dateKey();
  if (!force && (p.weekday !== 0 || p.hour !== env.BRIEF_HOUR || (await getSetting<string>("weekly_sent_on")) === today)) return;
  await setSetting("weekly_sent_on", today);
  const lang = ((await getSetting<string>("preferred_lang")) as "en" | "ar" | undefined) ?? "en";
  const r = await generateWeeklyReport(lang, true);
  await notifyAll({ title: lang === "ar" ? "📊 تقرير الأسبوع" : "📊 Your weekly report", body: r.text.slice(0, 180), url: "/agents/chief", tag: "weekly" });
  await telegramSend(r.text).catch(() => false);
  await logActivity({ action: "weekly.sent", agentId: "chief", actor: "system", summary: `Weekly report delivered for week ending ${r.data.to}` });
}

/** Daily, after the brief: draft overdue follow-ups and ask for approval. */
export async function runDailyFollowUps(force = false) {
  if (!env.AUTO_FOLLOWUPS && !force) return;
  const p = zonedParts();
  const today = dateKey();
  if (!force && (p.hour !== env.BRIEF_HOUR || (await getSetting<string>("followups_on")) === today)) return;
  await setSetting("followups_on", today);
  const lang = ((await getSetting<string>("preferred_lang")) as "en" | "ar" | undefined) ?? "en";
  const queued = await runAutoFollowUps(5, lang);
  if (!queued.length) return;
  const names = queued.map((q) => q.lead).join(", ");
  await notifyAll({ title: lang === "ar" ? "🤝 متابعات جاهزة" : "🤝 Follow-ups ready", body: lang === "ar" ? `${queued.length} رسائل متابعة بانتظار موافقتك: ${names}` : `${queued.length} follow-up email(s) waiting for your approval: ${names}`, url: "/", tag: "followups" });
  await telegramSend(lang === "ar" ? `🤝 صغت ${queued.length} رسائل متابعة (${names}). وافق عليها من التطبيق.` : `🤝 I drafted ${queued.length} follow-up email(s) (${names}). Approve them in the app.`).catch(() => false);
}

export function startScheduler() {
  const tick = () => {
    runReminders().catch((e) => console.error("[scheduler] reminders", e));
    runMorningBrief().catch((e) => console.error("[scheduler] brief", e));
    runWeeklyReport().catch((e) => console.error("[scheduler] weekly", e));
    runDailyFollowUps().catch((e) => console.error("[scheduler] follow-ups", e));
  };
  setTimeout(tick, 5000);
  return setInterval(tick, 60_000);
}
