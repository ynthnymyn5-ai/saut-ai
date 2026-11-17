/**
 * Bilingual UI (English / Arabic with RTL). The UI language is separate from
 * the language Sanad replies in — he always answers in the language you use.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "@shared/types";

const en = {
  appName: "Sanad",
  tagline: "Your AI Chief of Staff",
  nav: { home: "Home", dashboard: "Dashboard", history: "History", activity: "Activity", settings: "Settings" },
  orb: { idle: "Tap the mic or say “Sanad”", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" },
  chat: {
    placeholder: "Ask Sanad anything…",
    send: "Send",
    you: "You",
    newChat: "New chat",
    showThread: "Conversation",
    hideThread: "Hide",
    delegated: "Delegated to",
    did: "Done",
    offline: "Offline mode — add OPENAI_API_KEY for full intelligence",
    demo: "Live demo · sample data · runs in your browser",
    askAgent: (name: string) => `Ask the ${name} agent…`,
    suggestions: ["What are my meetings today?", "Summarize my unread emails", "How much did I spend this month?", "Add a task to call Ahmed tomorrow at 10", "Write an Instagram caption for my new product"],
  },
  voice: { pushToTalk: "Push to talk", stop: "Stop", wakeWord: "Wake word “Sanad”", autoSpeak: "Also speak typed replies", micDenied: "Microphone access was denied.", unsupported: "Voice input isn't supported in this browser." },
  confirm: { title: "Sanad needs your approval", body: "This action sends, deletes, pays or publishes something. Nothing happens until you approve.", approve: "Approve", cancel: "Cancel", details: "Details", deleteTitle: "Delete this item?", deleteBody: "This can't be undone.", delete: "Delete" },
  common: { add: "Add", save: "Save", cancel: "Cancel", edit: "Edit", delete: "Delete", search: "Search…", refresh: "Refresh", loading: "Loading…", empty: "Nothing here yet.", all: "All", due: "Due", today: "Today", close: "Close", open: "Open", copy: "Copy", copied: "Copied" },
  dashboard: { title: "Command center", subtitle: "Sanad orchestrates your specialist agents. Tap a module to open it." },
  ops: { todo: "To do", in_progress: "In progress", done: "Done", newTask: "New task", title: "Title", priority: "Priority", dueAt: "Due", project: "Project", low: "Low", medium: "Medium", high: "High", urgent: "Urgent", moveTo: "Move to" },
  sales: { pipeline: "Pipeline", name: "Name", company: "Company", stage: "Stage", value: "Value", nextStep: "Next step", followUp: "Follow-up", newLead: "New lead", overdue: "Overdue", stages: { new: "New", contacted: "Contacted", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" } },
  finance: { income: "Income", expenses: "Expenses", net: "Net", thisMonth: "This month", last6: "Last 6 months", byCategory: "Spending by category", transactions: "Transactions", invoices: "Invoices", newTx: "Log transaction", amount: "Amount", category: "Category", description: "Description", type: "Type", client: "Client", status: "Status", number: "Invoice" },
  marketing: { calendar: "Content calendar", pipeline: "Ideas & drafts", newItem: "New content", platform: "Platform", caption: "Caption", scheduledFor: "Scheduled for", statuses: { idea: "Idea", draft: "Draft", scheduled: "Scheduled", published: "Published" } },
  notes: { newNote: "New note", kind: "Type", body: "Body", sources: "Sources", pros: "Pros", cons: "Cons", palette: "Palette", tags: "Tags" },
  memory: { title: "What Sanad remembers", add: "Teach Sanad something", placeholder: "e.g. My accountant is Khalid, he prefers WhatsApp", kinds: { fact: "Fact", person: "Person", business: "Business", preference: "Preference" }, pinned: "Pinned", auto: "Learned automatically", semantic: "Semantic search" },
  chief: { brief: "Daily brief", meetings: "Today's meetings", urgent: "Urgent tasks", followUps: "Follow-ups due", numbers: "Key numbers", inbox: "Inbox", sendToPhone: "Send to my phone", pipelineValue: "Pipeline", openTasks: "Open tasks", unread: "Unread", noMeetings: "No meetings today", generated: "Generated" },
  history: { title: "Conversation history", search: "Search all conversations…", continue: "Continue this conversation", messages: "messages", noResults: "No matches." },
  activity: { title: "Activity log", subtitle: "Every action Sanad took, and every approval you gave.", statuses: { success: "Done", failed: "Failed", pending: "Awaiting approval", cancelled: "Cancelled" } },
  settings: {
    title: "Settings",
    integrations: "Integrations",
    connected: "Connected",
    notConnected: "Not connected",
    needsSecrets: "Needs secrets",
    connect: "Connect",
    disconnect: "Disconnect",
    secrets: "Secrets",
    ai: "AI & voice",
    provider: "Model provider",
    serverVoice: "Server voice (Whisper + TTS)",
    browserVoice: "Browser voice fallback",
    webSearch: "Live web search",
    language: "Language",
    uiLanguage: "Interface language",
    notifications: "Notifications",
    enablePush: "Enable push notifications",
    testPush: "Send test",
    pushOn: "Notifications are on for this device",
    pushBlocked: "Notifications are blocked in your browser settings.",
    brief: "Morning brief",
    briefAt: (h: number, tz: string) => `Delivered every day at ${h}:00 (${tz}) via push and Telegram.`,
    sendBriefNow: "Send brief now",
    account: "Account",
    logout: "Sign out",
    install: "Install Sanad on your phone: open this page in your browser and choose “Add to Home Screen”.",
    yes: "Yes",
    no: "No",
  },
  agentsTitle: "Agents",
};

type Dict = typeof en;

const ar: Dict = {
  appName: "سند",
  tagline: "رئيس أركانك الذكي",
  nav: { home: "الرئيسية", dashboard: "لوحة القيادة", history: "السجل", activity: "النشاط", settings: "الإعدادات" },
  orb: { idle: "اضغط على الميكروفون أو قل «سند»", listening: "أستمع…", thinking: "أفكر…", speaking: "أتحدث…" },
  chat: {
    placeholder: "اسأل سند أي شيء…",
    send: "إرسال",
    you: "أنت",
    newChat: "محادثة جديدة",
    showThread: "المحادثة",
    hideThread: "إخفاء",
    delegated: "تم التفويض إلى",
    did: "تم",
    offline: "وضع غير متصل — أضف OPENAI_API_KEY لتفعيل الذكاء الكامل",
    demo: "عرض تجريبي · بيانات تجريبية · يعمل في متصفحك",
    askAgent: (name: string) => `اسأل وكيل ${name}…`,
    suggestions: ["ما هي اجتماعاتي اليوم؟", "لخّص رسائلي غير المقروءة", "كم صرفت هذا الشهر؟", "أضف مهمة للاتصال بأحمد غداً الساعة ١٠", "اكتب كابشن انستغرام لمنتجي الجديد"],
  },
  voice: { pushToTalk: "اضغط للتحدث", stop: "إيقاف", wakeWord: "كلمة التنبيه «سند»", autoSpeak: "قراءة الردود المكتوبة بصوت أيضاً", micDenied: "تم رفض الوصول إلى الميكروفون.", unsupported: "الإدخال الصوتي غير مدعوم في هذا المتصفح." },
  confirm: { title: "سند يحتاج موافقتك", body: "هذا الإجراء يرسل أو يحذف أو يدفع أو ينشر شيئاً. لن يحدث شيء حتى توافق.", approve: "موافقة", cancel: "إلغاء", details: "التفاصيل", deleteTitle: "حذف هذا العنصر؟", deleteBody: "لا يمكن التراجع عن ذلك.", delete: "حذف" },
  common: { add: "إضافة", save: "حفظ", cancel: "إلغاء", edit: "تعديل", delete: "حذف", search: "بحث…", refresh: "تحديث", loading: "جارٍ التحميل…", empty: "لا يوجد شيء بعد.", all: "الكل", due: "الاستحقاق", today: "اليوم", close: "إغلاق", open: "فتح", copy: "نسخ", copied: "تم النسخ" },
  dashboard: { title: "مركز القيادة", subtitle: "سند ينسّق وكلاءك المتخصصين. اضغط على أي وحدة لفتحها." },
  ops: { todo: "للتنفيذ", in_progress: "قيد التنفيذ", done: "منجزة", newTask: "مهمة جديدة", title: "العنوان", priority: "الأولوية", dueAt: "الموعد", project: "المشروع", low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة", moveTo: "نقل إلى" },
  sales: { pipeline: "مسار المبيعات", name: "الاسم", company: "الشركة", stage: "المرحلة", value: "القيمة", nextStep: "الخطوة التالية", followUp: "المتابعة", newLead: "عميل محتمل جديد", overdue: "متأخرة", stages: { new: "جديد", contacted: "تم التواصل", qualified: "مؤهل", proposal: "عرض سعر", won: "مكسوب", lost: "خاسر" } },
  finance: { income: "الدخل", expenses: "المصروفات", net: "الصافي", thisMonth: "هذا الشهر", last6: "آخر ٦ أشهر", byCategory: "المصاريف حسب الفئة", transactions: "المعاملات", invoices: "الفواتير", newTx: "تسجيل معاملة", amount: "المبلغ", category: "الفئة", description: "الوصف", type: "النوع", client: "العميل", status: "الحالة", number: "الفاتورة" },
  marketing: { calendar: "تقويم المحتوى", pipeline: "الأفكار والمسودات", newItem: "محتوى جديد", platform: "المنصة", caption: "النص", scheduledFor: "موعد النشر", statuses: { idea: "فكرة", draft: "مسودة", scheduled: "مجدول", published: "منشور" } },
  notes: { newNote: "ملاحظة جديدة", kind: "النوع", body: "المحتوى", sources: "المصادر", pros: "الإيجابيات", cons: "السلبيات", palette: "الألوان", tags: "الوسوم" },
  memory: { title: "ما يتذكره سند", add: "علّم سند شيئاً", placeholder: "مثال: محاسبي اسمه خالد ويفضّل الواتساب", kinds: { fact: "معلومة", person: "شخص", business: "العمل", preference: "تفضيل" }, pinned: "مثبّتة", auto: "تعلّمتها تلقائياً", semantic: "بحث دلالي" },
  chief: { brief: "الموجز اليومي", meetings: "اجتماعات اليوم", urgent: "مهام عاجلة", followUps: "متابعات مستحقة", numbers: "أرقام مهمة", inbox: "البريد", sendToPhone: "أرسله إلى هاتفي", pipelineValue: "المسار البيعي", openTasks: "مهام مفتوحة", unread: "غير مقروءة", noMeetings: "لا توجد اجتماعات اليوم", generated: "أُنشئ" },
  history: { title: "سجل المحادثات", search: "ابحث في كل المحادثات…", continue: "متابعة هذه المحادثة", messages: "رسالة", noResults: "لا توجد نتائج." },
  activity: { title: "سجل النشاط", subtitle: "كل إجراء قام به سند، وكل موافقة منحتها.", statuses: { success: "تم", failed: "فشل", pending: "بانتظار الموافقة", cancelled: "أُلغي" } },
  settings: {
    title: "الإعدادات",
    integrations: "التكاملات",
    connected: "متصل",
    notConnected: "غير متصل",
    needsSecrets: "يحتاج مفاتيح",
    connect: "ربط",
    disconnect: "فصل",
    secrets: "المفاتيح",
    ai: "الذكاء والصوت",
    provider: "مزوّد النموذج",
    serverVoice: "صوت الخادم (Whisper + TTS)",
    browserVoice: "صوت المتصفح البديل",
    webSearch: "البحث المباشر",
    language: "اللغة",
    uiLanguage: "لغة الواجهة",
    notifications: "الإشعارات",
    enablePush: "تفعيل الإشعارات",
    testPush: "إرسال تجربة",
    pushOn: "الإشعارات مفعّلة على هذا الجهاز",
    pushBlocked: "الإشعارات محظورة من إعدادات المتصفح.",
    brief: "الموجز الصباحي",
    briefAt: (h: number, tz: string) => `يُرسل يومياً الساعة ${h}:00 (${tz}) عبر الإشعارات وتيليجرام.`,
    sendBriefNow: "أرسل الموجز الآن",
    account: "الحساب",
    logout: "تسجيل الخروج",
    install: "ثبّت سند على هاتفك: افتح الصفحة في المتصفح واختر «إضافة إلى الشاشة الرئيسية».",
    yes: "نعم",
    no: "لا",
  },
  agentsTitle: "الوكلاء",
};

const dicts: Record<Lang, Dict> = { en, ar };

interface I18nCtx {
  lang: Lang;
  dir: "ltr" | "rtl";
  t: Dict;
  setLang: (l: Lang) => void;
  /** format date/time in the UI language */
  fmtDate: (d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
  fmtMoney: (n: number, currency?: string) => string;
}

const Ctx = createContext<I18nCtx>(null as unknown as I18nCtx);

function initialLang(): Lang {
  try {
    const s = localStorage.getItem("sanad.lang");
    if (s === "ar" || s === "en") return s;
  } catch {
    /* storage blocked */
  }
  return navigator.language?.startsWith("ar") ? "ar" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<I18nCtx>(() => {
    const locale = lang === "ar" ? "ar-KW" : "en-GB";
    return {
      lang,
      dir,
      t: dicts[lang],
      setLang: (l) => {
        setLangState(l);
        try {
          localStorage.setItem("sanad.lang", l);
        } catch {
          /* ignore */
        }
        fetch("/api/settings/lang", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: l }) }).catch(() => {});
      },
      fmtDate: (d, opts = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) => (d ? new Intl.DateTimeFormat(locale, opts).format(new Date(d)) : ""),
      fmtMoney: (n, currency = "KWD") => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n)} ${currency === "KWD" && lang === "ar" ? "د.ك" : currency}`,
    };
  }, [lang, dir]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
