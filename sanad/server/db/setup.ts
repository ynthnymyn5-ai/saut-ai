/**
 * One-shot database setup: enables pgvector, pushes the Drizzle schema and
 * seeds sample data if the database is empty.
 *   npm run db:setup
 */
import { execSync } from "node:child_process";
import { pool } from "./index";

async function main() {
  console.log("→ Enabling pgvector extension");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  console.log("→ Pushing schema (drizzle-kit push)");
  execSync("npx drizzle-kit push --force", { stdio: "inherit" });
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM tasks");
  if (rows[0].n === 0) {
    console.log("→ Empty database, seeding sample data");
    const { seed } = await import("./seed");
    await seed();
  } else {
    console.log("→ Data already present, skipping seed (run `npm run db:seed` to reset)");
  }
  await pool.end();
  console.log("✓ Database ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
