'use strict';
// The site against a mock of the secured tm_api() Postgres function (publishable key + server secret).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createApp } = require('../lib/server');

const PUB = 'sb_publishable_test', SECRET = 'server-secret-xyz';
const TABLES = { registrations: [], messages: [], teachers: [], classes: [], students: [], fees: [], payments: [] };
let mock, app, base;

before(async () => {
  mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = (s, d) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
      if (req.url !== '/rest/v1/rpc/tm_api' || req.headers.apikey !== PUB) return json(401, { message: 'bad key' });
      const b = JSON.parse(body);
      if (b.p_secret !== SECRET) return json(403, { code: '42501', message: 'forbidden' });
      const t = TABLES[b.p_collection];
      const i = t.findIndex((r) => r.id === b.p_id);
      if (b.p_op === 'list') return json(200, [...t].sort((x, y) => y.created_at.localeCompare(x.created_at)));
      if (b.p_op === 'add') { const row = { created_at: new Date().toISOString(), ...b.p_payload }; t.push(row); return json(200, row); }
      if (b.p_op === 'update') { if (i < 0) return json(200, null); Object.assign(t[i], b.p_payload); return json(200, t[i]); }
      if (b.p_op === 'remove') { if (i < 0) return json(200, null); return json(200, t.splice(i, 1)[0]); }
    });
  });
  await new Promise((r) => mock.listen(0, r));
  app = createApp({ supabaseUrl: `http://127.0.0.1:${mock.address().port}`, supabaseKey: '', supabasePublishableKey: PUB, dbSecret: SECRET, adminPassword: 'pw' });
  await new Promise((r) => app.listen(0, r));
  base = `http://127.0.0.1:${app.address().port}`;
});
after(() => { app.close(); mock.close(); });

const call = async (method, p, body, cookie) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
};

test('office works end to end through tm_api()', async () => {
  const login = await call('POST', '/api/admin/login', { password: 'pw' });
  const c = login.headers.get('set-cookie').split(';')[0];
  const t = (await call('POST', '/api/office/teachers', { name: 'أ. هند', phone: '99887766', password: 'abcdef' }, c)).body.record;
  assert.equal(TABLES.teachers[0].phone, '99887766', 'Kuwaiti 8-digit number stored');
  const cl = (await call('POST', '/api/office/classes', { name: 'قدرات', teacherId: t.id, fee: '45.500' }, c)).body.record;
  assert.equal(TABLES.classes[0].teacher_id, t.id, 'snake_case columns');
  const s = (await call('POST', '/api/office/students', { name: 'سارة', classIds: [cl.id] }, c)).body.record;
  assert.deepEqual(TABLES.students[0].class_ids, [cl.id]);
  assert.equal((await call('POST', `/api/office/classes/${cl.id}/charge`, {}, c)).body.count, 1);
  await call('POST', '/api/office/payments', { studentId: s.id, amount: '20.250' }, c);
  const all = (await call('GET', '/api/office/all', null, c)).body;
  assert.equal(all.storage, undefined);
  assert.deepEqual(all.balances[s.id], { charged: 45.5, paid: 20.25 });
  assert.equal((await call('DELETE', '/api/office/students/nope', null, c)).status, 404);
  assert.equal((await call('DELETE', `/api/office/students/${s.id}`, null, c)).status, 200);
  assert.equal(TABLES.students.length, 0);
  const tl = await call('POST', '/api/office/teacher-login', { phone: '99887766', password: 'abcdef' });
  assert.equal(tl.status, 200, 'teacher login via rpc store');
});

test('wrong server secret never succeeds', async () => {
  const bad = createApp({ supabaseUrl: `http://127.0.0.1:${mock.address().port}`, supabaseKey: '', supabasePublishableKey: PUB, dbSecret: 'wrong', adminPassword: 'pw' });
  await new Promise((r) => bad.listen(0, r));
  const r = await fetch(`http://127.0.0.1:${bad.address().port}/api/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'عمر', contact: '99887766', message: 'رسالة تجربة' }) });
  assert.equal(r.status, 502);
  bad.close();
});
