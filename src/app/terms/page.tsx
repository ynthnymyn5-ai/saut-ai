import { LegalPage, type LegalSection } from "@/components/brand/LegalPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Terms of Service" };

const S: LegalSection[] = [
  { en: ["The service", "SAUT AI lets a business create AI employees that talk to its customers by phone, WhatsApp and web chat, and tools for staff to manage conversations, customers, appointments and orders. Channels work only after the business connects its own accounts (for example a Twilio number or a Meta WhatsApp Business account); until then they are shown as not connected."],
    ar: ["الخدمة", "تتيح SAUT AI للنشاط إنشاء موظفين أذكياء يتحدثون مع عملائه عبر الهاتف وواتساب ودردشة الموقع، وأدوات للموظفين لإدارة المحادثات والعملاء والمواعيد والطلبات. تعمل القنوات فقط بعد أن يربط النشاط حساباته (مثل رقم Twilio أو حساب واتساب للأعمال من Meta)؛ وحتى ذلك الحين تظهر كغير مربوطة."] },
  { en: ["AI limitations — your responsibility", "AI replies are automatic and may be inaccurate. You are responsible for the information you give the AI (instructions, knowledge base, prices), for reviewing orders and bookings it creates, for telling your customers they are speaking with an AI, and for any consent required to record calls or message customers. Orders taken by the AI are created as pending until your staff confirm them."],
    ar: ["حدود الذكاء الاصطناعي — مسؤوليتك", "ردود الذكاء الاصطناعي آلية وقد تكون غير دقيقة. أنت مسؤول عن المعلومات التي تزوّد بها الموظف الذكي (التعليمات وقاعدة المعرفة والأسعار)، وعن مراجعة الطلبات والحجوزات التي ينشئها، وعن إبلاغ عملائك بأنهم يتحدثون مع ذكاء اصطناعي، وعن أي موافقة لازمة لتسجيل المكالمات أو مراسلة العملاء. الطلبات التي يأخذها الموظف الذكي تُنشأ بحالة «بانتظار التأكيد» حتى يؤكدها موظفوك."] },
  { en: ["Acceptable use", "Do not use the service for spam, unsolicited marketing without consent, deception, harassment, illegal goods or services, or to impersonate others. WhatsApp use must follow Meta's Business and Commerce policies; phone use must follow your telephony provider's rules."],
    ar: ["الاستخدام المقبول", "لا تستخدم الخدمة للرسائل المزعجة أو التسويق دون موافقة أو الخداع أو المضايقة أو السلع والخدمات غير القانونية أو انتحال الشخصية. يجب أن يلتزم استخدام واتساب بسياسات Meta للأعمال والتجارة، واستخدام الهاتف بقواعد مزوّد الاتصالات."] },
  { en: ["Plans, billing and cancellation", "Prices are in Kuwaiti Dinar (KWD) unless stated otherwise. Subscriptions renew automatically each period until cancelled; cancellation takes effect at the end of the paid period. Paid features are enabled only after the payment provider confirms payment. If a renewal payment fails, the subscription becomes past due and, after a grace period, is cancelled. Usage beyond plan allowances may be limited."],
    ar: ["الباقات والفوترة والإلغاء", "الأسعار بالدينار الكويتي ما لم يُذكر غير ذلك. تتجدد الاشتراكات تلقائياً كل فترة حتى إلغائها؛ ويسري الإلغاء في نهاية الفترة المدفوعة. تُفعّل المزايا المدفوعة فقط بعد تأكيد مزوّد الدفع للدفعة. إذا فشل دفع التجديد يصبح الاشتراك متأخراً ثم يُلغى بعد فترة سماح. قد يُقيّد الاستخدام الذي يتجاوز حدود الباقة."] },
  { en: ["Your data", "You own your business data and your customers' data. We process it only to provide the service, as described in the Privacy Policy. You can export customers and delete customer data at any time."],
    ar: ["بياناتك", "أنت تملك بيانات نشاطك وبيانات عملائك. نعالجها فقط لتقديم الخدمة كما هو موضح في سياسة الخصوصية. يمكنك تصدير العملاء وحذف بيانات أي عميل في أي وقت."] },
  { en: ["Availability and liability", "We work to keep the service available but do not guarantee it will be uninterrupted; third-party providers (AI, telephony, WhatsApp, payments) can fail. To the extent permitted by law, our liability is limited to the fees you paid in the three months before the claim."],
    ar: ["التوفر والمسؤولية", "نعمل على إبقاء الخدمة متاحة لكن لا نضمن عدم انقطاعها؛ وقد تتعطل خدمات المزوّدين الخارجيين (الذكاء الاصطناعي والاتصالات وواتساب والمدفوعات). وفي حدود ما يسمح به القانون تقتصر مسؤوليتنا على الرسوم التي دفعتها خلال الأشهر الثلاثة السابقة للمطالبة."] },
  { en: ["Changes and contact", `We will notify account owners of material changes to these terms. Questions: ${CONTACT_EMAIL}.`],
    ar: ["التعديلات والتواصل", `سنبلغ أصحاب الحسابات بأي تغييرات جوهرية على هذه الشروط. للاستفسار: ${CONTACT_EMAIL}.`] },
];

export default function Terms() {
  return <LegalPage titleEn="Terms of Service" titleAr="الشروط والأحكام" updated="1 November 2026" sections={S} />;
}
