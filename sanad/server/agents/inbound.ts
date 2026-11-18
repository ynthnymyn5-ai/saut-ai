/**
 * Messages arriving from Telegram/WhatsApp. Handles text confirmations
 * ("yes"/"نعم" approves the latest pending action from that channel) and
 * otherwise runs a normal Sanad turn in a per-channel conversation.
 */
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../db";
import { runTurn, detectLang } from "./orchestrator";
import { resolvePending } from "../tools/registry";

const YES = /^(yes|y|ok|okay|confirm|approve|go|send it|do it|نعم|اي|أي|ايوه|إيوه|تمام|موافق|أكد|اكد|ارسل|أرسل)[.!]?$/i;
const NO = /^(no|n|cancel|stop|don'?t|لا|إلغاء|الغاء|الغ|وقف)[.!]?$/i;

export async function handleInbound(channel: "telegram" | "whatsapp", text: string): Promise<string> {
  const lang = detectLang(text);
  const trimmed = text.trim();

  if (YES.test(trimmed) || NO.test(trimmed)) {
    const [pending] = await db
      .select()
      .from(schema.pendingActions)
      .where(and(eq(schema.pendingActions.channel, channel), eq(schema.pendingActions.status, "pending"), gte(schema.pendingActions.createdAt, new Date(Date.now() - 60 * 60_000))))
      .orderBy(desc(schema.pendingActions.createdAt))
      .limit(1);
    if (pending) {
      const r = await resolvePending(pending.id, YES.test(trimmed), lang);
      return r.say;
    }
  }

  // Continue the channel's conversation if it was active in the last 12h
  const [recent] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.channel, channel), gte(schema.conversations.updatedAt, new Date(Date.now() - 12 * 3600_000))))
    .orderBy(desc(schema.conversations.updatedAt))
    .limit(1);

  const res = await runTurn({ text, channel, conversationId: recent?.id });
  let reply = res.reply;
  for (const p of res.pending) {
    reply += lang === "ar" ? `\n\n⚠️ بانتظار موافقتك: ${p.summary}\nردّ بـ «نعم» للتنفيذ أو «لا» للإلغاء.` : `\n\n⚠️ Needs your approval: ${p.summary}\nReply YES to go ahead or NO to cancel.`;
  }
  return reply;
}
