'use strict';
// Runs the site against a local mock of Supabase's REST API (PostgREST),
// checking the exact requests the server sends and the round trip of every admin action.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../lib/server');

const KEY = 'sb_secret_test_key';
const tables = { tm_registrations: [], tm_messages: [] };
const seen = [];
let mock, app, base;

function mockPostgrest(req, res) {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    seen.push({ method: req.method, path: u.pathname, apikey: req.headers.apikey, auth: req.headers.authorization });
    if (req.headers.apikey !== KEY) { res.writeHead(401); return res.end('{"message":"bad key"}'); }
    const name = u.pathname.replace('/rest/v1/', '');
    const rows = tables[name];
    if (!rows) { res.writeHead(404); return res.end('{}'); }
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (req.method === 'GET') return json(200, [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    if (req.method === 'POST') {
      const row = { created_at: new Date().toISOString(), ...JSON.parse(body) };
      if (name === 'tm_registrations') row.status ??= 'new';
      if (name === 'tm_messages') row.read ??= false;
      rows.push(row);
      return json(201, [row]);
    }
    const i = rows.findIndex((r) => r.id === id);
    if (req.method === 'PATCH') { if (i < 0) return json(200, []); Object.assign(rows[i], JSON.parse(body)); return json(200, [rows[i]]); }
    if (req.method === 'DELETE') { if (i < 0) return json(200, []); return json(200, rows.splice(i, 1)); }
  });
}

before(async () => {
  mock = http.createServer(mockPostgrest);
  await new Promise((r) => mock.listen(0, r));
  app = createApp({ supabaseUrl: `http://127.0.0.1:${mock.address().port}/`, supabaseKey: KEY, adminPassword: 'pw' });
  await new Promise((r) => app.listen(0, r));
  base = `http://127.0.0.1:${app.address().port}`;
});
after(() => { app.close(); mock.close(); });

const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });

test('registration and message are written to Supabase with snake_case columns', async () => {
  const r = await post('/api/register', { name: 'ليان سعد', phone: '0501234567', email: '', courseId: 'web-dev', mode: 'عن بُعد', studentType: 'طالب جامعي', agree: true });
  assert.equal(r.status, 201);
  const row = tables.tm_registrations[0];
  assert.equal(row.course_id, 'web-dev');
  assert.equal(row.course_title, 'تطوير الويب الشامل Full-Stack');
  assert.equal(row.student_type, 'طالب جامعي');
  assert.equal(row.email, null, 'empty strings stored as null');
  assert.equal(row.status, 'new');
  assert.ok(seen.every((s) => s.apikey === KEY && s.auth === undefined), 'sb_secret key sent as apikey only');

  assert.equal((await post('/api/contact', { name: 'عمر', contact: '0559998887', message: 'أريد معرفة المواعيد' })).status, 201);
  assert.equal(tables.tm_messages.length, 1);
});

test('admin reads, updates, exports and deletes through Supabase', async () => {
  const login = await post('/api/admin/login', { password: 'pw' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const h = { cookie, 'Content-Type': 'application/json' };

  const data = await (await fetch(base + '/api/admin/data', { headers: h })).json();
  assert.equal(data.storage, 'supabase');
  assert.equal(data.stats.total, 1);
  assert.equal(data.stats.unreadMessages, 1);
  const reg = data.registrations[0];
  assert.equal(reg.courseTitle, 'تطوير الويب الشامل Full-Stack');
  assert.equal(reg.email, '');

  const patched = await fetch(base + '/api/admin/registrations/' + reg.id, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'confirmed' }) });
  assert.equal(patched.status, 200);
  assert.equal(tables.tm_registrations[0].status, 'confirmed');
  assert.ok(tables.tm_registrations[0].updated_at);

  const msgId = data.messages[0].id;
  assert.equal((await fetch(base + '/api/admin/messages/' + msgId, { method: 'PATCH', headers: h })).status, 200);
  assert.equal(tables.tm_messages[0].read, true);

  const csv = await (await fetch(base + '/api/admin/export.csv', { headers: h })).text();
  assert.match(csv, /ليان سعد/);

  assert.equal((await fetch(base + '/api/admin/registrations/nope', { method: 'DELETE', headers: h })).status, 404);
  assert.equal((await fetch(base + '/api/admin/registrations/' + reg.id, { method: 'DELETE', headers: h })).status, 200);
  assert.equal(tables.tm_registrations.length, 0);
});

test('Supabase failure returns 502, not a fake success', async () => {
  const broken = createApp({ supabaseUrl: `http://127.0.0.1:${mock.address().port}`, supabaseKey: 'wrong', adminPassword: 'pw' });
  await new Promise((r) => broken.listen(0, r));
  const r = await fetch(`http://127.0.0.1:${broken.address().port}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'اختبار خطأ', phone: '0501234567', courseId: 'ielts', mode: 'حضوري', agree: true }),
  });
  assert.equal(r.status, 502);
  broken.close();
});

test('legacy JWT service_role key is also sent as Bearer', async () => {
  seen.length = 0;
  const jwtApp = createApp({ supabaseUrl: `http://127.0.0.1:${mock.address().port}`, supabaseKey: 'a.b.c', adminPassword: 'pw' });
  await new Promise((r) => jwtApp.listen(0, r));
  await fetch(`http://127.0.0.1:${jwtApp.address().port}/api/contact`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'عمر', contact: '0559998887', message: 'رسالة تجربة' }),
  });
  assert.equal(seen[0].auth, 'Bearer a.b.c');
  jwtApp.close();
});

test('Vercel entry restores the rewritten /api path', async () => {
  process.env.SUPABASE_URL = `http://127.0.0.1:${mock.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
  process.env.ADMIN_PASSWORD = 'pw';
  const entry = require('../api/index.js');
  const srv = http.createServer(entry);
  await new Promise((r) => srv.listen(0, r));
  const port = srv.address().port;
  const viaRewrite = await fetch(`http://127.0.0.1:${port}/api/index?__p=catalog`);
  assert.equal(viaRewrite.status, 200);
  assert.equal((await viaRewrite.json()).departments.length, 4);
  const direct = await fetch(`http://127.0.0.1:${port}/api/catalog`);
  assert.equal(direct.status, 200);
  srv.close();
});

test('on Vercel without Supabase keys: catalog works, saving returns 503', async () => {
  const saved = { ...process.env };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; process.env.VERCEL = '1';
  const a = createApp({ adminPassword: 'pw' });
  await new Promise((r) => a.listen(0, r));
  const b = `http://127.0.0.1:${a.address().port}`;
  assert.equal((await fetch(b + '/api/catalog')).status, 200);
  const r = await fetch(b + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'اختبار', phone: '0501234567', courseId: 'ielts', mode: 'حضوري', agree: true }) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'storage_not_configured');
  a.close();
  process.env = saved;
});
