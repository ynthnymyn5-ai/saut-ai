type L = [string, string];
export const TRIGGER_LABELS: Record<string, L> = {
  call_received: ["New customer call", "مكالمة جديدة من عميل"],
  missed_call: ["Missed call", "مكالمة فائتة"],
  whatsapp_message: ["New WhatsApp message", "رسالة واتساب جديدة"],
  lead_created: ["New lead", "عميل محتمل جديد"],
  appointment_created: ["Appointment created", "تم إنشاء موعد"],
  appointment_canceled: ["Appointment cancelled", "تم إلغاء موعد"],
  complaint: ["Customer complaint", "شكوى عميل"],
  payment_confirmed: ["Payment confirmation", "تأكيد دفع"],
  ticket_created: ["New support case", "حالة دعم جديدة"],
};
export const CONDITION_LABELS: Record<string, L> = {
  intent_is: ["Customer wants…", "العميل يريد…"],
  channel_is: ["Channel is", "القناة هي"],
  customer_is_new: ["New customer", "عميل جديد"],
  has_tag: ["Customer has tag", "العميل لديه وسم"],
  within_hours: ["Within opening hours", "ضمن أوقات العمل"],
  text_contains: ["Message mentions", "الرسالة تذكر"],
  lead_score_at_least: ["Lead score at least", "تقييم العميل لا يقل عن"],
};
export const ACTION_LABELS: Record<string, L> = {
  identify_customer: ["Identify customer", "التعرّف على العميل"],
  check_availability: ["Check availability", "التحقق من التوفر"],
  book_appointment: ["Confirm the appointment", "تأكيد الموعد"],
  save_customer: ["Save customer information", "حفظ بيانات العميل"],
  send_whatsapp: ["Send WhatsApp (if connected)", "إرسال واتساب (عند الربط)"],
  notify_owner: ["Notify the business owner", "تنبيه صاحب النشاط"],
  create_lead: ["Create lead", "إنشاء عميل محتمل"],
  create_task: ["Create follow-up task", "إنشاء مهمة متابعة"],
  tag_customer: ["Tag customer", "وسم العميل"],
  escalate_to_human: ["Hand off to a person", "تحويل لموظف"],
  update_lead_stage: ["Move lead stage", "نقل مرحلة العميل"],
};
export const INTENTS: L[] = [
  ["booking", "حجز"], ["reschedule", "تغيير موعد"], ["cancel", "إلغاء"], ["purchase_interest", "اهتمام بالشراء"], ["pricing", "أسعار"],
  ["complaint", "شكوى"], ["support", "دعم"], ["faq", "استفسار"], ["human_request", "طلب موظف"], ["medical", "سؤال طبي"],
];
