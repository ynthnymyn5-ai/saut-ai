/**
 * Sanad server entry point.
 *   dev:  Express + Vite middleware on one port (default 5000)
 *   prod: Express serving the built client from dist/public
 */
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { ZodError } from "zod";
import { env } from "./env";
import { db, pool, schema } from "./db";
import { eq } from "drizzle-orm";
import { setupAuth, requireAuth } from "./auth/replitAuth";
import { dataRouter } from "./routes/data";
import { assistantRouter } from "./routes/assistant";
import { integrations } from "./integrations/registry";
import { startScheduler } from "./brief/scheduler";
import { ensureEmbeddingsMatchProvider } from "./memory/service";
import { llm } from "./llm";

async function main() {
  // Make sure pgvector exists and the schema was pushed before serving
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  const { rows } = await pool.query("select to_regclass('public.tasks') as t");
  if (!rows[0].t) {
    console.error("Database schema missing — run `npm run db:setup` first.");
    process.exit(1);
  }

  const app = express();
  app.disable("x-powered-by");
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

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

  if (env.isProd) {
    const dist = path.resolve(import.meta.dirname, "public");
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({ configFile: path.resolve(import.meta.dirname, "../vite.config.ts"), server: { middlewareMode: true }, appType: "custom" });
    app.use(vite.middlewares);
    app.get(/^(?!\/api).*/, async (req, res, next) => {
      try {
        const html = fs.readFileSync(path.resolve(import.meta.dirname, "../client/index.html"), "utf8");
        res.status(200).set({ "Content-Type": "text/html" }).end(await vite.transformIndexHtml(req.originalUrl, html));
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`✨ Sanad running on http://localhost:${env.PORT}  (AI: ${llm().name})`);
  });

  startScheduler();
  ensureEmbeddingsMatchProvider().catch((e) => console.error("[memory] re-embed check failed", e));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
