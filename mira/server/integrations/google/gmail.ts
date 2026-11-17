/**
 * Gmail plugin: read, summarise and draft replies. Sending ALWAYS requires
 * owner confirmation. Without Google connected the tools use a sample inbox.
 */
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { defineTool, L } from "../../tools/types";
import type { IntegrationPlugin } from "../types";
import { googleConfigured, googleFetch, googleScopes, googleDisconnect } from "./auth";
import { getAccount } from "../store";

export interface MailSummary {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
  source: "gmail" | "sample";
}

async function useGmail() {
  return googleConfigured() && (await googleScopes()).some((s) => s.includes("gmail"));
}

const header = (h: { name: string; value: string }[] | undefined, n: string) => h?.find((x) => x.name.toLowerCase() === n)?.value ?? "";

/** Decode a Gmail message payload to plain text (prefers text/plain parts). */
function decodeBody(payload: GmailPart): string {
  const walk = (p: GmailPart): string | null => {
    if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const c of p.parts ?? []) {
      const r = walk(c);
      if (r) return r;
    }
    return null;
  };
  const text = walk(payload);
  if (text) return text;
  const html = payload.body?.data ? Buffer.from(payload.body.data, "base64url").toString("utf8") : "";
  return html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

export async function listMail(unreadOnly = true, query = "", limit = 10): Promise<MailSummary[]> {
  if (await useGmail()) {
    const q = [unreadOnly ? "is:unread" : "", "in:inbox", query].filter(Boolean).join(" ");
    const list = await googleFetch<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent(q)}`);
    const out: MailSummary[] = [];
    for (const m of list.messages ?? []) {
      const msg = await googleFetch<{ id: string; snippet: string; labelIds?: string[]; payload: GmailPart; internalDate: string }>(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      );
      out.push({
        id: msg.id,
        from: header(msg.payload.headers, "from"),
        subject: header(msg.payload.headers, "subject"),
        snippet: msg.snippet,
        date: new Date(Number(msg.internalDate)).toISOString(),
        unread: msg.labelIds?.includes("UNREAD") ?? false,
        source: "gmail",
      });
    }
    return out;
  }
  const rows = await db.select().from(schema.sampleEmails).orderBy(desc(schema.sampleEmails.receivedAt)).limit(50);
  return rows
    .filter((r) => (!unreadOnly || r.unread) && (!query || `${r.subject} ${r.body} ${r.fromName}`.toLowerCase().includes(query.toLowerCase())))
    .slice(0, limit)
    .map((r) => ({ id: String(r.id), from: `${r.fromName} <${r.fromEmail}>`, subject: r.subject, snippet: r.body.slice(0, 220), date: r.receivedAt.toISOString(), unread: r.unread, source: "sample" }));
}

export async function unreadCount(): Promise<number> {
  if (await useGmail()) {
    try {
      const l = await googleFetch<{ messagesUnread: number }>("https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX");
      return l.messagesUnread;
    } catch {
      return 0;
    }
  }
  return (await listMail(true, "", 50)).length;
}

const listTool = defineTool({
  name: "gmail_list_messages",
  description: "List inbox emails (unread by default) with sender, subject and snippet. Use it to summarise unread email.",
  agents: ["chief", "sales"],
  schema: z.object({ unreadOnly: z.boolean().nullish(), query: z.string().nullish().describe("Gmail search, e.g. from:ahmed"), limit: z.number().int().max(25).nullish() }),
  summarize: (_a, lang) => L(lang, "Read inbox", "قراءة البريد"),
  async run(a, ctx) {
    const mails = await listMail(a.unreadOnly ?? true, a.query ?? "", a.limit ?? 10);
    const sample = mails[0]?.source === "sample" || !(await useGmail());
    const lines = mails.map((m) => `• ${m.from.replace(/<.*>/, "").trim()}: ${m.subject} — ${m.snippet.slice(0, 120)}`).join("\n");
    return {
      emails: mails,
      say: mails.length
        ? L(ctx.lang, `${mails.length} unread email(s)${sample ? " (sample inbox — connect Gmail in Settings)" : ""}:\n${lines}`, `${mails.length} رسالة غير مقروءة${sample ? " (بريد تجريبي)" : ""}:\n${lines}`)
        : L(ctx.lang, "Inbox zero — no unread emails.", "لا توجد رسائل غير مقروءة."),
    };
  },
});

const readTool = defineTool({
  name: "gmail_read_message",
  description: "Read the full body of one email by id.",
  agents: ["chief", "sales"],
  schema: z.object({ id: z.string() }),
  summarize: (_a, lang) => L(lang, "Read email", "قراءة رسالة"),
  async run(a, ctx) {
    if (await useGmail()) {
      const msg = await googleFetch<{ id: string; threadId: string; payload: GmailPart }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${a.id}?format=full`);
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: header(msg.payload.headers, "from"),
        subject: header(msg.payload.headers, "subject"),
        body: decodeBody(msg.payload).slice(0, 6000),
        say: L(ctx.lang, "Email loaded.", "تم تحميل الرسالة."),
      };
    }
    const [r] = await db.select().from(schema.sampleEmails).where(eq(schema.sampleEmails.id, Number(a.id)));
    if (!r) return { say: L(ctx.lang, "Email not found.", "الرسالة غير موجودة.") };
    await db.update(schema.sampleEmails).set({ unread: false }).where(eq(schema.sampleEmails.id, r.id));
    return { id: String(r.id), from: `${r.fromName} <${r.fromEmail}>`, subject: r.subject, body: r.body, say: `${r.fromName}: ${r.subject}\n\n${r.body}` };
  },
});

