/**
 * Talking to Sanad: chat turns, voice (STT/TTS), pending-action approvals,
 * the daily brief, integrations, push subscriptions and app status.
 */
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { runTurn, detectLang } from "../agents/orchestrator";
import { resolvePending, toDTO, allTools } from "../tools/registry";
import { llm } from "../llm";
import { AGENT_IDS, type AgentId } from "@shared/agents";
import { generateBrief } from "../brief/dailyBrief";
import { runMorningBrief } from "../brief/scheduler";
import { integrations, integrationById } from "../integrations/registry";
import { initPush, saveSubscription, removeSubscription, notifyAll } from "../push/webpush";
import { env, baseUrl } from "../env";
import { logActivity } from "../lib/activity";
import type { IntegrationStatusDTO } from "@shared/types";
import { createRealtimeSecret, realtimeAvailable } from "../llm/realtime";
import { generateWeeklyReport, runAutoFollowUps, invoiceUrl } from "../tools/business";
import { invokeTool } from "../tools/registry";

export const assistantRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ─── Chat ────────────────────────────────────────────────────────────────────
assistantRouter.post("/chat", async (req, res) => {
  const b = z
    .object({ message: z.string().min(1).max(8000), conversationId: z.number().int().nullish(), agentId: z.string().nullish() })
    .parse(req.body);
  const agentId = (AGENT_IDS.includes(b.agentId as AgentId) ? b.agentId : "chief") as AgentId;
  res.json(await runTurn({ text: b.message, conversationId: b.conversationId ?? undefined, agentId, channel: "web" }));
});

// ─── Live voice (Realtime) ───────────────────────────────────────────────────
assistantRouter.post("/realtime/session", async (_req, res) => {
  if (!realtimeAvailable()) return res.status(503).json({ error: "realtime_not_configured", message: "Live voice needs OPENAI_API_KEY." });
  res.json(await createRealtimeSecret());
});
/** The realtime model's `ask_sanad` tool: one full Sanad turn (agents, memory, approvals). */
assistantRouter.post("/realtime/ask", async (req, res) => {
  const b = z.object({ request: z.string().min(1).max(4000), conversationId: z.number().int().nullish() }).parse(req.body);
  res.json(await runTurn({ text: b.request, conversationId: b.conversationId ?? undefined, agentId: "chief", channel: "web" }));
});

// ─── Pending actions (confirmation modal) ────────────────────────────────────
assistantRouter.get("/actions/pending", async (_req, res) => {
  const rows = await db.select().from(schema.pendingActions).where(eq(schema.pendingActions.status, "pending")).orderBy(desc(schema.pendingActions.createdAt)).limit(20);
  res.json(rows.map(toDTO));
});
assistantRouter.post("/actions/:id/:decision", async (req, res) => {
  const decision = req.params.decision;
  if (decision !== "confirm" && decision !== "cancel") return res.status(400).json({ error: "decision must be confirm|cancel" });
  const lang = req.body?.lang === "ar" ? "ar" : "en";
  res.json(await resolvePending(Number(req.params.id), decision === "confirm", lang));
});

// ─── Voice ───────────────────────────────────────────────────────────────────
assistantRouter.get("/voice/status", (_req, res) => {
  res.json({ serverVoice: llm().supportsVoice, provider: llm().name });
});
assistantRouter.post("/voice/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "audio file required" });
  if (!llm().supportsVoice) return res.status(503).json({ error: "voice_not_configured" });
  const ext = req.file.mimetype.includes("mp4") ? "mp4" : req.file.mimetype.includes("ogg") ? "ogg" : "webm";
  const r = await llm().transcribe(req.file.buffer, `speech.${ext}`, (req.body?.language as string) || undefined);
  res.json({ text: r.text, language: r.language ?? detectLang(r.text) });
});
assistantRouter.post("/voice/speak", async (req, res) => {
  const b = z.object({ text: z.string().min(1).max(4000), lang: z.enum(["en", "ar"]).optional() }).parse(req.body);
  if (!llm().supportsVoice) return res.status(503).json({ error: "voice_not_configured" });
  // strip markdown so TTS doesn't read symbols aloud
  const clean = b.text.replace(/[*_#`>|]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").replace(/https?:\/\/\S+/g, "");
  const audio = await llm().speak(clean, b.lang ?? detectLang(b.text));
  res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }).send(audio);
});

// ─── Daily brief ─────────────────────────────────────────────────────────────
assistantRouter.get("/brief", async (req, res) => {
  const lang = req.query.lang === "ar" ? "ar" : "en";
  res.json(await generateBrief(lang, req.query.refresh === "1"));
});
assistantRouter.post("/brief/send", async (_req, res) => {
  await runMorningBrief(true);
  res.json({ ok: true });
});

