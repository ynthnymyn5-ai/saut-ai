// New features with outside services simulated: Twilio (SMS/WhatsApp), OpenAI vision, MyFatoorah.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murshidak-feat-'));
const databaseUrl = process.env.TEST_DATABASE_URL || undefined;
if (databaseUrl) process.env.MURSHIDAK_SECRET ||= 'test-secret-for-postgres-suite';
for (const k of ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'TWILIO_WHATSAPP_FROM', 'MYFATOORAH_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'ADMIN_PHONES']) delete process.env[k];

// ---- fake outside world: every non-localhost request is answered here and recorded
const realFetch = globalThis.fetch;
const outbound = [];
const fake = { mfStatus: 'Paid', mfAmount: null, invoices: {} };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'localhost') return realFetch(url, opts);
  const body = opts.body && typeof opts.body === 'string' ? opts.body : '';
  outbound.push({ host: u.hostname, path: u.pathname, body });
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.hostname === 'api.twilio.com') return json({ sid: 'SM' + outbound.length });
  if (u.hostname === 'api.openai.com') {
    return json({ choices: [{ message: { content: JSON.stringify({ type: 'residency', number: '20-2019-556677', expiry_date: '2027-05-31', name: 'MARIA', confidence: 0.9 }) } }] });
  }
  if (u.hostname.includes('myfatoorah')) {
    const b = JSON.parse(body || '{}');
    if (u.pathname === '/v2/SendPayment') {
      const id = String(1000 + outbound.length);
      fake.invoices[id] = { ref: b.UserDefinedField, value: b.InvoiceValue };
      return json({ IsSuccess: true, Data: { InvoiceId: Number(id), InvoiceURL: `https://pay.example/inv/${id}` } });
    }
    if (u.pathname === '/v2/GetPaymentStatus') {
      const id = b.Key.replace('pay-', '');
      const inv = fake.invoices[id];
      return json({ IsSuccess: true, Data: { InvoiceId: Number(id), InvoiceStatus: fake.mfStatus, InvoiceValue: fake.mfAmount ?? inv.value, UserDefinedField: inv.ref } });
    }
  }
  return json({ error: 'unexpected' }, 500);
};

const { createApp } = await import('../server.js');
const app = createApp({ dataDir, databaseUrl, demoAccounts: true });
await app.locals.ready;
const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
const base = `http://localhost:${server.address().port}/api`;
const db = app.locals.db();
after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); globalThis.fetch = realFetch; });

