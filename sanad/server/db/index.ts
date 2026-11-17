/** Postgres connection + Drizzle instance. */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "../env";

if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. On Replit, add a PostgreSQL database from the Database tool.");
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: /sslmode=require|neon\.tech/.test(env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
