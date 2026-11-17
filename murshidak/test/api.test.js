import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murshidak-test-'));
delete process.env.OPENAI_API_KEY; // always exercise the local matcher in tests
// Set TEST_DATABASE_URL to run the same suite against Postgres (it must point at an empty schema).
const databaseUrl = process.env.TEST_DATABASE_URL || undefined;
if (databaseUrl) process.env.MURSHIDAK_SECRET ||= 'test-secret-for-postgres-suite';
const { createApp } = await import('../server.js');
let server, base, app;

before(async () => {
  app = createApp({ dataDir, databaseUrl, demoAccounts: true });
  await app.locals.ready;
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}/api`;
});
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

async function call(method, p, body, cookie) {
  const res = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const isJson = (res.headers.get('content-type') || '').includes('json');
  return { status: res.status, body: isJson ? await res.json() : Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
async function login(phone) {
  const r = await call('POST', '/auth/request-otp', { phone });
  assert.equal(r.status, 200);
  const v = await call('POST', '/auth/verify', { phone, code: r.body.devCode, name: 'Test' });
  assert.equal(v.status, 200);
  return { cookie: v.headers.get('set-cookie').split(';')[0], user: v.body.user, isNew: v.body.isNew };
}

test('seeded library has 20 procedures and every one carries steps and documents', async () => {
  const r = await call('GET', '/procedures');
  assert.equal(r.body.procedures.length, 20);
  const one = await call('GET', '/procedures/domestic-worker-residency-renewal');
  assert.ok(one.body.procedure.steps.length >= 3);
  assert.ok(one.body.procedure.documents.length >= 2);
  assert.equal(one.body.procedure.keywords, undefined, 'keywords are internal');
});

test('OTP: wrong code rejected, invalid phone rejected, new user gets a self member', async () => {
  assert.equal((await call('POST', '/auth/request-otp', { phone: '123' })).status, 400);
  await call('POST', '/auth/request-otp', { phone: '55500001' });
  assert.equal((await call('POST', '/auth/verify', { phone: '55500001', code: '000000' })).body.error, 'otp_wrong');
  const { cookie, isNew, user } = await login('55500002');
  assert.equal(isNew, true);
  assert.equal(user.plan, 'free');
  const m = await call('GET', '/members', null, cookie);
  assert.equal(m.body.members[0].relation, 'self');
  assert.equal((await call('GET', '/dashboard')).status, 401);
});

test('request understanding maps Kuwaiti dialect to procedures', async () => {
  const cases = {
    'أبي أجدد إقامة الخادمة': 'domestic-worker-residency-renewal',
    'أبي أطلع رخصة تجارية': 'commercial-license-issuance',
    'ابي اجدد الليسن': 'driving-license-renewal',
    'ابي انقل كفالة الخدامة': 'domestic-worker-transfer',
    'I want to renew my passport': 'kuwaiti-passport-renewal',
  };
  for (const [text, slug] of Object.entries(cases)) {
    const r = await call('POST', '/ask', { text });
    assert.equal(r.body.match?.slug, slug, text);
  }
  const none = await call('POST', '/ask', { text: 'كيف اطلع تصريح صيد' });
  assert.equal(none.body.match, null);
  assert.match(none.body.reply.ar, /مندوب/);
});

test('ID numbers are masked in lists and only revealed on explicit request', async () => {
  const { cookie } = await login('99999999');
  const list = await call('GET', '/documents', null, cookie);
  const raw = JSON.stringify(list.body);
  assert.ok(!raw.includes('287031501234'), 'full civil ID must not appear in list');
  const civil = list.body.documents.find((d) => d.type === 'civil_id' && d.member_relation === 'self');
  assert.equal(civil.numberMasked, '•••• 1234');
  const full = await call('GET', `/documents/${civil.id}/number`, null, cookie);
  assert.equal(full.body.number, '287031501234');
});

test('expiry levels and reminders (30 / 7 days) are generated for paid plans', async () => {
  const { cookie } = await login('99999999');
  const docs = (await call('GET', '/documents', null, cookie)).body.documents;
  for (const d of docs) assert.equal(d.level, d.daysLeft < 30 ? 'red' : d.daysLeft < 90 ? 'yellow' : 'green');
  const n = (await call('GET', '/notifications', null, cookie)).body.notifications;
  assert.ok(n.some((x) => x.kind === 'expiry_30'));
  const self = (await call('GET', '/members', null, cookie)).body.members.find((m) => m.relation === 'self');
  const add = await call('POST', '/documents', { member_id: self.id, type: 'other', number: 'X1', expiry_date: new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10) }, cookie);
  const n2 = (await call('GET', '/notifications', null, cookie)).body.notifications.filter((x) => x.link === `#/wallet/doc/${add.body.id}`);
  assert.deepEqual(n2.map((x) => x.kind).sort(), ['expiry_30', 'expiry_7']);
});

