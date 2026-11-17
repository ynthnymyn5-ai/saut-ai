/**
 * Long-term memory: facts about the owner, their business, people and
 * preferences. Stored with pgvector embeddings and retrieved by cosine
 * similarity for every request; new facts are extracted automatically after
 * each conversation turn.
 */
import { z } from "zod";
import { cosineDistance, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { llm } from "../llm";
import { defineTool, L } from "../tools/types";
import { logActivity } from "../lib/activity";

export type MemoryKind = "fact" | "person" | "business" | "preference";

async function embedOne(text: string): Promise<number[] | null> {
  try {
    const [v] = await llm().embed([text]);
    return v ?? null;
  } catch (e) {
    console.error("[memory] embedding failed", e);
    return null;
  }
}

export async function addMemory(content: string, kind: MemoryKind = "fact", source = "manual", tags: string[] = []) {
  const embedding = await embedOne(content);
  const [m] = await db.insert(schema.memories).values({ content, kind, source, tags, embedding }).returning();
  return m;
}

export async function updateMemory(id: number, patch: { content?: string; kind?: MemoryKind; pinned?: boolean; tags?: string[] }) {
  const values: Partial<typeof schema.memories.$inferInsert> = { ...patch, updatedAt: new Date() };
  if (patch.content) values.embedding = await embedOne(patch.content);
  const [m] = await db.update(schema.memories).set(values).where(eq(schema.memories.id, id)).returning();
  return m;
}

/** Top-k memories most similar to `query` (pinned memories are always included). */
export async function searchMemories(query: string, k = 6) {
  const qv = await embedOne(query);
  const pinned = await db.select().from(schema.memories).where(eq(schema.memories.pinned, true)).limit(10);
  if (!qv) return pinned;
  const similarity = sql<number>`1 - (${cosineDistance(schema.memories.embedding, qv)})`;
  const rows = await db
    .select({ m: schema.memories, similarity })
    .from(schema.memories)
    .where(sql`${schema.memories.embedding} is not null`)
    .orderBy(desc(similarity))
    .limit(k);
  const relevant = rows.filter((r) => r.similarity > 0.15).map((r) => ({ ...r.m, similarity: r.similarity }));
  const seen = new Set(relevant.map((r) => r.id));
  return [...pinned.filter((p) => !seen.has(p.id)), ...relevant];
}

/** Prompt block injected into every agent's system prompt. */
export async function memoryContext(query: string): Promise<string> {
  const rows = await searchMemories(query);
  if (!rows.length) return "";
  return rows.map((m) => `- (${m.kind}) ${m.content}`).join("\n");
}

const extractionSchema = z.object({
  facts: z.array(z.object({ content: z.string(), kind: z.enum(["fact", "person", "business", "preference"]).catch("fact") })).catch([]),
});

/**
 * Ask the model which durable facts in this exchange are worth remembering,
 * then store the ones that aren't near-duplicates of existing memories.
 * Runs in the background after the reply is sent.
 */
export async function extractMemories(userText: string, assistantText: string) {
  if (userText.trim().length < 12) return [];
  try {
    const res = await llm().chat({
      fast: true,
      json: true,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `MEMORY_EXTRACTION. You maintain long-term memory for the owner of a business, who talks to their assistant Sanad.
From the exchange below, extract only DURABLE facts worth remembering for months: who the owner is, their business (products, prices, customers, goals),
people they mention (name + relationship/role), and stable preferences (communication style, schedule habits, language).
Do NOT store one-off requests, tasks, dates of single meetings, or anything Sanad said that the owner didn't confirm.
Write each fact as a standalone sentence in the language the owner used. Return JSON: {"facts":[{"content":"...","kind":"fact|person|business|preference"}]}. Return {"facts":[]} if nothing qualifies.`,
        },
        { role: "user", content: `OWNER: ${userText}\nSANAD: ${assistantText}` },
      ],
    });
    const parsed = extractionSchema.safeParse(JSON.parse(res.content || "{}"));
    if (!parsed.success) return [];
    const saved = [];
    for (const f of parsed.data.facts.slice(0, 5)) {
      const similar = await searchMemories(f.content, 1);
      const top = similar.find((s) => "similarity" in s) as { similarity?: number } | undefined;
      if (top?.similarity && top.similarity > 0.9) continue; // near-duplicate
      const m = await addMemory(f.content, f.kind, "auto");
      saved.push(m);
      await logActivity({ action: "memory.auto_save", agentId: "memory", summary: `Remembered: ${f.content}` });
    }
    return saved;
  } catch (e) {
    console.error("[memory] extraction failed", e);
    return [];
  }
}

