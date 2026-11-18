/** Persistence of provider tokens/metadata in integration_accounts. */
import { eq } from "drizzle-orm";
import { db, schema } from "../db";

export type Account = typeof schema.integrationAccounts.$inferSelect;

export async function getAccount(provider: string): Promise<Account | undefined> {
  const [row] = await db.select().from(schema.integrationAccounts).where(eq(schema.integrationAccounts.provider, provider));
  return row;
}

export async function saveAccount(provider: string, values: Partial<Omit<Account, "provider">>) {
  await db
    .insert(schema.integrationAccounts)
    .values({ provider, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.integrationAccounts.provider, set: { ...values, updatedAt: new Date() } });
}

export async function deleteAccount(provider: string) {
  await db.delete(schema.integrationAccounts).where(eq(schema.integrationAccounts.provider, provider));
}
