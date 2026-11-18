/**
 * Browser push notifications (Web Push / VAPID). If VAPID keys aren't in
 * Secrets, a key pair is generated once and stored in the settings table.
 */
import * as webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";

let ready: Promise<{ publicKey: string }> | null = null;

export function initPush() {
  return (ready ??= (async () => {
    let publicKey = env.VAPID_PUBLIC_KEY;
    let privateKey = env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "vapid"));
      if (row) ({ publicKey, privateKey } = row.value as { publicKey: string; privateKey: string });
      else {
        ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
        await db.insert(schema.settings).values({ key: "vapid", value: { publicKey, privateKey } });
      }
    }
    webpush.setVapidDetails(env.VAPID_SUBJECT, publicKey, privateKey);
    return { publicKey };
  })());
}

export async function saveSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await db.insert(schema.pushSubscriptions).values({ endpoint: sub.endpoint, keys: sub.keys }).onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { keys: sub.keys } });
}

export async function removeSubscription(endpoint: string) {
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
}

/** Send to every registered device; prunes expired subscriptions. Returns delivered count. */
export async function notifyAll(payload: { title: string; body: string; url?: string; tag?: string }) {
  await initPush();
  const subs = await db.select().from(schema.pushSubscriptions);
  let ok = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify(payload));
        ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await removeSubscription(s.endpoint);
        else console.error("[push] send failed", code, (e as Error).message);
      }
    }),
  );
  return ok;
}
