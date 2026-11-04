/** Owner-facing alert sent to the platform owner when a new business finishes sign-up. */
export type NewSignup = {
  businessName: string; ownerName?: string | null; ownerEmail?: string | null;
  contactEmail?: string | null; contactPhone?: string | null;
  country: string; industry: string; language: string; organizationId: string;
};

export function newSignupEmail(s: NewSignup, appUrl: string) {
  const subject = `🎉 تسجيل جديد في SAUT AI: ${s.businessName}`.slice(0, 200);
  const lines = [
    "نشاط جديد سجّل في SAUT AI وبدأ الفترة التجريبية.",
    "",
    `اسم النشاط: ${s.businessName}`,
    `صاحب الحساب: ${s.ownerName || "—"}`,
    `إيميل الحساب: ${s.ownerEmail || "—"}`,
    `إيميل التواصل: ${s.contactEmail || "—"}`,
    `رقم التواصل: ${s.contactPhone || "—"}`,
    `الدولة: ${s.country} · القطاع: ${s.industry} · اللغة: ${s.language}`,
    "",
    `لوحة الأدمن: ${appUrl.replace(/\/$/, "")}/admin`,
  ];
  return { subject, text: lines.join("\n") };
}
