'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../lib/server');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-office-'));
let server, base, admin;

before(async () => {
  server = createApp({ dataFile: path.join(tmp, 'db.json'), adminPassword: 'admin-pw' });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'admin-pw' }) });
  admin = r.headers.get('set-cookie').split(';')[0];
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, p, body, cookie = admin) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json, headers: r.headers };
};

const ids = {};

test('office API is closed to anonymous users', async () => {
  for (const p of ['/api/office/all', '/api/office/teacher', '/api/office/me', '/api/office/finance.csv']) {
    assert.equal((await call('GET', p, null, null)).status, 401, p);
  }
  assert.equal((await call('POST', '/api/office/students', { name: 'x' }, null)).status, 401);
});

test('admin creates teachers, classes and students with validation', async () => {
  const bad = await call('POST', '/api/office/teachers', { name: 'ا', phone: '12', password: '1' });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['name', 'password', 'phone']);

  const t1 = await call('POST', '/api/office/teachers', { name: 'أ. محمد', phone: '0551000001', subject: 'رياضيات', password: 'teach-123' });
  assert.equal(t1.status, 201);
  assert.equal(t1.body.record.passwordHash, undefined, 'password hash never returned');
  ids.t1 = t1.body.record.id;
  const dup = await call('POST', '/api/office/teachers', { name: 'آخر', phone: '0551000001', password: 'abcdef' });
  assert.equal(dup.status, 422);
  assert.ok(dup.body.fields.phone);
  ids.t2 = (await call('POST', '/api/office/teachers', { name: 'أ. سارة', phone: '0551000002', subject: 'إنجليزي', password: 'teach-456' })).body.record.id;

  const c1 = await call('POST', '/api/office/classes', { name: 'رياضيات ثالث ثانوي', teacherId: ids.t1, fee: '٥٠٠', schedule: 'الأحد والثلاثاء 5م', capacity: 12 });
  assert.equal(c1.status, 201);
  assert.equal(c1.body.record.fee, 500, 'Arabic digits accepted');
  ids.c1 = c1.body.record.id;
  ids.c2 = (await call('POST', '/api/office/classes', { name: 'إنجليزي مستوى 2', teacherId: ids.t2, fee: 400 })).body.record.id;
  assert.equal((await call('POST', '/api/office/classes', { name: 'صف', teacherId: 'nope' })).status, 422);

  const s1 = await call('POST', '/api/office/students', { name: 'عبدالله', guardianName: 'أبو عبدالله', guardianPhone: '0559000001', grade: 'ثالث ثانوي', classIds: [ids.c1] });
  assert.equal(s1.status, 201);
  ids.s1 = s1.body.record.id;
  ids.s2 = (await call('POST', '/api/office/students', { name: 'ريم', guardianPhone: '0559000002', classIds: [ids.c1, ids.c2] })).body.record.id;
  ids.s3 = (await call('POST', '/api/office/students', { name: 'خالد', classIds: [ids.c2] })).body.record.id;
  assert.equal((await call('POST', '/api/office/students', { name: 'x', classIds: ['nope'] })).status, 422);
});

test('fees, payments and balances', async () => {
  const charged = await call('POST', `/api/office/classes/${ids.c1}/charge`, { description: 'رسوم شهر ديسمبر', dueDate: '2026-12-01' });
  assert.equal(charged.status, 201);
  assert.equal(charged.body.count, 2, 'charged both students in class 1 at class fee');

  assert.equal((await call('POST', '/api/office/fees', { studentId: ids.s3, description: 'رسوم', amount: 0 })).status, 422);
  assert.equal((await call('POST', '/api/office/fees', { studentId: ids.s3, description: 'رسوم إنجليزي', amount: 400 })).status, 201);

  assert.equal((await call('POST', '/api/office/payments', { studentId: ids.s1, amount: 300, method: 'نقداً', paidAt: '2026-11-20' })).status, 201);
  assert.equal((await call('POST', '/api/office/payments', { studentId: ids.s1, amount: 10, method: 'شيك' })).status, 422);
  const fils = await call('POST', '/api/office/fees', { studentId: ids.s3, description: 'كتب', amount: '12.375' });
  assert.equal(fils.body.record.amount, 12.375, 'Kuwaiti fils (3 decimals) kept');
  await call('DELETE', '/api/office/fees/' + fils.body.record.id);

  const all = (await call('GET', '/api/office/all')).body;
  assert.deepEqual(all.balances[ids.s1], { charged: 500, paid: 300 });
  assert.deepEqual(all.balances[ids.s2], { charged: 500, paid: 0 });
  assert.deepEqual(all.balances[ids.s3], { charged: 400, paid: 0 });
  assert.ok(all.teachers.every((t) => t.passwordHash === undefined));

  const csv = (await call('GET', '/api/office/finance.csv')).body;
  assert.match(csv, /عبدالله.*"500\.000","300\.000","200\.000"/);
});

