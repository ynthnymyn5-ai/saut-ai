import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murshidak-admin-'));
delete process.env.DATABASE_URL;
process.env.ADMIN_PHONES = '+965 6555 0001'; // formatted on purpose: must be normalised
const { createApp } = await import('../server.js');
const app = createApp({ dataDir, demoAccounts: false });
await app.locals.ready;
const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://localhost:${server.address().port}/api`;
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); delete process.env.ADMIN_PHONES; });

const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
async function login(phone) {
  const { devCode } = await (await post('/auth/request-otp', { phone })).json();
  const res = await post('/auth/verify', { phone, code: devCode });
  return { cookie: res.headers.get('set-cookie').split(';')[0], user: (await res.json()).user };
}

test('without sample accounts, the library and agents are still seeded but no users are', async () => {
  const db = app.locals.db();
  assert.equal((await db.get('SELECT CAST(COUNT(*) AS INTEGER) c FROM procedures')).c, 20);
  assert.ok((await db.get('SELECT CAST(COUNT(*) AS INTEGER) c FROM agents')).c > 0);
  assert.equal((await db.get("SELECT CAST(COUNT(*) AS INTEGER) c FROM users WHERE phone IN ('99999999','98888888','90000000')")).c, 0);
});

test('there is no default admin number', async () => {
  const { user, cookie } = await login('90000000');
  assert.equal(user.role, 'user');
  assert.equal((await fetch(base + '/admin/stats', { headers: { Cookie: cookie } })).status, 403);
});

test('a number in ADMIN_PHONES becomes admin, including an account that already existed', async () => {
  const db = app.locals.db();
  await db.run("INSERT INTO users (phone,name,role) VALUES ('65550001','موجود','user')");
  const { user, cookie } = await login('65550001');
  assert.equal(user.role, 'admin');
  assert.equal((await fetch(base + '/admin/stats', { headers: { Cookie: cookie } })).status, 200);
});
