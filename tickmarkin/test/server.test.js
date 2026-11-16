'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../lib/server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tickmarkin-'));
const dataFile = path.join(tmp, 'db.json');
let server, base;

before(async () => {
  server = createApp({ dataFile, adminPassword: 'secret-pass' });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const valid = { name: 'محمد أحمد', phone: '0551234567', email: 'm@example.com', courseId: 'ielts', mode: 'حضوري', agree: true };

test('pages render with header and footer included', async () => {
  for (const p of ['/', '/courses', '/course?id=ielts', '/departments', '/about', '/contact', '/register', '/admin']) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    assert.ok(!html.includes('<!--#header-->') && !html.includes('<!--#footer-->'), p);
  }
  const home = await (await fetch(base + '/')).text();
  assert.match(home, /سجّل الآن/);
});

test('unknown page returns 404 page; path traversal blocked', async () => {
  const r = await fetch(base + '/nope');
  assert.equal(r.status, 404);
  assert.match(await r.text(), /الصفحة غير موجودة/);
  const t = await fetch(base + '/%2e%2e/lib/server.js');
  assert.ok([403, 404].includes(t.status));
  assert.doesNotMatch(await t.text(), /createApp/);
});

test('catalog lists 4 departments and courses', async () => {
  const c = await (await fetch(base + '/api/catalog')).json();
  assert.equal(c.departments.length, 4);
  assert.ok(c.courses.length >= 12);
  for (const course of c.courses) assert.ok(c.departments.some((d) => d.id === course.dept), course.id);
});

test('registration validates input', async () => {
  const r = await post('/api/register', { name: 'a', phone: '12', courseId: 'x', mode: '?' });
  assert.equal(r.status, 422);
  const b = await r.json();
  assert.deepEqual(Object.keys(b.fields).sort(), ['agree', 'courseId', 'mode', 'name', 'phone']);
});

test('valid registration is stored and visible to admin only', async () => {
  const r = await post('/api/register', { ...valid, phone: '٠٥٥١٢٣٤٥٦٧' });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.match(id, /^TM-/);
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(saved.registrations[0].phone, '0551234567');

  assert.equal((await fetch(base + '/api/admin/data')).status, 401);
  assert.equal((await post('/api/admin/login', { password: 'wrong' })).status, 401);
  const login = await post('/api/admin/login', { password: 'secret-pass' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const data = await (await fetch(base + '/api/admin/data', { headers: { cookie } })).json();
  assert.equal(data.stats.total, 1);
  assert.equal(data.registrations[0].id, id);

  const patch = await fetch(base + '/api/admin/registrations/' + id, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'confirmed' }) });
  assert.equal(patch.status, 200);
  const csv = await (await fetch(base + '/api/admin/export.csv', { headers: { cookie } })).text();
  assert.match(csv, /محمد أحمد/);

  const logout = await fetch(base + '/api/admin/logout', { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);

  // tampered or forged session cookies are rejected
  const forged = cookie.replace(/^tm_admin=(\d+)/, (_, exp) => 'tm_admin=' + (Number(exp) + 1));
  assert.equal((await fetch(base + '/api/admin/data', { headers: { cookie: forged } })).status, 401);
  assert.equal((await fetch(base + '/api/admin/data', { headers: { cookie: 'tm_admin=9999999999999.x.y' } })).status, 401);
});

test('honeypot submissions are silently dropped', async () => {
  const before = JSON.parse(fs.readFileSync(dataFile, 'utf8')).registrations.length;
  const r = await post('/api/register', { ...valid, website: 'spam.com' });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).registrations.length, before);
});

test('contact message stored', async () => {
  assert.equal((await post('/api/contact', { name: 'سارة', contact: 'bad', message: 'hi' })).status, 422);
  assert.equal((await post('/api/contact', { name: 'سارة', contact: 's@example.com', subject: 'استفسار', message: 'متى تبدأ الدورة؟' })).status, 201);
  assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).messages.length, 1);
});

test('cross-origin POST rejected', async () => {
  const r = await post('/api/register', valid, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('CSV export neutralises formula injection', async () => {
  await post('/api/register', { ...valid, name: '=HYPERLINK("x")' });
  const login = await post('/api/admin/login', { password: 'secret-pass' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const csv = await (await fetch(base + '/api/admin/export.csv', { headers: { cookie } })).text();
  assert.match(csv, /"'=HYPERLINK/);
});
