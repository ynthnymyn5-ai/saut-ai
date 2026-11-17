/**
 * Vercel serverless entry: the same Express app, no listen() and no
 * in-process timer (the scheduler runs via /api/cron/tick, called every
 * minute by Supabase pg_cron). Static files are served by Vercel's CDN.
 */
import { createApp } from "./app";

const app = createApp();
export default app;
