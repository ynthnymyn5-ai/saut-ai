/**
 * Messaging channels: talk to Mira from your phone via a Telegram bot or the
 * WhatsApp Business Cloud API. Only the owner's chat/number is served.
 * Confirmations work over chat too: Mira asks, you reply "yes" / "نعم".
 */
import crypto from "node:crypto";
import { z } from "zod";
import express, { type Router } from "express";
import { env } from "../env";
import { defineTool, L } from "../tools/types";
import type { IntegrationPlugin } from "./types";
import { getAccount, saveAccount, deleteAccount } from "./store";
import { logActivity } from "../lib/activity";

/** Lazy import avoids a circular dependency (orchestrator → registry → plugins). */
const inbound = () => import("../agents/inbound");

// ─── Telegram ────────────────────────────────────────────────────────────────
const tgApi = (method: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json() as Promise<{ ok: boolean; result?: any; description?: string }>);

const tgSecret = () => crypto.createHash("sha256").update(`tg:${env.SESSION_SECRET}:${env.TELEGRAM_BOT_TOKEN}`).digest("hex").slice(0, 48);

export async function telegramSend(text: string, chatId = env.TELEGRAM_OWNER_CHAT_ID) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return false;
  // Telegram messages max 4096 chars
  for (let i = 0; i < text.length; i += 4000) await tgApi("sendMessage", { chat_id: chatId, text: text.slice(i, i + 4000) });
  return true;
}

