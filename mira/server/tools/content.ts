/**
 * Marketing (content calendar) and knowledge-note tools used by the
 * Researcher, Strategist, Engineering and Design agents.
 */
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "../db";
import { defineTool, L } from "./types";
import { toDate } from "../lib/time";
import { env } from "../env";

const contentStatus = z.enum(["idea", "draft", "scheduled", "published"]);
const platform = z.enum(["instagram", "tiktok", "linkedin", "x", "facebook", "youtube", "blog", "email"]);

export const saveContentItem = defineTool({
  name: "save_content_item",
  description: "Save a content idea, caption draft or scheduled post to the content calendar. Write the caption yourself first.",
  agents: ["marketing"],
  mutates: true,
  schema: z.object({
    title: z.string(),
    platform: platform.nullish(),
    caption: z.string().nullish(),
    status: contentStatus.exclude(["published"]).nullish(),
    scheduledFor: z.string().nullish(),
  }),
  summarize: (a, lang) => L(lang, `Save ${a.platform ?? "content"} item “${a.title}”`, `حفظ محتوى «${a.title}»`),
  async run(a, ctx) {
    const [c] = await db
      .insert(schema.contentItems)
      .values({ title: a.title, platform: a.platform ?? "instagram", caption: a.caption ?? null, status: a.status ?? (a.scheduledFor ? "scheduled" : "draft"), scheduledFor: toDate(a.scheduledFor) })
      .returning();
    return {
      item: c,
      say: L(ctx.lang, `Saved to your content calendar as a ${c.status}${c.caption ? `:\n\n${c.caption}` : "."}`, `حفظته في تقويم المحتوى${c.caption ? `:\n\n${c.caption}` : "."}`),
    };
  },
});

export const listContent = defineTool({
  name: "list_content",
  description: "List content calendar items.",
  agents: ["marketing", "chief"],
  schema: z.object({ status: contentStatus.nullish(), platform: platform.nullish() }),
  summarize: (_a, lang) => L(lang, "List content", "عرض المحتوى"),
  async run(a, ctx) {
    const conds = [];
    if (a.status) conds.push(eq(schema.contentItems.status, a.status));
    if (a.platform) conds.push(eq(schema.contentItems.platform, a.platform));
    const rows = await db.select().from(schema.contentItems).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.contentItems.createdAt)).limit(30);
    return { items: rows, say: rows.map((r) => `• [${r.status}] ${r.platform}: ${r.title}`).join("\n") || L(ctx.lang, "Calendar is empty.", "التقويم فارغ.") };
  },
});

export const updateContentItem = defineTool({
  name: "update_content_item",
  description: "Edit a content item. Marking it 'published' requires owner confirmation.",
  agents: ["marketing"],
  mutates: true,
  confirm: (a) => a.status === "published",
  schema: z.object({ id: z.number().int(), title: z.string().nullish(), caption: z.string().nullish(), status: contentStatus.nullish(), scheduledFor: z.string().nullish() }),
  summarize: (a, lang) => (a.status === "published" ? L(lang, `Publish content item #${a.id}`, `نشر المحتوى رقم ${a.id}`) : L(lang, `Update content item #${a.id}`, `تحديث المحتوى رقم ${a.id}`)),
  async run(a, ctx) {
    const patch: Partial<typeof schema.contentItems.$inferInsert> = { updatedAt: new Date() };
    if (a.title) patch.title = a.title;
    if (a.caption) patch.caption = a.caption;
    if (a.status) patch.status = a.status;
    if (a.scheduledFor) patch.scheduledFor = toDate(a.scheduledFor);
    const [c] = await db.update(schema.contentItems).set(patch).where(eq(schema.contentItems.id, a.id)).returning();
    return { item: c, say: c ? L(ctx.lang, `Updated “${c.title}” (${c.status}).`, `تم تحديث «${c.title}».`) : L(ctx.lang, "Not found.", "غير موجود.") };
  },
});

// ─── Notes ───────────────────────────────────────────────────────────────────
const noteKind = z.enum(["note", "research", "decision", "plan", "snippet", "spec", "brief", "moodboard"]);
const noteAgents = ["researcher", "strategist", "engineering", "design"] as const;