/**
 * Embeddings from different providers aren't comparable. When the provider
 * changes (e.g. you add OPENAI_API_KEY after testing offline), re-embed.
 */
export async function ensureEmbeddingsMatchProvider() {
  const key = "embedding_provider";
  const current = llm().isReal ? "openai" : "local";
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  const missing = await db.select({ id: schema.memories.id }).from(schema.memories).where(isNull(schema.memories.embedding)).limit(1);
  if (row?.value === current && !missing.length) return;
  const all = await db.select().from(schema.memories);
  console.log(`[memory] re-embedding ${all.length} memories for provider "${current}"`);
  for (let i = 0; i < all.length; i += 50) {
    const batch = all.slice(i, i + 50);
    try {
      const vecs = await llm().embed(batch.map((m) => m.content));
      for (let j = 0; j < batch.length; j++) await db.update(schema.memories).set({ embedding: vecs[j] }).where(eq(schema.memories.id, batch[j].id));
    } catch (e) {
      console.error("[memory] re-embed failed", e);
      return;
    }
  }
  await db.insert(schema.settings).values({ key, value: current }).onConflictDoUpdate({ target: schema.settings.key, set: { value: current, updatedAt: new Date() } });
}

// ─── Tools ───────────────────────────────────────────────────────────────────
const kind = z.enum(["fact", "person", "business", "preference"]);

export const saveMemoryTool = defineTool({
  name: "save_memory",
  description: "Store a durable fact about the owner, their business, a person, or a preference. Use when the owner says 'remember…'.",
  agents: ["memory", "chief"],
  mutates: true,
  schema: z.object({ content: z.string().min(3), kind: kind.nullish(), pinned: z.boolean().nullish() }),
  summarize: (a, lang) => L(lang, `Remember: ${a.content}`, `تذكّر: ${a.content}`),
  async run(a, ctx) {
    const m = await addMemory(a.content, a.kind ?? "fact", "manual");
    if (a.pinned) await updateMemory(m.id, { pinned: true });
    return { memory: { id: m.id }, say: L(ctx.lang, `Got it — I'll remember that ${a.content.replace(/^that\s+/i, "")}`, `تمام، سأتذكر: ${a.content}`) };
  },
});

export const searchMemoryTool = defineTool({
  name: "search_memory",
  description: "Search long-term memory for facts about the owner, people, business or preferences.",
  agents: ["memory", "chief"],
  schema: z.object({ query: z.string() }),
  summarize: (a, lang) => L(lang, `Search memory: ${a.query}`, `البحث في الذاكرة: ${a.query}`),
  async run(a, ctx) {
    let rows = await searchMemories(a.query, 8);
    // Broad "what do you know about me" questions → show the most recent memories too
    if (rows.length < 3) rows = await db.select().from(schema.memories).orderBy(desc(schema.memories.updatedAt)).limit(8);
    return {
      memories: rows.map((m) => ({ id: m.id, kind: m.kind, content: m.content })),
      say: rows.length ? L(ctx.lang, `Here's what I remember:\n${rows.map((m) => `• ${m.content}`).join("\n")}`, `هذا ما أتذكره:\n${rows.map((m) => `• ${m.content}`).join("\n")}`) : L(ctx.lang, "I don't have anything stored about that yet.", "لا أملك معلومات محفوظة عن ذلك بعد."),
    };
  },
});

export const deleteMemoryTool = defineTool({
  name: "delete_memory",
  description: "Forget a stored memory. Requires owner confirmation.",
  agents: ["memory"],
  confirm: true,
  mutates: true,
  schema: z.object({ id: z.number().int(), content: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Forget memory #${a.id}${a.content ? `: “${a.content}”` : ""}`, `نسيان الذاكرة رقم ${a.id}`),
  async run(a, ctx) {
    const [m] = await db.delete(schema.memories).where(eq(schema.memories.id, a.id)).returning();
    return { say: m ? L(ctx.lang, "Forgotten.", "تم النسيان.") : L(ctx.lang, "Memory not found.", "غير موجودة.") };
  },
});

export const memoryTools = [saveMemoryTool, searchMemoryTool, deleteMemoryTool];
