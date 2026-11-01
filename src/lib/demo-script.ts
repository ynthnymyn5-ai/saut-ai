/**
 * Scripted replies for the SIMULATED demo (landing page, and dashboard tester when no
 * AI provider is configured). The UI always labels these as simulated.
 */
export type ScriptReply = { text: string; transfer?: boolean };

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

export function scriptedReply(input: string, businessName = "Layali Café"): ScriptReply {
  const ar = isArabic(input);
  const q = input.toLowerCase();
  if (/(manager|human|person|مدير|موظف|شخص|أكلم)/i.test(q))
    return { transfer: true, text: ar ? "أكيد، لحظة وحدة أحوّلك لمدير الفرع مع ملخص طلبك." : "Of course — I'm transferring you to the branch manager with a summary of your request." };
  if (/(book|table|reserv|appointment|أحجز|حجز|طاولة|موعد)/i.test(q))
    return { text: ar ? "هلا والله! عندي طاولة لأربعة يوم الجمعة الساعة ٨:٣٠ عند الشباك. أأكد الحجز؟" : "Wonderful! I have a table for four this Friday at 8:30 PM by the window. Shall I confirm it?" };
  if (/(hour|open|close|time|دوام|تفتح|تسكر|أوقات|الساعة)/i.test(q))
    return { text: ar ? `${businessName} مفتوح يومياً من ٨ الصبح إلى ١٢ الليل، والجمعة من ١ الظهر.` : `${businessName} is open daily 8 AM – midnight, and from 1 PM on Fridays.` };
  if (/(yes|confirm|sure|ok|إي|نعم|أكد|تمام|اوكي)/i.test(q))
    return { text: ar ? "تم ✅ الحجز مؤكد. (عرض تجريبي — لم يُرسل أي رسالة حقيقية)" : "Done ✅ Your booking is confirmed. (Simulated — no real message was sent.)" };
  if (/(price|menu|cost|سعر|منيو|كم)/i.test(q))
    return { text: ar ? "القهوة المختصة تبدأ من ١.٥ د.ك، والفطور من ٣.٧٥٠ د.ك. تبي أرسل لك المنيو؟" : "Specialty coffee starts at 1.5 KWD and breakfast from 3.750 KWD. Want me to send you the menu?" };
  return { text: ar ? "أكيد! أقدر أساعدك بالحجوزات، أوقات الدوام، أو المنيو. شنو تحتاج؟" : "Happy to help! I can handle bookings, opening hours or our menu. What do you need?" };
}
