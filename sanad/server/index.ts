/**
 * Sanad long-running server (local dev, Replit, any VM).
 *   dev:  Express + Vite middleware on one port (default 5000)
 *   prod: Express serving the built client from dist/public
 * On Vercel, server/vercel.ts is used instead (no listen, no in-process timer).
 */
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { env } from "./env";
import { pool } from "./db";
import { createApp } from "./app";
import { startScheduler } from "./brief/scheduler";
import { ensureEmbeddingsMatchProvider } from "./memory/service";
import { llm } from "./llm";

async function main() {
  // Make sure pgvector exists and the schema was pushed before serving
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  const { rows } = await pool.query("select to_regclass('tasks') as t");
  if (!rows[0].t) {
    console.error("Database schema missing — run `npm run db:setup` first.");
    process.exit(1);
  }

  const app = createApp();

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
