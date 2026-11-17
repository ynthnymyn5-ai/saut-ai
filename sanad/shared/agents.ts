/**
 * Agent metadata shared by the server (routing, prompts) and the client
 * (dashboard modules, panels). Prompts and tools live server-side in
 * server/agents/registry.ts — this file only holds display information.
 */
export type AgentId =
  | "chief"
  | "researcher"
  | "strategist"
  | "sales"
  | "marketing"
  | "operations"
  | "finance"
  | "engineering"
  | "design"
  | "memory";

export interface AgentMeta {
  id: AgentId;
  name: { en: string; ar: string };
  tagline: { en: string; ar: string };
  /** lucide-react icon name used by the client */
  icon: string;
  /** accent colour for the module node and panel */
  color: string;
}

export const AGENTS: AgentMeta[] = [
  { id: "chief", name: { en: "Chief of Staff", ar: "رئيس الأركان" }, tagline: { en: "Orchestrates everything and briefs you daily", ar: "ينسّق كل شيء ويقدّم لك موجزاً يومياً" }, icon: "Crown", color: "#a855f7" },
  { id: "researcher", name: { en: "Researcher", ar: "الباحث" }, tagline: { en: "Web research and summaries with sources", ar: "بحث على الويب وملخصات مع المصادر" }, icon: "Search", color: "#38bdf8" },
  { id: "strategist", name: { en: "Strategist", ar: "الاستراتيجي" }, tagline: { en: "Plans, decisions, pros and cons", ar: "الخطط والقرارات والإيجابيات والسلبيات" }, icon: "Compass", color: "#818cf8" },
  { id: "sales", name: { en: "Sales", ar: "المبيعات" }, tagline: { en: "Leads pipeline and follow-ups", ar: "مسار العملاء المحتملين والمتابعات" }, icon: "Handshake", color: "#34d399" },
  { id: "marketing", name: { en: "Marketing", ar: "التسويق" }, tagline: { en: "Content ideas, captions, calendar", ar: "أفكار المحتوى والتعليقات والتقويم" }, icon: "Megaphone", color: "#f472b6" },
  { id: "operations", name: { en: "Operations", ar: "العمليات" }, tagline: { en: "Tasks and projects", ar: "المهام والمشاريع" }, icon: "KanbanSquare", color: "#fb923c" },
  { id: "finance", name: { en: "Finance", ar: "المالية" }, tagline: { en: "Income, expenses, invoices", ar: "الدخل والمصروفات والفواتير" }, icon: "Wallet", color: "#facc15" },
  { id: "engineering", name: { en: "Engineering", ar: "الهندسة" }, tagline: { en: "Tech notes, snippets, specs", ar: "ملاحظات تقنية وأكواد ومواصفات" }, icon: "Code2", color: "#22d3ee" },
  { id: "design", name: { en: "Design", ar: "التصميم" }, tagline: { en: "Briefs and moodboards", ar: "الملخصات الإبداعية ولوحات الإلهام" }, icon: "Palette", color: "#e879f9" },
  { id: "memory", name: { en: "Memory", ar: "الذاكرة" }, tagline: { en: "What Sanad knows about you", ar: "ما يعرفه سند عنك" }, icon: "Brain", color: "#c084fc" },
];

export const AGENT_IDS = AGENTS.map((a) => a.id);
export const agentMeta = (id: string) => AGENTS.find((a) => a.id === id) ?? AGENTS[0];
