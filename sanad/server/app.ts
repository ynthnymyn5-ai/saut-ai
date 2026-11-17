/**
 * The Express application (API + webhooks + public invoice pages), shared by
 * the long-running server (server/index.ts) and the Vercel function
 * (server/vercel.ts). Static files are added by the caller.
 */
import express, { type NextFunction, type Request, type Response } from "express";
import crypto from "node:crypto";
import { ZodError } from "zod";
import { eq } from "drizzle-orm";
import { env } from "./env";
import { db, schema } from "./db";
import { setupAuth, requireAuth } from "./auth/replitAuth";
import { dataRouter } from "./routes/data";
import { assistantRouter } from "./routes/assistant";
import { integrations } from "./integrations/registry";
import { runScheduledJobs } from "./brief/scheduler";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.get("/api/health", async (_req, res) => {
    // Also proves the database is reachable (used right after a deploy)
    try {
      const { pool } = await import("./db");
      const r = await pool.query("select count(*)::int as tasks from tasks");
      res.json({ ok: true, db: "ok", tasks: r.rows[0].tasks });
    } catch (e) {
      res.status(503).json({ ok: false, db: (e as Error).message });
    }
  });

  // Public webhooks (Telegram/WhatsApp) — authenticated by their own secrets
  const publicRouter = express.Router();
  integrations.forEach((i) => i.publicRoutes?.(publicRouter));
  app.use("/api/integrations", publicRouter);

  // Public, signed invoice links (shared with clients)
  app.get("/invoice/:id/:token", async (req, res) => {
    const id = Number(req.params.id);
    const { invoiceToken, renderInvoiceHtml } = await import("./tools/business");
    if (!Number.isInteger(id) || req.params.token !== invoiceToken(id)) return res.status(404).send("Not found");
    const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
    if (!inv) return res.status(404).send("Not found");
    res.set("Cache-Control", "no-store").type("html").send(renderInvoiceHtml(inv));
  });

  // Scheduler tick for serverless hosting (Supabase pg_cron / Vercel Cron call it every minute)
  app.all("/api/cron/tick", async (req, res) => {
    const given = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const ok = env.CRON_SECRET && given.length === env.CRON_SECRET.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(env.CRON_SECRET));
    if (!ok) return res.status(401).json({ error: "unauthorized" });
    res.json(await runScheduledJobs());
  });

  app.use(express.json({ limit: "2mb" }));
  setupAuth(app);

  // Everything else under /api requires the owner to be signed in
  const privateIntegrations = express.Router();
  integrations.forEach((i) => i.routes?.(privateIntegrations));
  app.use("/api/integrations", requireAuth, privateIntegrations);
  app.use("/api", requireAuth, assistantRouter);
  app.use("/api", requireAuth, dataRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

  // Errors → JSON
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: "invalid_request", issues: err.issues });
    console.error(err);
    res.status(500).json({ error: "server_error", message: (err as Error).message });
  });

  return app;
}
