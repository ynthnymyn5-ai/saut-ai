/**
 * DEMO DATA — fictional businesses and people for presentations only.
 * Everything rendered from this file is badged "Demo data" in the UI and is never
 * written to the production database. Phone numbers use reserved/fake ranges.
 */
export const DEMO_USER = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "demo@saut.ai",
  fullName: "Demo Owner",
  platformRole: "admin" as const, // lets presenters open the admin panel in demo mode
};

export const DEMO_ORG = { id: "00000000-0000-4000-8000-0000000000aa", name: "Layali Café (Demo)", currency: "KWD" };

// Deterministic pseudo-random so server and client render identically
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export const demoDaily = (() => {
  const r = seeded(7);
  const out: { day: string; calls: number; answered: number; chats: number }[] = [];
  const base = new Date("2026-10-01T00:00:00+03:00");
  for (let i = 0; i < 30; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const weekend = d.getDay() === 5 || d.getDay() === 6;
    const calls = Math.round(60 + r() * 50 + (weekend ? 35 : 0) + i * 1.4);
    const answered = Math.round(calls * (0.9 + r() * 0.08));
    out.push({ day: d.toISOString().slice(5, 10), calls, answered, chats: Math.round(calls * (1.3 + r() * 0.5)) });
  }
  return out;
})();

export const demoMonthly = [
  { month: "May", calls: 1210, chats: 1640 },
  { month: "Jun", calls: 1480, chats: 2010 },
  { month: "Jul", calls: 1620, chats: 2390 },
  { month: "Aug", calls: 1890, chats: 2710 },
  { month: "Sep", calls: 2240, chats: 3150 },
  { month: "Oct", calls: 2685, chats: 3820 },
];

export const demoStats = (() => {
  const total = demoDaily.reduce((a, d) => a + d.calls, 0);
  const answered = demoDaily.reduce((a, d) => a + d.answered, 0);
  const chats = demoDaily.reduce((a, d) => a + d.chats, 0);
  return {
    totalCalls: total,
    answered,
    missed: total - answered,
    aiConversations: chats,
    appointments: 412,
    hoursSaved: Math.round((answered * 3.2 + chats * 1.5) / 60),
  };
})();

export type DemoEmployee = {
  id: string;
  name: string;
  industry: string;
  dialect: string;
  voice: string;
  status: "active" | "paused" | "draft";
  callsToday: number;
  satisfaction: number;
  hue: number;
};

export const demoEmployees: DemoEmployee[] = [
  { id: "e1", name: "Noura", industry: "restaurant", dialect: "kuwaiti", voice: "coral", status: "active", callsToday: 84, satisfaction: 96, hue: 265 },
  { id: "e2", name: "Fahad", industry: "customer_support", dialect: "saudi", voice: "ash", status: "active", callsToday: 51, satisfaction: 93, hue: 200 },
  { id: "e3", name: "Mira", industry: "clinic", dialect: "english", voice: "shimmer", status: "paused", callsToday: 0, satisfaction: 91, hue: 300 },
];

export const demoCustomers = [
  { id: "c1", name: "Abdullah Al-Mutairi", phone: "+965 5000 0101", tags: ["VIP", "Regular"], lastContact: "2026-10-30T13:12:00+03:00", conversations: 14, appointments: 6, notes: "Prefers window table. Allergic to nuts." },
  { id: "c2", name: "Sara Al-Kandari", phone: "+965 5000 0102", tags: ["New"], lastContact: "2026-10-30T11:40:00+03:00", conversations: 2, appointments: 1, notes: "" },
  { id: "c3", name: "Khalid Al-Otaibi", phone: "+966 50 000 0103", tags: ["Corporate"], lastContact: "2026-10-29T19:05:00+03:00", conversations: 7, appointments: 3, notes: "Books for office events of 12+." },
  { id: "c4", name: "Maryam Al-Hashemi", phone: "+971 50 000 0104", tags: ["Regular"], lastContact: "2026-10-29T16:22:00+03:00", conversations: 9, appointments: 4, notes: "" },
  { id: "c5", name: "James Carter", phone: "+965 5000 0105", tags: ["English"], lastContact: "2026-10-28T20:47:00+03:00", conversations: 3, appointments: 2, notes: "Expat, prefers English." },
  { id: "c6", name: "Hessa Al-Sabah", phone: "+965 5000 0106", tags: ["VIP"], lastContact: "2026-10-27T12:15:00+03:00", conversations: 21, appointments: 11, notes: "Birthday 12 Nov." },
];