test('free plan: 3 documents max, no employees', async () => {
  const { cookie } = await login('55500003');
  const self = (await call('GET', '/members', null, cookie)).body.members[0];
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/documents', { member_id: self.id, type: 'passport', number: 'P' + i, expiry_date: '2030-01-01' }, cookie)).status, 200);
  const r = await call('POST', '/documents', { member_id: self.id, type: 'passport', expiry_date: '2030-01-01' }, cookie);
  assert.equal(r.status, 402);
  assert.equal(r.body.error, 'plan_limit');
  assert.equal((await call('POST', '/members', { name: 'E', relation: 'employee' }, cookie)).status, 402);
});

test('uploads are encrypted at rest, owner-only, and type-checked', async () => {
  const a = await login('55500004');
  const b = await login('55500005');
  const self = (await call('GET', '/members', null, a.cookie)).body.members[0];
  const { body: { id } } = await call('POST', '/documents', { member_id: self.id, type: 'civil_id', expiry_date: '2030-01-01' }, a.cookie);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.equal((await call('PUT', `/documents/${id}/file`, { mime: 'image/jpeg', data: png.toString('base64') }, a.cookie)).status, 415);
  assert.equal((await call('PUT', `/documents/${id}/file`, { mime: 'image/png', data: png.toString('base64') }, a.cookie)).status, 200);
  const stored = await app.locals.db().all('SELECT data FROM files');
  assert.ok(stored.length && stored.every((r) => !Buffer.from(r.data).includes(png)), 'plaintext must not be stored');
  const got = await call('GET', `/documents/${id}/file`, null, a.cookie);
  assert.deepEqual(got.body, png);
  assert.equal((await call('GET', `/documents/${id}/file`, null, b.cookie)).status, 404);
});

test('booking flow: requested → accepted → in_progress → done, admin-only transitions', async () => {
  const u = await login('55500006');
  const r = await call('POST', '/bookings', { agent_id: 1, procedure_slug: 'kuwaiti-passport-renewal' }, u.cookie);
  assert.equal(r.body.status, 'requested');
  assert.equal((await call('PATCH', `/admin/bookings/${r.body.id}`, { status: 'accepted' }, u.cookie)).status, 403);
  const admin = await login('90000000');
  assert.equal((await call('PATCH', `/admin/bookings/${r.body.id}`, { status: 'done' }, admin.cookie)).status, 409, 'cannot skip stages');
  for (const st of ['accepted', 'in_progress', 'done']) assert.equal((await call('PATCH', `/admin/bookings/${r.body.id}`, { status: st }, admin.cookie)).status, 200);
  const mine = (await call('GET', '/bookings', null, u.cookie)).body.bookings[0];
  assert.equal(mine.status, 'done');
  assert.deepEqual(mine.history.map((h) => h.status), ['requested', 'accepted', 'in_progress', 'done']);
  const notes = (await call('GET', '/notifications', null, u.cookie)).body.notifications;
  assert.equal(notes.filter((n) => n.kind === 'booking').length, 3);
});

test('agents: pending ones are hidden until an admin approves them', async () => {
  const applied = await call('POST', '/agents/apply', { name: 'وكيل تجربة', phone: '66600001', price: 9, categories: ['traffic'] });
  assert.equal(applied.body.status, 'pending');
  const visible = async () => (await call('GET', '/agents')).body.agents.some((a) => a.id === applied.body.id);
  assert.equal(await visible(), false);
  const admin = await login('90000000');
  await call('PATCH', `/admin/agents/${applied.body.id}`, { status: 'approved' }, admin.cookie);
  assert.equal(await visible(), true);
});

test('admin can edit a procedure; edits show up in the public roadmap', async () => {
  const admin = await login('90000000');
  const { procedures } = (await call('GET', '/admin/procedures', null, admin.cookie)).body;
  const p = procedures.find((x) => x.slug === 'civil-id-renewal');
  p.fees = { ar: '7 د.ك', en: '7 KWD' };
  p.steps.push({ title: { ar: 'خطوة جديدة', en: 'New step' }, entity: 'paci', mode: 'online' });
  assert.equal((await call('PUT', `/admin/procedures/${p.id}`, p, admin.cookie)).status, 200);
  const pub = (await call('GET', '/procedures/civil-id-renewal')).body.procedure;
  assert.equal(pub.fees.en, '7 KWD');
  assert.equal(pub.steps.at(-1).title.ar, 'خطوة جديدة');
  const user = await login('55500007');
  assert.equal((await call('GET', '/admin/procedures', null, user.cookie)).status, 403);
});