export const saveNote = defineTool({
  name: "save_note",
  description:
    "Save a note to the current agent's panel: research report (with sources), decision/plan (with pros/cons), code snippet or spec, design brief or moodboard (with hex colours).",
  agents: ["researcher", "strategist", "engineering", "design"],
  mutates: true,
  schema: z.object({
    kind: noteKind,
    title: z.string(),
    body: z.string().describe("Markdown body"),
    codeLanguage: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    sources: z.array(z.object({ title: z.string(), url: z.string() })).nullish(),
    pros: z.array(z.string()).nullish(),
    cons: z.array(z.string()).nullish(),
    colors: z.array(z.string()).nullish().describe("Moodboard hex colours"),
  }),
  summarize: (a, lang) => L(lang, `Save ${a.kind} “${a.title}”`, `حفظ ${a.kind} «${a.title}»`),
  async run(a, ctx) {
    const agentId = (noteAgents as readonly string[]).includes(ctx.agentId) ? ctx.agentId : "researcher";
    const [n] = await db
      .insert(schema.notes)
      .values({
        agentId,
        kind: a.kind,
        title: a.title,
        body: a.body,
        codeLanguage: a.codeLanguage ?? null,
        tags: a.tags ?? [],
        data: { sources: a.sources ?? [], pros: a.pros ?? [], cons: a.cons ?? [], colors: a.colors ?? [] },
      })
      .returning();
    return { note: { id: n.id, title: n.title }, say: L(ctx.lang, `Saved “${n.title}” to the ${agentId} panel.`, `حفظت «${n.title}».`) };
  },
});

export const listNotes = defineTool({
  name: "list_notes",
  description: "Search saved notes (research, decisions, specs, briefs…).",
  agents: ["researcher", "strategist", "engineering", "design", "chief"],
  schema: z.object({ query: z.string().nullish(), kind: noteKind.nullish(), agent: z.enum(noteAgents).nullish() }),
  summarize: (_a, lang) => L(lang, "Search notes", "البحث في الملاحظات"),
  async run(a, ctx) {
    const conds = [];
    if (a.agent) conds.push(eq(schema.notes.agentId, a.agent));
    if (a.kind) conds.push(eq(schema.notes.kind, a.kind));
    if (a.query) conds.push(or(ilike(schema.notes.title, `%${a.query}%`), ilike(schema.notes.body, `%${a.query}%`)));
    const rows = await db.select().from(schema.notes).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.notes.updatedAt)).limit(10);
    return {
      notes: rows.map((r) => ({ id: r.id, agent: r.agentId, kind: r.kind, title: r.title, excerpt: r.body.slice(0, 400) })),
      say: rows.map((r) => `• [${r.agentId}/${r.kind}] ${r.title}`).join("\n") || L(ctx.lang, "No notes found.", "لا توجد ملاحظات."),
    };
  },
});

export const deleteNote = defineTool({
  name: "delete_note",
  description: "Delete a saved note. Requires owner confirmation.",
  agents: ["researcher", "strategist", "engineering", "design"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.number().int(), title: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Delete note #${a.id}${a.title ? ` “${a.title}”` : ""}`, `حذف الملاحظة رقم ${a.id}`),
  async run(a, ctx) {
    const [n] = await db.delete(schema.notes).where(eq(schema.notes.id, a.id)).returning();
    return { say: n ? L(ctx.lang, "Note deleted.", "تم حذف الملاحظة.") : L(ctx.lang, "Not found.", "غير موجودة.") };
  },
});

// ─── Research ────────────────────────────────────────────────────────────────
export const webSearch = defineTool({
  name: "web_search",
  description: "Search the live web. Returns results with titles, URLs and content snippets. Cite URLs in your answer.",
  agents: ["researcher", "strategist", "marketing"],
  schema: z.object({ query: z.string(), maxResults: z.number().int().min(1).max(10).nullish() }),
  summarize: (a, lang) => L(lang, `Web search: ${a.query}`, `بحث: ${a.query}`),
  async run(a, ctx) {
    if (!env.TAVILY_API_KEY) {
      return {
        configured: false,
        results: [],
        say: L(ctx.lang, "Live web search isn't configured (add TAVILY_API_KEY). Answer from general knowledge and say sources weren't checked live.", "البحث المباشر غير مفعّل (أضف TAVILY_API_KEY)."),
      };
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query: a.query, max_results: a.maxResults ?? 6, include_answer: true, search_depth: "advanced" }),
    });
    if (!res.ok) return { results: [], say: `Search failed (${res.status}).` };
    const data = (await res.json()) as { answer?: string; results: { title: string; url: string; content: string }[] };
    return {
      answer: data.answer,
      results: data.results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 700) })),
      say: data.results.map((r) => `• ${r.title} — ${r.url}`).join("\n"),
    };
  },
});

export const contentTools = [saveContentItem, listContent, updateContentItem, saveNote, listNotes, deleteNote, webSearch];
