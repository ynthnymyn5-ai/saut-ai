// Readiness, unmatched-request log, chat + document sharing, agent payments/payouts,
// licence review, smart questions, company teams, export, bulk requests, calendar.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'murshidak-growth-'));
const databaseUrl = process.env.TEST_DATABASE_URL || undefined;
if (databaseUrl) process.env.MURSHIDAK_SECRET ||= 'test-secret-for-postgres-suite';
for (const k of ['OPENAI_API_KEY', 'TWILIO_ACCOUNT_SID', 'MYFATOORAH_API_KEY', 'ADMIN_PHONES']) delete process.env[k];

const realFetch = globalThis.fetch;
const fake = { invoices: {} };
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'localhost') return realFetch(url, opts);
  const b = JSON.parse(opts.body || '{}');
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.pathname === '/v2/SendPayment') { const id = String(5000 + Object.keys(fake.invoices).length); fake.invoices[id] = b; return json({ IsSuccess: true, Data: { InvoiceId: Number(id), InvoiceURL: `https://pay.example/${id}` } }); }
  if (u.pathname === '/v2/GetPaymentStatus') { const inv = fake.invoices[b.Key]; return json({ IsSuccess: true, Data: { InvoiceId: Number(b.Key), InvoiceStatus: 'Paid', InvoiceValue: inv.InvoiceValue, UserDefinedField: inv.UserDefinedField } }); }
  return json({});
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
// One session per number: the OTP endpoint allows only 3 codes per number per 10 minutes.
const sessions = {};
async function login(phone) {
  if (sessions[phone]) {
    const me = await call('GET', '/me', null, sessions[phone].cookie);
    if (me.status === 200) return { cookie: sessions[phone].cookie, user: me.body.user };
  }
  sessions[phone] = await freshLogin(phone);
  return sessions[phone];
}
async function freshLogin(phone) {
  const { body } = await call('POST', '/auth/request-otp', { phone });
  const res = await call('POST', '/auth/verify', { phone, code: body.devCode }, null, { raw: true });
  return { cookie: res.headers.get('set-cookie').split(';')[0], user: (await res.json()).user };
}

test('library now has the new procedures and smart questions', async () => {
  const { procedures } = (await call('GET', '/procedures')).body;
  assert.ok(procedures.length >= 41);
  const p = (await call('GET', '/procedures/family-visit-visa')).body.procedure;
  assert.equal(p.questions[0].id, 'eligible');
  assert.ok(p.steps.some((s) => s.when === 'eligible=no'));
});

test('readiness: required documents are matched to the wallet for the chosen person', async () => {
  const u = await login('99999999');
  const maid = (await call('GET', '/members', null, u.cookie)).body.members.find((m) => m.relation === 'domestic_worker');
  const r = (await call('GET', `/procedures/domestic-worker-residency-renewal/readiness?member_id=${maid.id}`, null, u.cookie)).body;
  const byType = Object.fromEntries(r.items.filter((i) => i.type).map((i) => [i.type + ':' + (i.memberId === maid.id ? 'worker' : 'sponsor'), i.status]));
  assert.equal(byType['passport:worker'], 'ok');          // 500 days left
  assert.equal(byType['civil_id:worker'], 'expiring');    // 12 days left
  assert.equal(byType['civil_id:sponsor'], 'ok');         // sponsor's own civil ID, 200 days
  assert.ok(r.items.some((i) => i.status === 'manual'));  // the insurance receipt is not a wallet document
  const other = await login('55500300');
  assert.equal((await call('GET', `/procedures/domestic-worker-residency-renewal/readiness?member_id=${maid.id}`, null, other.cookie)).status, 404);
});

test('unmatched requests are logged for the admin', async () => {
  await call('POST', '/ask', { text: 'كيف اطلع تصريح صيد' });
  await call('POST', '/ask', { text: 'كيف أطلع تصريح صيد' });
  await call('POST', '/ask', { text: 'أبي أجدد إقامة الخادمة' });
  const admin = await login('90000000');
  const q = (await call('GET', '/admin/queries', null, admin.cookie)).body;
  const top = q.unmatched[0];
  assert.equal(top.c, 2, 'same request with/without hamza counts together');
  assert.equal(q.unmatched.some((x) => x.sample.includes('الخادمة')), false);
});