function rfc822(to: string, subject: string, body: string, inReplyTo?: string | null) {
  const lines = [`To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64"];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`);
  return Buffer.from(`${lines.join("\r\n")}\r\n\r\n${Buffer.from(body).toString("base64")}`).toString("base64url");
}

const draftTool = defineTool({
  name: "gmail_create_draft",
  description: "Draft an email or reply (saved as a draft, NOT sent). Show the owner the draft text in your answer.",
  agents: ["chief", "sales"],
  mutates: true,
  schema: z.object({ to: z.string(), subject: z.string(), body: z.string(), threadId: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Draft email to ${a.to}: “${a.subject}”`, `مسودة رسالة إلى ${a.to}`),
  async run(a, ctx) {
    let externalId: string | null = null;
    if (await useGmail()) {
      const d = await googleFetch<{ id: string }>("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        body: JSON.stringify({ message: { raw: rfc822(a.to, a.subject, a.body), threadId: a.threadId ?? undefined } }),
      });
      externalId = d.id;
    }
    const [draft] = await db.insert(schema.emailDrafts).values({ to: a.to, subject: a.subject, body: a.body, externalId, inReplyTo: a.threadId ?? null }).returning();
    return {
      draftId: draft.id,
      say: L(ctx.lang, `Draft #${draft.id} saved${externalId ? " in Gmail" : ""}. Say “send it” when you're happy.\n\nTo: ${a.to}\nSubject: ${a.subject}\n\n${a.body}`, `حفظت المسودة رقم ${draft.id}. قل «أرسلها» عندما تكون جاهزة.\n\nإلى: ${a.to}\nالموضوع: ${a.subject}\n\n${a.body}`),
    };
  },
});

const sendTool = defineTool({
  name: "gmail_send",
  description: "Send an email (a saved draft by draftId, or to/subject/body). ALWAYS requires owner confirmation.",
  agents: ["chief", "sales"],
  confirm: true,
  mutates: true,
  schema: z.object({ draftId: z.number().int().nullish(), to: z.string().nullish(), subject: z.string().nullish(), body: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Send email${a.to ? ` to ${a.to}` : a.draftId ? ` (draft #${a.draftId})` : ""}${a.subject ? `: “${a.subject}”` : ""}`, `إرسال بريد${a.to ? ` إلى ${a.to}` : ""}`),
  async run(a, ctx) {
    let draft = a.draftId ? (await db.select().from(schema.emailDrafts).where(eq(schema.emailDrafts.id, a.draftId)))[0] : undefined;
    if (!draft) {
      if (!a.to || !a.subject || !a.body) return { say: L(ctx.lang, "I need a draft or to/subject/body to send.", "أحتاج مسودة أو بيانات الرسالة.") };
      [draft] = await db.insert(schema.emailDrafts).values({ to: a.to, subject: a.subject, body: a.body }).returning();
    }
    if (await useGmail()) {
      if (draft.externalId) await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", { method: "POST", body: JSON.stringify({ id: draft.externalId }) });
      else await googleFetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body: JSON.stringify({ raw: rfc822(draft.to, draft.subject, draft.body) }) });
      await db.update(schema.emailDrafts).set({ status: "sent" }).where(eq(schema.emailDrafts.id, draft.id));
      return { say: L(ctx.lang, `Sent to ${draft.to}.`, `تم الإرسال إلى ${draft.to}.`) };
    }
    await db.update(schema.emailDrafts).set({ status: "sent" }).where(eq(schema.emailDrafts.id, draft.id));
    return { simulated: true, say: L(ctx.lang, `Marked as sent to ${draft.to} — sample mode, nothing left your account. Connect Gmail to send for real.`, `وضع تجريبي: لم تُرسل الرسالة فعلياً. اربط Gmail للإرسال الحقيقي.`) };
  },
});

export const gmailPlugin: IntegrationPlugin = {
  id: "gmail",
  name: "Gmail",
  description: "Read and summarise email, draft replies. Sending always asks you first.",
  category: "email",
  requiredSecrets: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  connectUrl: "/api/integrations/google/connect",
  async status() {
    if (!googleConfigured()) return { configured: false, connected: false, detail: "Using a sample inbox." };
    const acc = await getAccount("google");
    if (!acc || !(await useGmail())) return { configured: true, connected: false, detail: "Click Connect to sign in with Google." };
    try {
      const p = await googleFetch<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile");
      return { configured: true, connected: true, account: p.emailAddress };
    } catch (e) {
      return { configured: true, connected: false, detail: (e as Error).message };
    }
  },
  disconnect: googleDisconnect,
  tools: [listTool, readTool, draftTool, sendTool],
};
