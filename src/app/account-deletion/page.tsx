import { LegalPage, type LegalSection } from "@/components/brand/LegalPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata = { title: "Delete your account" };

/** Public page for app-store "account deletion" requirements. */
const S: LegalSection[] = [
  { en: ["Delete your account in the app", "1. Sign in to SAUT AI (app or web).\n2. Open Settings → “Delete my account”.\n3. Review what will be deleted, type DELETE and confirm.\nYour login is removed immediately. Businesses where you are the only member are deleted with all their data (customers, conversations, orders, appointments, knowledge base, files)."],
    ar: ["احذف حسابك من التطبيق", "١. سجّل الدخول إلى SAUT AI (التطبيق أو الموقع).\n٢. افتح الإعدادات ← «حذف حسابي».\n٣. راجع ما سيُحذف، واكتب DELETE ثم أكّد.\nيُحذف حساب الدخول فوراً. والأنشطة التي أنت عضوها الوحيد تُحذف مع كل بياناتها (العملاء والمحادثات والطلبات والمواعيد وقاعدة المعرفة والملفات)."] },
  { en: ["Before you can delete", "• If you are the only owner of a business that has other members, make another member an owner first.\n• If the business has a running paid subscription, cancel it in Billing first so nobody is charged for a deleted business."],
    ar: ["قبل الحذف", "• إذا كنت المالك الوحيد لنشاط فيه أعضاء آخرون، اجعل عضواً آخر مالكاً أولاً.\n• إذا كان للنشاط اشتراك مدفوع قائم، ألغِه من صفحة الفوترة أولاً حتى لا يُحاسب أحد على نشاط محذوف."] },
  { en: ["What is kept", "• In businesses that continue (you were one of several members), the records you created stay with that business, without your name.\n• A minimal audit entry that an account was deleted (no personal details), and payment records that the law requires the payment provider to keep."],
    ar: ["ما الذي يبقى", "• في الأنشطة المستمرة (إذا كنت أحد عدة أعضاء) تبقى السجلات التي أنشأتها لدى النشاط بدون اسمك.\n• سجل تدقيق بسيط بأن حساباً حُذف (بدون بيانات شخصية)، وسجلات الدفع التي يُلزم القانون مزوّد الدفع بالاحتفاظ بها."] },
  { en: ["Can't sign in?", `Email ${CONTACT_EMAIL} from the address on your account with the subject “Delete my account”. We verify ownership and complete the deletion within 30 days.`],
    ar: ["لا تستطيع تسجيل الدخول؟", `راسل ${CONTACT_EMAIL} من البريد المسجّل في حسابك بعنوان «حذف حسابي». نتحقق من الملكية ونكمل الحذف خلال ٣٠ يوماً.`] },
];

export default function AccountDeletion() {
  return <LegalPage titleEn="Delete your account" titleAr="حذف الحساب" updated="1 November 2026" sections={S} />;
}