test('chat: customer and agent talk; a shared document is visible to the agent only while working', async () => {
  const agent = await db.get("SELECT * FROM agents WHERE status='approved' ORDER BY id LIMIT 1");
  const cust = await login('99999999');
  const docs = (await call('GET', '/documents', null, cust.cookie)).body.documents;
  const doc = docs.find((d) => d.type === 'residency');
  const { id } = (await call('POST', '/bookings', { agent_id: agent.id, procedure_slug: 'domestic-worker-residency-renewal' }, cust.cookie)).body;
  assert.equal((await call('POST', `/bookings/${id}/messages`, { body: 'السلام عليكم', document_id: doc.id }, cust.cookie)).status, 200);
  const ag = await login(agent.phone);
  let m = (await call('GET', `/bookings/${id}/messages`, null, ag.cookie)).body;
  assert.equal(m.role, 'agent');
  assert.equal(m.messages[0].document.viewable, false, 'not before the agent accepts');
  assert.match(m.messages[0].document.number, /^•/);
  await call('PATCH', `/agent/bookings/${id}`, { status: 'accepted' }, ag.cookie);
  m = (await call('GET', `/bookings/${id}/messages`, null, ag.cookie)).body;
  assert.equal(m.messages[0].document.number, '20-2019-556677');
  assert.equal((await call('POST', `/bookings/${id}/messages`, { body: 'وعليكم السلام، أرسل الجواز', document_id: doc.id }, ag.cookie)).status, 403, 'agent cannot attach wallet docs');
  assert.equal((await call('POST', `/bookings/${id}/messages`, { body: 'وعليكم السلام' }, ag.cookie)).status, 200);
  const n = (await call('GET', '/notifications', null, cust.cookie)).body.notifications;
  assert.ok(n.some((x) => x.kind === 'message'));
  const stranger = await login('55500301');
  assert.equal((await call('GET', `/bookings/${id}/messages`, null, stranger.cookie)).status, 404);
});

test('agent fee paid in the app → admin pays the agent out only after the request is done', async () => {
  process.env.MYFATOORAH_API_KEY = 'mf';
  try {
    const agent = await db.get("SELECT * FROM agents WHERE status='approved' ORDER BY id LIMIT 1");
    const cust = await login('99999999');
    const { id } = (await call('POST', '/bookings', { agent_id: agent.id, procedure_slug: 'civil-id-renewal' }, cust.cookie)).body;
    assert.equal((await call('POST', `/bookings/${id}/pay`, {}, cust.cookie)).status, 409, 'not payable until accepted');
    const ag = await login(agent.phone);
    await call('PATCH', `/agent/bookings/${id}`, { status: 'accepted' }, ag.cookie);
    const url = (await call('POST', `/bookings/${id}/pay`, {}, cust.cookie)).body.url;
    const res = await call('GET', `/billing/callback?paymentId=${url.split('/').pop()}`, null, null, { raw: true });
    assert.match(res.headers.get('location'), /#\/bookings\?payment=paid/);
    assert.equal((await call('GET', '/bookings', null, cust.cookie)).body.bookings.find((b) => b.id === id).paid, true);
    const admin = await login('90000000');
    let po = (await call('GET', '/admin/payouts', null, admin.cookie)).body.payouts.find((p) => p.bookingId === id);
    assert.equal(po.net, Math.round((agent.price_kwd * 0.9) * 1000) / 1000);
    assert.equal((await call('PATCH', `/admin/payouts/${po.id}`, {}, admin.cookie)).status, 409, 'not done yet');
    for (const st of ['in_progress', 'done']) await call('PATCH', `/agent/bookings/${id}`, { status: st }, ag.cookie);
    assert.equal((await call('PATCH', `/admin/payouts/${po.id}`, {}, admin.cookie)).status, 200);
    po = (await call('GET', '/admin/payouts', null, admin.cookie)).body.payouts.find((p) => p.bookingId === id);
    assert.equal(po.payoutStatus, 'paid_out');
  } finally { delete process.env.MYFATOORAH_API_KEY; }
});

test('agent licence: uploaded on application, viewable by admins only, approval records the date', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  const { id } = (await call('POST', '/agents/apply', { name: 'مكتب تجربة', phone: '66600002', price: 9, license_number: 'L-123', license_file: { mime: 'image/png', data: png } })).body;
  const admin = await login('90000000');
  const a = (await call('GET', '/admin/agents', null, admin.cookie)).body.agents.find((x) => x.id === id);
  assert.equal(a.licenseNumber, 'L-123'); assert.equal(a.hasLicense, true); assert.equal(a.verifiedAt, null);
  assert.equal((await call('GET', `/admin/agents/${id}/license`, null, admin.cookie, { raw: true })).status, 200);
  const u = await login('55500302');
  assert.equal((await call('GET', `/admin/agents/${id}/license`, null, u.cookie, { raw: true })).status, 403);
  await call('PATCH', `/admin/agents/${id}`, { status: 'approved' }, admin.cookie);
  assert.ok((await call('GET', '/agents')).body.agents.find((x) => x.id === id).verifiedAt);
});