async function call(method, p, body, cookie, { raw } = {}) {
  const res = await fetch(base + p, { method, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return res;
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function login(phone) {
  const r = await call('POST', '/auth/request-otp', { phone });
  let code = r.body.devCode;
  if (!code) code = /: (\d{6})/.exec(decodeURIComponent(outbound.filter((o) => o.host === 'api.twilio.com').at(-1).body.replace(/\+/g, ' ')))[1];
  const res = await call('POST', '/auth/verify', { phone, code }, null, { raw: true });
  return { cookie: res.headers.get('set-cookie').split(';')[0], user: (await res.json()).user };
}

test('migrations are recorded and add the health procedures', async () => {
  const ids = (await db.all('SELECT id FROM schema_migrations ORDER BY id')).map((r) => r.id);
  assert.deepEqual(ids, ['002_features', '003_health_procedures']);
  assert.equal((await db.all("SELECT slug FROM procedures WHERE category='health'")).length, 2);
});

test('with Twilio configured, the OTP goes by SMS and is never returned to the browser', async () => {
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15550000' });
  try {
    assert.equal((await call('GET', '/config')).body.demoOtp, false);
    const r = await call('POST', '/auth/request-otp', { phone: '55512345' });
    assert.equal(r.body.devCode, undefined);
    const sms = outbound.filter((o) => o.host === 'api.twilio.com').at(-1);
    assert.match(decodeURIComponent(sms.body), /To=\+96555512345/);
    const { user } = await login('55512345');
    assert.equal(user.phone, '55512345');
  } finally { for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM']) delete process.env[k]; }
});

test('error reports: anyone can send one, the admin sees and resolves it', async () => {
  assert.equal((await call('POST', '/reports', { slug: 'civil-id-renewal', message: 'الرسوم تغيرت إلى 6 د.ك' })).status, 200);
  const admin = await login('90000000');
  const { reports } = (await call('GET', '/admin/reports', null, admin.cookie)).body;
  assert.equal(reports[0].procedure.slug, 'civil-id-renewal');
  assert.equal((await call('PATCH', `/admin/reports/${reports[0].id}`, { status: 'resolved' }, admin.cookie)).status, 200);
  assert.equal((await call('GET', '/admin/stats', null, admin.cookie)).body.openReports, 0);
});

test('agent portal and ratings: the agent moves the request, the customer rates once', async () => {
  const agent = await db.get('SELECT * FROM agents WHERE status=? ORDER BY id LIMIT 1', 'approved');
  const cust = await login('55500100');
  const { id } = (await call('POST', '/bookings', { agent_id: agent.id, procedure_slug: 'civil-id-renewal' }, cust.cookie)).body;

  const ag = await login(agent.phone);
  assert.equal(ag.user.isAgent, true);
  const other = await login('55500101');
  assert.equal((await call('GET', '/agent/bookings', null, other.cookie)).status, 403);
  let mine = (await call('GET', '/agent/bookings', null, ag.cookie)).body.bookings.find((b) => b.id === id);
  assert.equal(mine.customerPhone, null, 'phone hidden until accepted');
  assert.equal((await call('POST', `/bookings/${id}/rate`, { rating: 5 }, cust.cookie)).status, 409, 'cannot rate before done');
  for (const st of ['accepted', 'in_progress', 'done']) assert.equal((await call('PATCH', `/agent/bookings/${id}`, { status: st }, ag.cookie)).status, 200);
  mine = (await call('GET', '/agent/bookings', null, ag.cookie)).body.bookings.find((b) => b.id === id);
  assert.equal(mine.status, 'done');

  const before = await db.get('SELECT rating, reviews FROM agents WHERE id=?', agent.id);
  assert.equal((await call('POST', `/bookings/${id}/rate`, { rating: 1, review: 'تأخر' }, cust.cookie)).status, 200);
  assert.equal((await call('POST', `/bookings/${id}/rate`, { rating: 5 }, cust.cookie)).status, 409, 'only once');
  const afterR = await db.get('SELECT rating, reviews FROM agents WHERE id=?', agent.id);
  assert.equal(afterR.reviews, before.reviews + 1);
  const expected = Math.round(((before.rating * before.reviews + 1) / (before.reviews + 1)) * 10) / 10;
  assert.equal(Number(afterR.rating), expected);
});

test('Excel import (Business plan): valid rows become employees with a residency, bad rows are reported', async () => {
  const biz = await login('98888888');
  const r = await call('POST', '/members/import', { rows: [
    { name: 'سالم', nationality: 'مصري', number: '18-999', expiry_date: '2027-01-15' },
    { name: '', expiry_date: '2027-01-15' },
    { name: 'خالد', expiry_date: '15/01/2027' },
  ] }, biz.cookie);
  assert.equal(r.body.imported, 1);
  assert.deepEqual(r.body.errors.map((e) => e.error), ['name_required', 'invalid_date']);
  const fam = await login('99999999');
  assert.equal((await call('POST', '/members/import', { rows: [{ name: 'x', expiry_date: '2027-01-01' }] }, fam.cookie)).status, 402);
});

test('document scan returns parsed fields only when the AI is configured', async () => {
  const u = await login('99999999');
  const img = { mime: 'image/jpeg', data: Buffer.from('ffd8ffe0', 'hex').toString('base64') };
  assert.equal((await call('POST', '/documents/scan', img, u.cookie)).status, 503);
  process.env.OPENAI_API_KEY = 'sk-test';
  try {
    const r = await call('POST', '/documents/scan', img, u.cookie);
    assert.deepEqual([r.body.result.type, r.body.result.number, r.body.result.expiry_date], ['residency', '20-2019-556677', '2027-05-31']);
  } finally { delete process.env.OPENAI_API_KEY; }
});

test('payments: plan is activated only after MyFatoorah confirms the exact amount', async () => {
  process.env.MYFATOORAH_API_KEY = 'mf-test';
  try {
    const u = await login('55500200');
    assert.equal((await call('POST', '/plan', { plan: 'family' }, u.cookie)).status, 402, 'no free upgrade when payments are live');

    // Tampered amount → not activated
    let co = (await call('POST', '/billing/checkout', { plan: 'family' }, u.cookie)).body;
    let inv = co.url.split('/').pop();
    fake.mfAmount = 0.1;
    let res = await call('GET', `/billing/callback?paymentId=pay-${inv}`, null, null, { raw: true });
    assert.match(res.headers.get('location'), /payment=failed/);
    assert.equal((await call('GET', '/me', null, u.cookie)).body.user.plan, 'free');

    // Correct payment → activated for 30 days; replaying the callback does not extend it again
    fake.mfAmount = null;
    co = (await call('POST', '/billing/checkout', { plan: 'family' }, u.cookie)).body;
    inv = co.url.split('/').pop();
    res = await call('GET', `/billing/callback?paymentId=pay-${inv}`, null, null, { raw: true });
    assert.match(res.headers.get('location'), /payment=paid/);
    const me = (await call('GET', '/me', null, u.cookie)).body.user;
    assert.equal(me.plan, 'family');
    await call('GET', `/billing/callback?paymentId=pay-${inv}`, null, null, { raw: true });
    assert.equal((await call('GET', '/me', null, u.cookie)).body.user.planExpiresAt, me.planExpiresAt);

    // Expired period → back to Free on the next request
    await db.run("UPDATE users SET plan_expires_at='2000-01-01 00:00:00' WHERE id=?", me.id);
    assert.equal((await call('GET', '/me', null, u.cookie)).body.user.plan, 'free');
  } finally { delete process.env.MYFATOORAH_API_KEY; fake.mfAmount = null; }
});

test('daily job: protected by CRON_SECRET; delivers each notification once by WhatsApp to users who opted in', async () => {
  assert.equal((await call('GET', '/cron/reminders')).status, 401);
  process.env.CRON_SECRET = 'cron-test';
  Object.assign(process.env, { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_WHATSAPP_FROM: '+15550001' });
  try {
    const u = await login('99999999'); // family plan, has documents expiring soon
    await call('PATCH', '/me', { notifyWhatsapp: true }, u.cookie);
    await db.run('UPDATE notifications SET delivered_at=NULL WHERE user_id=?', u.user.id);
    const run = async () => (await fetch(base + '/cron/reminders', { headers: { Authorization: 'Bearer cron-test' } })).json();
    const first = await run();
    const wa = outbound.filter((o) => o.host === 'api.twilio.com' && decodeURIComponent(o.body).includes('whatsapp:+96599999999'));
    assert.ok(first.sent > 0 && wa.length === first.sent);
    const second = await run();
    assert.equal(second.sent, 0, 'never sent twice');
  } finally { for (const k of ['CRON_SECRET', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']) delete process.env[k]; }
});