// ─── Weekly report, invoices, follow-ups ─────────────────────────────────────
assistantRouter.get("/reports/weekly", async (req, res) => {
  res.json(await generateWeeklyReport(req.query.lang === "ar" ? "ar" : "en", req.query.refresh === "1"));
});
assistantRouter.get("/finance/invoices/:id/link", (req, res) => {
  res.json({ url: invoiceUrl(Number(req.params.id)) });
});
/** Queues the email for approval — the confirmation modal does the rest. */
assistantRouter.post("/finance/invoices/:id/send", async (req, res) => {
  const b = z.object({ to: z.string().email(), lang: z.enum(["en", "ar"]).optional() }).parse(req.body);
  const r = await invokeTool("send_invoice", { invoiceId: Number(req.params.id), to: b.to }, { agentId: "finance", lang: b.lang ?? "en", channel: "web" });
  res.json({ pending: r.pending ?? null, say: r.output.say });
});
assistantRouter.post("/sales/followups", async (req, res) => {
  const lang = req.body?.lang === "ar" ? "ar" : "en";
  const queued = await runAutoFollowUps(5, lang);
  const ids = queued.map((q) => q.pendingId).filter(Boolean) as number[];
  const pending = ids.length ? (await db.select().from(schema.pendingActions)).filter((p) => ids.includes(p.id)).map(toDTO) : [];
  res.json({ queued, pending });
});

// ─── Integrations ────────────────────────────────────────────────────────────
assistantRouter.get("/integrations", async (_req, res) => {
  const out: IntegrationStatusDTO[] = await Promise.all(
    integrations.map(async (i) => {
      const s = await i.status().catch((e) => ({ configured: true, connected: false, detail: (e as Error).message }));
      return {
        id: i.id,
        name: i.name,
        description: i.description,
        category: i.category,
        requiredSecrets: i.requiredSecrets,
        connectUrl: i.connectUrl,
        canDisconnect: Boolean(i.disconnect),
        ...s,
      };
    }),
  );
  res.json(out);
});
assistantRouter.post("/integrations/:id/connect", async (req, res) => {
  const p = integrationById(String(req.params.id));
  if (!p?.connect) return res.status(400).json({ error: "This integration connects via OAuth or webhook settings." });
  res.json(await p.connect(baseUrl(req.get("host"))));
});
assistantRouter.post("/integrations/:id/disconnect", async (req, res) => {
  const p = integrationById(String(req.params.id));
  if (!p?.disconnect) return res.status(400).json({ error: "Not supported" });
  await p.disconnect();
  await logActivity({ action: "integration.disconnect", actor: "user", summary: `Disconnected ${p.name}` });
  res.json({ ok: true });
});

// ─── Push notifications ──────────────────────────────────────────────────────
assistantRouter.get("/push/key", async (_req, res) => {
  res.json(await initPush());
});
assistantRouter.post("/push/subscribe", async (req, res) => {
  const b = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string(), auth: z.string() }) }).parse(req.body);
  await saveSubscription(b);
  res.json({ ok: true });
});
assistantRouter.post("/push/unsubscribe", async (req, res) => {
  await removeSubscription(String(req.body?.endpoint ?? ""));
  res.json({ ok: true });
});
assistantRouter.post("/push/test", async (_req, res) => {
  const n = await notifyAll({ title: "Sanad 💜", body: "Notifications are working. / الإشعارات تعمل.", url: "/" });
  res.json({ delivered: n });
});

// ─── Settings & status ───────────────────────────────────────────────────────
assistantRouter.get("/status", async (_req, res) => {
  const [lang] = await db.select().from(schema.settings).where(eq(schema.settings.key, "preferred_lang"));
  res.json({
    provider: llm().name,
    aiConfigured: llm().isReal,
    serverVoice: llm().supportsVoice,
    realtime: realtimeAvailable(),
    webSearch: Boolean(env.TAVILY_API_KEY),
    timezone: env.TZ,
    briefHour: env.BRIEF_HOUR,
    currency: env.CURRENCY,
    preferredLang: lang?.value ?? "en",
    toolCount: allTools.length,
    confirmTools: allTools.filter((t) => t.confirm).map((t) => t.name),
  });
});
assistantRouter.put("/settings/lang", async (req, res) => {
  const lang = req.body?.lang === "ar" ? "ar" : "en";
  await db.insert(schema.settings).values({ key: "preferred_lang", value: lang }).onConflictDoUpdate({ target: schema.settings.key, set: { value: lang, updatedAt: new Date() } });
  res.json({ ok: true });
});