test('company team: a colleague works in the company account; plan and team stay owner-only', async () => {
  const owner = await login('98888888');
  assert.equal((await call('POST', '/team', { phone: '55500400', name: 'موظف HR' }, owner.cookie)).status, 200);
  const staff = await login('55500400');
  assert.equal(staff.user.hasTeams, true);
  const accts = (await call('GET', '/accounts', null, staff.cookie)).body.accounts;
  const company = accts.find((a) => !a.own);
  await call('POST', '/accounts/switch', { id: company.id }, staff.cookie);
  const me = (await call('GET', '/me', null, staff.cookie)).body.user;
  assert.equal(me.account.isTeam, true); assert.equal(me.plan, 'business');
  const emps = (await call('GET', '/members', null, staff.cookie)).body.members.filter((m) => m.relation === 'employee');
  assert.ok(emps.length >= 5, 'sees the company employees');
  assert.equal((await call('POST', '/plan', { plan: 'free' }, staff.cookie)).status, 403);
  assert.equal((await call('GET', '/team', null, staff.cookie)).status, 403);
  // switching to an account you don't belong to is refused
  assert.equal((await call('POST', '/accounts/switch', { id: 1 }, staff.cookie)).status, 403);
  // removing them cuts access immediately
  const team = (await call('GET', '/team', null, owner.cookie)).body.members;
  await call('DELETE', `/team/${team[0].id}`, null, owner.cookie);
  assert.equal((await call('GET', '/me', null, staff.cookie)).body.user.account.isTeam, false);
});

test('business export (masked numbers), bulk booking, calendar file', async () => {
  const owner = await login('98888888');
  const csv = await (await call('GET', '/export/documents.csv', null, owner.cookie, { raw: true })).text();
  assert.match(csv, /الاسم,الصلة/); assert.match(csv, /•••• /); assert.doesNotMatch(csv, /18-1\d{5}/, 'no full numbers');
  const emps = (await call('GET', '/members', null, owner.cookie)).body.members.filter((m) => m.relation === 'employee').slice(0, 3);
  const agent = await db.get("SELECT id FROM agents WHERE status='approved' ORDER BY id LIMIT 1");
  const r = (await call('POST', '/bookings/bulk', { agent_id: agent.id, procedure_slug: 'private-sector-residency-renewal', member_ids: emps.map((e) => e.id) }, owner.cookie)).body;
  assert.equal(r.created, 3);
  const fam = await login('99999999');
  assert.equal((await call('POST', '/bookings/bulk', { agent_id: agent.id, procedure_slug: 'civil-id-renewal', member_ids: [1] }, fam.cookie)).status, 402);
  const ics = await (await call('GET', '/calendar.ics', null, fam.cookie, { raw: true })).text();
  assert.match(ics, /BEGIN:VCALENDAR/); assert.match(ics, /TRIGGER:-P7D/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (await call('GET', '/documents', null, fam.cookie)).body.documents.length);
});

test('admin editor keeps questions and step conditions, and rejects unknown conditions', async () => {
  const admin = await login('90000000');
  const p = (await call('GET', '/admin/procedures', null, admin.cookie)).body.procedures.find((x) => x.slug === 'civil-id-renewal');
  assert.equal(p.questions[0].id, 'nat');
  assert.equal((await call('PUT', `/admin/procedures/${p.id}`, p, admin.cookie)).status, 200);
  const bad = { ...p, steps: [...p.steps, { title: { ar: 'خطوة', en: 'Step' }, entity: 'paci', mode: 'online', when: 'ghost=1' }] };
  assert.equal((await call('PUT', `/admin/procedures/${p.id}`, bad, admin.cookie)).body.error, 'unknown_question_in_condition');
});
