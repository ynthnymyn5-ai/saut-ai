/** Notion plugin: search, read and (with confirmation) create pages. */
import { z } from "zod";
import { env } from "../env";
import { defineTool, L } from "../tools/types";
import type { IntegrationPlugin } from "./types";

async function notion<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.NOTION_TOKEN) throw new Error("Notion isn't configured — add NOTION_TOKEN to Secrets.");
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Notion ${res.status}: ${body.message ?? "request failed"}`);
  return body as T;
}

const pageTitle = (p: any): string => {
  const props = p.properties ?? {};
  for (const k of Object.keys(props)) if (props[k].type === "title") return props[k].title.map((t: any) => t.plain_text).join("") || "Untitled";
  return p.title?.[0]?.plain_text ?? "Untitled";
};

const searchTool = defineTool({
  name: "notion_search",
  description: "Search the owner's Notion workspace for pages.",
  agents: ["chief", "researcher", "strategist", "engineering", "design"],
  schema: z.object({ query: z.string() }),
  summarize: (a, lang) => L(lang, `Search Notion: ${a.query}`, `بحث في Notion: ${a.query}`),
  async run(a, ctx) {
    const r = await notion<{ results: any[] }>("/search", { method: "POST", body: JSON.stringify({ query: a.query, page_size: 8, filter: { property: "object", value: "page" } }) });
    const pages = r.results.map((p) => ({ id: p.id, title: pageTitle(p), url: p.url }));
    return { pages, say: pages.map((p) => `• ${p.title} — ${p.url}`).join("\n") || L(ctx.lang, "No pages found.", "لم أجد صفحات.") };
  },
});

const readTool = defineTool({
  name: "notion_read_page",
  description: "Read the text content of a Notion page by id.",
  agents: ["chief", "researcher", "strategist", "engineering", "design"],
  schema: z.object({ pageId: z.string() }),
  summarize: (_a, lang) => L(lang, "Read Notion page", "قراءة صفحة Notion"),
  async run(a) {
    const r = await notion<{ results: any[] }>(`/blocks/${a.pageId}/children?page_size=100`);
    const text = r.results
      .map((b) => (b[b.type]?.rich_text ?? []).map((t: any) => t.plain_text).join(""))
      .filter(Boolean)
      .join("\n");
    return { content: text.slice(0, 8000), say: text.slice(0, 1500) };
  },
});

const createTool = defineTool({
  name: "notion_create_page",
  description: "Create a Notion page (under parentPageId, or the first page Mira can access). Requires owner confirmation.",
  agents: ["chief", "researcher", "strategist", "engineering", "design"],
  confirm: true,
  mutates: true,
  schema: z.object({ title: z.string(), content: z.string(), parentPageId: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Create Notion page “${a.title}”`, `إنشاء صفحة Notion «${a.title}»`),
  async run(a, ctx) {
    let parent = a.parentPageId;
    if (!parent) {
      const r = await notion<{ results: any[] }>("/search", { method: "POST", body: JSON.stringify({ page_size: 1, filter: { property: "object", value: "page" } }) });
      parent = r.results[0]?.id;
      if (!parent) return { say: L(ctx.lang, "Share at least one Notion page with the Mira integration first.", "شارك صفحة واحدة على الأقل مع تكامل ميرا.") };
    }
    const children = a.content
      .split(/\n{2,}/)
      .slice(0, 90)
      .map((para) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: para.slice(0, 1900) } }] } }));
    const page = await notion<{ id: string; url: string }>("/pages", {
      method: "POST",
      body: JSON.stringify({ parent: { page_id: parent }, properties: { title: { title: [{ text: { content: a.title } }] } }, children }),
    });
    return { url: page.url, say: L(ctx.lang, `Created “${a.title}” in Notion: ${page.url}`, `أنشأت «${a.title}» في Notion: ${page.url}`) };
  },
});

export const notionPlugin: IntegrationPlugin = {
  id: "notion",
  name: "Notion",
  description: "Search, read and write documents in your Notion workspace.",
  category: "documents",
  requiredSecrets: ["NOTION_TOKEN"],
  async status() {
    if (!env.NOTION_TOKEN) return { configured: false, connected: false };
    try {
      const me = await notion<{ name?: string; bot?: { workspace_name?: string } }>("/users/me");
      return { configured: true, connected: true, account: me.bot?.workspace_name ?? me.name };
    } catch (e) {
      return { configured: true, connected: false, detail: (e as Error).message };
    }
  },
  tools: [searchTool, readTool, createTool],
};
