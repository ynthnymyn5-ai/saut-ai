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

export function startScheduler() {
  const tick = () => {
    runReminders().catch((e) => console.error("[scheduler] reminders", e));
    runMorningBrief().catch((e) => console.error("[scheduler] brief", e));
  };
  setTimeout(tick, 5000);
  return setInterval(tick, 60_000);
}