async function telegramVoiceToText(fileId: string): Promise<string | null> {
  const { llm } = await import("../llm");
  if (!llm().supportsVoice) return null;
  const f = await tgApi("getFile", { file_id: fileId });
  if (!f.ok) return null;
  const audio = Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${f.result.file_path}`)).arrayBuffer());
  return (await llm().transcribe(audio, "voice.ogg")).text;
}

export const telegramPlugin: IntegrationPlugin = {
  id: "telegram",
  name: "Telegram bot",
  description: "Chat with Mira (text or voice notes) and get reminders and your daily brief on Telegram.",
  category: "messaging",
  requiredSecrets: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_OWNER_CHAT_ID"],
  async status() {
    if (!env.TELEGRAM_BOT_TOKEN) return { configured: false, connected: false };
    const me = await tgApi("getMe").catch(() => ({ ok: false }) as { ok: false; result?: undefined });
    if (!me.ok) return { configured: true, connected: false, detail: "Bot token rejected by Telegram." };
    const hook = await tgApi("getWebhookInfo");
    const ok = Boolean(hook.result?.url?.endsWith("/api/integrations/telegram/webhook"));
    if (!env.TELEGRAM_OWNER_CHAT_ID) return { configured: true, connected: false, account: `@${me.result.username}`, detail: "Send /start to the bot to get your chat ID, then add TELEGRAM_OWNER_CHAT_ID." };
    return { configured: true, connected: ok, account: `@${me.result.username}`, detail: ok ? undefined : "Click Connect to register the webhook." };
  },
  async connect(base) {
    const r = await tgApi("setWebhook", { url: `${base}/api/integrations/telegram/webhook`, secret_token: tgSecret(), allowed_updates: ["message"] });
    if (r.ok) {
      await saveAccount("telegram", { meta: { webhook: `${base}/api/integrations/telegram/webhook` } });
      await logActivity({ action: "integration.connect", actor: "user", summary: "Connected Telegram bot" });
    }
    return { ok: r.ok, detail: r.description ?? (r.ok ? "Webhook registered" : "Failed") };
  },
  async disconnect() {
    await tgApi("deleteWebhook");
    await deleteAccount("telegram");
  },
  tools: [],
  publicRoutes(router: Router) {
    router.post("/telegram/webhook", express.json(), async (req, res) => {
      res.sendStatus(200); // acknowledge immediately; Telegram retries slow webhooks
      if (req.get("x-telegram-bot-api-secret-token") !== tgSecret()) return;
      const msg = req.body?.message;
      if (!msg) return;
      const chatId = String(msg.chat.id);
      if (!env.TELEGRAM_OWNER_CHAT_ID) {
        await telegramSend(`Hi! Your chat ID is ${chatId}. Add it as TELEGRAM_OWNER_CHAT_ID in Secrets, restart Mira, and talk to me here.`, chatId);
        return;
      }
      if (chatId !== env.TELEGRAM_OWNER_CHAT_ID) {
        await telegramSend("Sorry, this assistant is private.", chatId);
        return;
      }
      try {
        let text: string | null = msg.text ?? null;
        if (!text && msg.voice) text = await telegramVoiceToText(msg.voice.file_id);
        if (!text || text === "/start") {
          await telegramSend("Mira here 💜 Ask me anything — tasks, meetings, emails, numbers. / ميرا هنا، اسألني أي شيء.");
          return;
        }
        await tgApi("sendChatAction", { chat_id: chatId, action: "typing" });
        const reply = await (await inbound()).handleInbound("telegram", text);
        await telegramSend(reply);
      } catch (e) {
        console.error("[telegram]", e);
        await telegramSend("Something went wrong on my side. / حدث خطأ.");
      }
    });
  },
};

// ─── WhatsApp Business Cloud API ─────────────────────────────────────────────
export async function whatsappSend(to: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body: text.slice(0, 4000) } }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  return true;
}

const whatsappSendTool = defineTool({
  name: "send_whatsapp_message",
  description: "Send a WhatsApp message to a phone number (international format). Requires owner confirmation.",
  agents: ["chief", "sales"],
  confirm: true,
  mutates: true,
  schema: z.object({ to: z.string(), text: z.string(), recipientName: z.string().nullish() }),
  summarize: (a, lang) => L(lang, `Send WhatsApp to ${a.recipientName ?? a.to}: “${a.text.slice(0, 80)}”`, `إرسال واتساب إلى ${a.recipientName ?? a.to}`),
  async run(a, ctx) {
    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { say: L(ctx.lang, "WhatsApp isn't configured — add WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID.", "واتساب غير مهيأ.") };
    await whatsappSend(a.to, a.text);
    return { say: L(ctx.lang, `WhatsApp sent to ${a.recipientName ?? a.to}.`, `تم إرسال واتساب إلى ${a.recipientName ?? a.to}.`) };
  },
});

export const whatsappPlugin: IntegrationPlugin = {
  id: "whatsapp",
  name: "WhatsApp Business",
  description: "Talk to Mira on WhatsApp and let her send messages (with your approval).",
  category: "messaging",
  requiredSecrets: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_OWNER_NUMBER"],
  async status() {
    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return { configured: false, connected: false };
    const r = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } }).catch(() => null);
    if (!r?.ok) return { configured: true, connected: false, detail: `Graph API check failed${r ? ` (${r.status})` : ""}.` };
    const d = (await r.json()) as { display_phone_number: string; verified_name: string };
    const acc = await getAccount("whatsapp");
    return {
      configured: true,
      connected: true,
      account: `${d.verified_name} ${d.display_phone_number}`,
      detail: acc?.meta ? undefined : "Set the webhook in Meta to /api/integrations/whatsapp/webhook with your verify token.",
    };
  },
  tools: [whatsappSendTool],
  publicRoutes(router: Router) {
    // Meta webhook verification handshake
    router.get("/whatsapp/webhook", async (req, res) => {
      if (req.query["hub.mode"] === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && req.query["hub.verify_token"] === env.WHATSAPP_VERIFY_TOKEN) {
        await saveAccount("whatsapp", { meta: { verifiedAt: new Date().toISOString() } });
        return res.status(200).send(String(req.query["hub.challenge"]));
      }
      res.sendStatus(403);
    });
    router.post("/whatsapp/webhook", express.json(), async (req, res) => {
      res.sendStatus(200);
      const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg || msg.type !== "text") return;
      if (env.WHATSAPP_OWNER_NUMBER && msg.from !== env.WHATSAPP_OWNER_NUMBER) return; // private assistant
      try {
        const reply = await (await inbound()).handleInbound("whatsapp", msg.text.body);
        await whatsappSend(msg.from, reply);
      } catch (e) {
        console.error("[whatsapp]", e);
      }
    });
  },
};

