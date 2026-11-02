/** Weekly owner report — data shape and bilingual text (pure; unit-tested). Every number comes from the database. */
export type WeeklyData = {
  from: string; to: string;
  conversations: number; byChannel: Record<string, number>;
  aiHandled: number; escalated: number;
  orders: number; revenue: number; currency: string;
  appointments: number; newCustomers: number; leads: number;
  ratingsUp: number; ratingsDown: number;
};

/** Minutes a person would have spent on one conversation the AI handled alone (stated as an estimate). */
export const MINUTES_PER_CONVERSATION = 4;

export const hoursSaved = (d: WeeklyData) => Math.round((d.aiHandled * MINUTES_PER_CONVERSATION) / 6) / 10;
export const satisfaction = (d: WeeklyData) => (d.ratingsUp + d.ratingsDown ? Math.round((d.ratingsUp / (d.ratingsUp + d.ratingsDown)) * 100) : null);

const money = (v: number, c: string) => `${v.toFixed(c === "KWD" || c === "BHD" || c === "OMR" ? 3 : 2)} ${c}`;

export function formatWeeklyReport(d: WeeklyData, org: string, url: string): { subject: string; text: string } {
  const sat = satisfaction(d);
  const ch = (k: string) => d.byChannel[k] ?? 0;
  const subject = `SAUT AI · ${org} — تقريرك الأسبوعي / Your weekly report`;
  const ar = [
    `تقرير ${org} الأسبوعي (${d.from} ← ${d.to})`,
    ``,
    `• المحادثات: ${d.conversations} (واتساب ${ch("whatsapp")} · مكالمات ${ch("phone")} · الموقع ${ch("web_chat")})`,
    `• تولّاها الموظف الذكي بالكامل: ${d.aiHandled} · حُوّلت لموظف: ${d.escalated}`,
    `• الطلبات: ${d.orders} بقيمة ${money(d.revenue, d.currency)}`,
    `• المواعيد الجديدة: ${d.appointments}`,
    `• عملاء جدد: ${d.newCustomers} · فرص بيع: ${d.leads}`,
    sat === null ? `• رضا العملاء: لا توجد تقييمات هذا الأسبوع` : `• رضا العملاء: ${sat}% (👍 ${d.ratingsUp} · 👎 ${d.ratingsDown})`,
    `• وقت موفَّر تقديرياً: ${hoursSaved(d)} ساعة (${MINUTES_PER_CONVERSATION} دقائق لكل محادثة)`,
  ];
  const en = [
    `${org} weekly report (${d.from} → ${d.to})`,
    ``,
    `• Conversations: ${d.conversations} (WhatsApp ${ch("whatsapp")} · calls ${ch("phone")} · website ${ch("web_chat")})`,
    `• Fully handled by the AI: ${d.aiHandled} · handed to staff: ${d.escalated}`,
    `• Orders: ${d.orders} worth ${money(d.revenue, d.currency)}`,
    `• New appointments: ${d.appointments}`,
    `• New customers: ${d.newCustomers} · leads: ${d.leads}`,
    sat === null ? `• Customer satisfaction: no ratings this week` : `• Customer satisfaction: ${sat}% (👍 ${d.ratingsUp} · 👎 ${d.ratingsDown})`,
    `• Estimated time saved: ${hoursSaved(d)} h (${MINUTES_PER_CONVERSATION} min per conversation)`,
  ];
  return { subject, text: [...ar, ``, `────────`, ``, ...en, ``, url, ``, `Turn these emails off in Settings → Your profile.`].join("\n") };
}
