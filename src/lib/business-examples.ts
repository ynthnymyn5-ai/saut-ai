/**
 * Starter text for the wizard's business-info step. Clearly an EXAMPLE the owner edits —
 * every placeholder is in [brackets] so nothing invented reaches customers by accident.
 */
type Info = { description: string; hours: string; faqs: string };
const AR: Record<string, Info> = {
  restaurant: {
    description: "[اسم المقهى] مقهى مختص في [المنطقة]، نقدّم القهوة المختصة والمشروبات الباردة والحلويات اليومية، مع جلسات داخلية وخارجية.",
    hours: "يومياً من [٧ صباحاً] إلى [١٢ منتصف الليل]، والجمعة من [١ ظهراً].",
    faqs: "س: هل يوجد حجز طاولات؟\nج: نعم، نحجز للمجموعات من [٤] أشخاص فأكثر.\n\nس: هل عندكم توصيل؟\nج: [نعم عبر طلبات وديليفرو / لا يوجد توصيل حالياً].\n\nس: كم سعر اللاتيه؟\nج: [١.٥٠٠ د.ك].\n\nس: هل يوجد مواقف؟\nج: [نعم، مواقف مجانية أمام المقهى].\n\nس: هل عندكم خيارات بدون سكر أو حليب نباتي؟\nج: [نعم: حليب الشوفان واللوز].",
  },
  clinic: {
    description: "[اسم العيادة] في [المنطقة]، نقدّم [التخصصات] بإشراف أطباء معتمدين.",
    hours: "من السبت إلى الخميس [٩ صباحاً – ٩ مساءً].",
    faqs: "س: كيف أحجز موعد؟\nج: نحجز لك الآن، نحتاج الاسم ورقم الهاتف والوقت المناسب.\n\nس: هل تقبلون التأمين؟\nج: [نعم: أسماء شركات التأمين].\n\nس: كم سعر الكشفية؟\nج: [١٥ د.ك].",
  },
  beauty_salon: {
    description: "[اسم الصالون] في [المنطقة]، خدمات الشعر والأظافر والعناية بالبشرة.",
    hours: "يومياً [١٠ صباحاً – ١٠ مساءً].",
    faqs: "س: كيف أحجز؟\nج: أحجز لك الآن، شنو الخدمة والوقت المناسب؟\n\nس: كم سعر [الخدمة]؟\nج: [السعر].",
  },
  other: {
    description: "[اسم النشاط] في [المنطقة]، نقدّم [الخدمات أو المنتجات].",
    hours: "[أيام وأوقات الدوام].",
    faqs: "س: [سؤال يتكرر من العملاء]؟\nج: [الإجابة].",
  },
};
const EN: Record<string, Info> = {
  restaurant: {
    description: "[Café name] is a specialty coffee shop in [area] serving espresso drinks, cold brews and fresh desserts, with indoor and outdoor seating.",
    hours: "Daily [7 AM – 12 AM]; Fridays from [1 PM].",
    faqs: "Q: Do you take table reservations?\nA: Yes, for groups of [4] or more.\n\nQ: Do you deliver?\nA: [Yes via Talabat and Deliveroo / Not at the moment].\n\nQ: How much is a latte?\nA: [1.500 KWD].\n\nQ: Is there parking?\nA: [Yes, free parking in front].",
  },
  clinic: { description: "[Clinic name] in [area], offering [specialties].", hours: "Sat–Thu [9 AM – 9 PM].", faqs: "Q: How do I book?\nA: I can book you now — I need your name, phone and preferred time.\n\nQ: Do you accept insurance?\nA: [Yes: insurers]." },
  beauty_salon: { description: "[Salon name] in [area] — hair, nails and skincare.", hours: "Daily [10 AM – 10 PM].", faqs: "Q: How do I book?\nA: I can book now — which service and what time?" },
  other: { description: "[Business name] in [area], offering [services].", hours: "[Opening days and hours].", faqs: "Q: [Common question]?\nA: [Answer]." },
};

export function businessExample(industry: string, locale: "ar" | "en"): Info {
  const set = locale === "ar" ? AR : EN;
  return set[industry] ?? set.other;
}

/** Fills only the fields the owner left empty. */
export function fillEmpty<T extends Record<string, string>>(current: T, example: Partial<T>): T {
  const out = { ...current };
  for (const k of Object.keys(example) as (keyof T)[]) if (!String(out[k] ?? "").trim() && example[k]) out[k] = example[k] as T[keyof T];
  return out;
}