export const demoConversations = [
  { id: "v1", customer: "Abdullah Al-Mutairi", employee: "Noura", channel: "phone", status: "completed", at: "2026-10-30T13:12:00+03:00", summary: "Booked a table for 4 on Friday 8:30 PM, window seat.", sentiment: "positive", duration: 142 },
  { id: "v2", customer: "Sara Al-Kandari", employee: "Noura", channel: "whatsapp", status: "completed", at: "2026-10-30T11:40:00+03:00", summary: "Asked about vegan options and parking. Answered from menu FAQ.", sentiment: "positive", duration: 0 },
  { id: "v3", customer: "Khalid Al-Otaibi", employee: "Fahad", channel: "phone", status: "transferred", at: "2026-10-29T19:05:00+03:00", summary: "Requested custom catering quote for 40 guests — transferred to manager.", sentiment: "neutral", duration: 211 },
  { id: "v4", customer: "Maryam Al-Hashemi", employee: "Noura", channel: "phone", status: "completed", at: "2026-10-29T16:22:00+03:00", summary: "Changed reservation from Thursday to Saturday.", sentiment: "positive", duration: 96 },
  { id: "v5", customer: "James Carter", employee: "Fahad", channel: "web_chat", status: "completed", at: "2026-10-28T20:47:00+03:00", summary: "Delivery area question; confirmed Salmiya is covered.", sentiment: "neutral", duration: 0 },
];

export const demoTranscript = [
  { role: "customer", text: "السلام عليكم، أبي أحجز طاولة يوم الجمعة" },
  { role: "ai", text: "وعليكم السلام هلا والله! أكيد، كم شخص وأي ساعة تناسبك؟" },
  { role: "customer", text: "أربعة أشخاص، الساعة ثمان ونص" },
  { role: "ai", text: "تمام، عندي طاولة لأربعة الجمعة الساعة ٨:٣٠ عند الشباك. أأكد الحجز باسم عبدالله؟" },
  { role: "customer", text: "إي نعم، مشكورة" },
  { role: "ai", text: "تم الحجز ✅ راح توصلك رسالة تأكيد. نتشرف فيك!" },
];

export const demoCalls = demoConversations
  .filter((c) => c.channel === "phone")
  .concat([
    { id: "v6", customer: "Unknown caller", employee: "Noura", channel: "phone", status: "missed", at: "2026-10-28T23:58:00+03:00", summary: "After hours — voicemail offered.", sentiment: "neutral", duration: 0 },
  ]);

export const demoPayments = [
  { id: "p1", date: "2026-10-01", amount: 49, currency: "KWD", status: "succeeded", method: "KNET", provider: "myfatoorah" },
  { id: "p2", date: "2026-09-01", amount: 49, currency: "KWD", status: "succeeded", method: "KNET", provider: "myfatoorah" },
  { id: "p3", date: "2026-08-01", amount: 19, currency: "KWD", status: "succeeded", method: "Visa •• 4242", provider: "stripe" },
];

export const demoUsage = { voiceMinutes: 812, voiceLimit: 1200, conversations: 3820, conversationLimit: 5000, employees: 3, employeeLimit: 3 };

export const demoAdminOrgs = [
  { id: "o1", name: "Layali Café", country: "KW", plan: "business", status: "active", users: 4, mrr: 49, created: "2026-05-02" },
  { id: "o2", name: "Al Noor Dental Clinic", country: "KW", plan: "pro", status: "active", users: 9, mrr: 99, created: "2026-06-11" },
  { id: "o3", name: "Riyadh Homes Realty", country: "SA", plan: "business", status: "trialing", users: 3, mrr: 0, created: "2026-10-21" },
  { id: "o4", name: "Glow Beauty Lounge", country: "AE", plan: "starter", status: "past_due", users: 2, mrr: 19, created: "2026-07-30" },
  { id: "o5", name: "Gulf Gadgets Store", country: "KW", plan: "starter", status: "suspended", users: 1, mrr: 0, created: "2026-08-14" },
];

export const demoTickets = [
  { id: "t1", org: "Layali Café", subject: "WhatsApp template approval pending", status: "open", priority: "high", at: "2026-10-30T09:10:00+03:00" },
  { id: "t2", org: "Al Noor Dental Clinic", subject: "Add second phone number for Hawally branch", status: "in_progress", priority: "normal", at: "2026-10-29T14:30:00+03:00" },
  { id: "t3", org: "Glow Beauty Lounge", subject: "Card declined on renewal", status: "waiting", priority: "urgent", at: "2026-10-28T10:02:00+03:00" },
];

export const demoCoupons = [
  { code: "LAUNCH30", off: "30%", redeemed: 41, max: 100, expires: "2026-12-31", active: true },
  { code: "RAMADAN", off: "5 KWD", redeemed: 0, max: 500, expires: "2027-03-30", active: false },
];
