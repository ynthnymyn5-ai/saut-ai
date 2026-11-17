/** Postgres connection + Drizzle instance. */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "../env";

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. On Replit, add a PostgreSQL database from the Database tool.");
  process.exit(1);
}

// node-postgres turns `sslmode=require` into full certificate verification,
// which hosted poolers (Supabase, Neon) fail; TLS is configured below instead.
const connectionString = env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");

export const pool = new pg.Pool({
  connectionString,
  ssl: /sslmode=require|neon\.tech|supabase\.com/.test(env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  // Serverless functions each hold a small pool; a VM can use more.
  max: process.env.VERCEL ? 3 : 10,
  idleTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });
export { schema };