test('teacher logs in and sees only own classes and students, no finances', async () => {
  assert.equal((await call('POST', '/api/office/teacher-login', { phone: '0551000001', password: 'wrong' }, null)).status, 401);
  const login = await call('POST', '/api/office/teacher-login', { phone: '٠٥٥١٠٠٠٠٠١', password: 'teach-123' }, null);
  assert.equal(login.status, 200);
  const tc = login.headers.get('set-cookie').split(';')[0];

  assert.equal((await call('GET', '/api/office/me', null, tc)).body.role, 'teacher');
  const view = (await call('GET', '/api/office/teacher', null, tc)).body;
  assert.deepEqual(view.classes.map((c) => c.id), [ids.c1]);
  assert.deepEqual(view.students.map((s) => s.name).sort(), ['ريم', 'عبدالله'].sort());
  assert.deepEqual(view.students.find((s) => s.name === 'ريم').classIds, [ids.c1], 'other teachers\' classes hidden');
  assert.ok(!JSON.stringify(view).includes('fee'), 'no finance fields');

  // teacher cannot use admin endpoints
  for (const p of ['/api/office/all', '/api/office/finance.csv', '/api/admin/data']) assert.equal((await call('GET', p, null, tc)).status, 401, p);
  assert.equal((await call('POST', '/api/office/students', { name: 'hack' }, tc)).status, 401);

  // deactivated teacher is locked out immediately
  await call('PATCH', `/api/office/teachers/${ids.t1}`, { active: false });
  assert.equal((await call('GET', '/api/office/teacher', null, tc)).status, 401);
  assert.equal((await call('POST', '/api/office/teacher-login', { phone: '0551000001', password: 'teach-123' }, null)).status, 401);
  await call('PATCH', `/api/office/teachers/${ids.t1}`, { active: true, password: 'new-pass-1' });
  assert.equal((await call('POST', '/api/office/teacher-login', { phone: '0551000001', password: 'teach-123' }, null)).status, 401, 'old password rejected');
  assert.equal((await call('POST', '/api/office/teacher-login', { phone: '0551000001', password: 'new-pass-1' }, null)).status, 200);
});

test('deletes cascade consistently', async () => {
  await call('DELETE', `/api/office/classes/${ids.c2}`);
  let all = (await call('GET', '/api/office/all')).body;
  assert.ok(!all.students.find((s) => s.id === ids.s2).classIds.includes(ids.c2), 'class removed from students');

  await call('DELETE', `/api/office/teachers/${ids.t1}`);
  all = (await call('GET', '/api/office/all')).body;
  assert.equal(all.classes.find((c) => c.id === ids.c1).teacherId, '', 'class unassigned');

  await call('DELETE', `/api/office/students/${ids.s1}`);
  all = (await call('GET', '/api/office/all')).body;
  assert.ok(!all.fees.some((f) => f.studentId === ids.s1) && !all.payments.some((p) => p.studentId === ids.s1), 'student finances removed');
  assert.equal((await call('DELETE', `/api/office/students/${ids.s1}`)).status, 404);
});

test('receipt and statement data: running balance, totals, admin only', async () => {
  const t = (await call('POST', '/api/office/teachers', { name: 'أ. نوف', phone: '99001122', password: 'pass-1234' })).body.record;
  const cl = (await call('POST', '/api/office/classes', { name: 'إنجليزي', teacherId: t.id, fee: '150' })).body.record;
  const s = (await call('POST', '/api/office/students', { name: 'جود', guardianName: 'أبو جود', guardianPhone: '99112233', classIds: [cl.id] })).body.record;
  await call('POST', `/api/office/classes/${cl.id}/charge`, { description: 'رسوم يناير' });
  const p1 = (await call('POST', '/api/office/payments', { studentId: s.id, amount: '100', paidAt: '2026-11-01' })).body.record;
  const p2 = (await call('POST', '/api/office/payments', { studentId: s.id, amount: '20.500', paidAt: '2026-11-10', method: 'شبكة / بطاقة' })).body.record;

  const r1 = (await call('GET', `/api/office/print?type=receipt&id=${p1.id}`)).body;
  assert.equal(r1.payment.amount, 100);
  assert.deepEqual(r1.totals, { charged: 150, paidToDate: 100, balanceAfter: 50 });
  assert.equal(r1.institute.currency, 'د.ك');
  const r2 = (await call('GET', `/api/office/print?type=receipt&id=${p2.id}`)).body;
  assert.deepEqual(r2.totals, { charged: 150, paidToDate: 120.5, balanceAfter: 29.5 });

  const st = (await call('GET', `/api/office/print?type=statement&id=${s.id}`)).body;
  assert.deepEqual(st.totals, { charged: 150, paid: 120.5, balance: 29.5 });
  assert.equal(st.entries.at(-1).balance, 29.5, 'running balance ends at the outstanding amount');
  assert.equal(st.student.classes[0], 'إنجليزي');

  assert.equal((await call('GET', `/api/office/print?type=receipt&id=nope`)).status, 404);
  assert.equal((await call('GET', `/api/office/print?type=other&id=${s.id}`)).status, 400);
  assert.equal((await call('GET', `/api/office/print?type=receipt&id=${p1.id}`, null, null)).status, 401);
  const tl = await call('POST', '/api/office/teacher-login', { phone: '99001122', password: 'pass-1234' }, null);
  const tc = tl.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('GET', `/api/office/print?type=statement&id=${s.id}`, null, tc)).status, 401, 'teachers cannot print finances');
});

test('amount in words (Kuwaiti dinar)', () => {
  const { kwdInWords } = require('../site/js/tafqeet.js');
  assert.equal(kwdInWords(150), 'فقط مئة وخمسون ديناراً كويتياً لا غير');
  assert.equal(kwdInWords(200), 'فقط مئتا دينار كويتي لا غير');
  assert.equal(kwdInWords(5), 'فقط خمسة دنانير كويتية لا غير');
  assert.equal(kwdInWords(1), 'فقط دينار كويتي واحد لا غير');
  assert.equal(kwdInWords(12.375), 'فقط اثنا عشر ديناراً كويتياً وثلاثمئة وخمسة وسبعون فلساً لا غير');
  assert.equal(kwdInWords(0), '');
});
