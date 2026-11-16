// Institute management API: students, teachers, classes, fees and payments.
// Admin: full access. Teacher: read-only view of their own classes and students, no finances.
'use strict';

const crypto = require('node:crypto');

const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max = 2000) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const normalizePhone = (v) => {
  const s = clean(v, 30).replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  return /^\+?\d{8,15}$/.test(s) ? s : null;
};
const toNumber = (v) => {
  const s = String(v ?? '').trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN; // Kuwaiti dinar: 3 decimals (fils)
};
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
const newId = (prefix) => prefix + '-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();

// ---------- passwords (scrypt) ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 32);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}
function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) {
    crypto.scryptSync('x', 'dummy-salt-value', 32); // keep timing similar
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(got, expected);
}

const PAYMENT_METHODS = ['نقداً', 'تحويل بنكي', 'شبكة / بطاقة'];
const STUDENT_STATUSES = ['active', 'inactive'];
const publicTeacher = ({ passwordHash, ...t }) => t;

// ---------- validation: returns { rec } or { fields } ----------
function validate(col, b, { isNew, ctx }) {
  const f = {};
  const rec = {};
  const has = (k) => isNew || b[k] !== undefined;

  if (col === 'students') {
    if (has('name')) { rec.name = clean(b.name, 100); if (rec.name.length < 2) f.name = 'اكتب اسم الطالب'; }
    for (const k of ['phone', 'guardianPhone']) {
      if (!has(k)) continue;
      const raw = clean(b[k], 30);
      rec[k] = raw ? normalizePhone(raw) : '';
      if (raw && !rec[k]) f[k] = 'رقم غير صحيح';
    }
    if (has('guardianName')) rec.guardianName = clean(b.guardianName, 100);
    if (has('grade')) rec.grade = clean(b.grade, 60);
    if (has('classIds')) {
      const ids = Array.isArray(b.classIds) ? [...new Set(b.classIds.map((x) => clean(x, 60)))] : [];
      if (ids.some((id) => !ctx.classIds.has(id))) f.classIds = 'صف غير موجود';
      rec.classIds = ids;
    }
    if (has('status')) { rec.status = b.status || 'active'; if (!STUDENT_STATUSES.includes(rec.status)) f.status = 'حالة غير صحيحة'; }
    if (has('notes')) rec.notes = cleanMultiline(b.notes, 1000);
  }

  if (col === 'teachers') {
    if (has('name')) { rec.name = clean(b.name, 100); if (rec.name.length < 2) f.name = 'اكتب اسم المعلم'; }
    if (has('phone')) { rec.phone = normalizePhone(b.phone); if (!rec.phone) f.phone = 'رقم الجوال مطلوب ويجب أن يكون صحيحاً'; }
    if (has('email')) { rec.email = clean(b.email, 120).toLowerCase(); if (rec.email && !isEmail(rec.email)) f.email = 'بريد غير صحيح'; }
    if (has('subject')) rec.subject = clean(b.subject, 100);
    if (has('active')) rec.active = b.active === undefined ? true : !!b.active;
    if (has('notes')) rec.notes = cleanMultiline(b.notes, 1000);
    const pw = String(b.password ?? '');
    if (isNew || pw) {
      if (pw.length < 6) f.password = 'كلمة المرور 6 أحرف على الأقل';
      else rec.passwordHash = hashPassword(pw);
    }
  }

  if (col === 'classes') {
    if (has('name')) { rec.name = clean(b.name, 100); if (rec.name.length < 2) f.name = 'اكتب اسم الصف'; }
    if (has('teacherId')) { rec.teacherId = clean(b.teacherId, 60); if (rec.teacherId && !ctx.teacherIds.has(rec.teacherId)) f.teacherId = 'معلم غير موجود'; }
    for (const k of ['subject', 'grade', 'schedule', 'room']) if (has(k)) rec[k] = clean(b[k], 120);
    if (has('fee')) { rec.fee = toNumber(b.fee); if (Number.isNaN(rec.fee) || rec.fee < 0) f.fee = 'مبلغ غير صحيح'; }
    if (has('capacity')) {
      const n = toNumber(b.capacity);
      rec.capacity = n === null ? null : Math.trunc(n);
      if (Number.isNaN(n) || (n !== null && n < 1)) f.capacity = 'عدد غير صحيح';
    }
    if (has('notes')) rec.notes = cleanMultiline(b.notes, 1000);
  }

  if (col === 'fees') {
    if (has('studentId')) { rec.studentId = clean(b.studentId, 60); if (!ctx.studentIds.has(rec.studentId)) f.studentId = 'اختر الطالب'; }
    if (has('classId')) { rec.classId = clean(b.classId, 60); if (rec.classId && !ctx.classIds.has(rec.classId)) f.classId = 'صف غير موجود'; }
    if (has('description')) { rec.description = clean(b.description, 150); if (rec.description.length < 2) f.description = 'اكتب وصف المستحق'; }
    if (has('amount')) { rec.amount = toNumber(b.amount); if (!(rec.amount > 0)) f.amount = 'المبلغ يجب أن يكون أكبر من صفر'; }
    if (has('dueDate')) { rec.dueDate = clean(b.dueDate, 10); if (rec.dueDate && !isDate(rec.dueDate)) f.dueDate = 'تاريخ غير صحيح'; }
  }

  if (col === 'payments') {
    if (has('studentId')) { rec.studentId = clean(b.studentId, 60); if (!ctx.studentIds.has(rec.studentId)) f.studentId = 'اختر الطالب'; }
    if (has('amount')) { rec.amount = toNumber(b.amount); if (!(rec.amount > 0)) f.amount = 'المبلغ يجب أن يكون أكبر من صفر'; }
    if (has('method')) { rec.method = b.method || PAYMENT_METHODS[0]; if (!PAYMENT_METHODS.includes(rec.method)) f.method = 'طريقة دفع غير صحيحة'; }
    if (has('paidAt')) { rec.paidAt = clean(b.paidAt, 10) || new Date().toISOString().slice(0, 10); if (!isDate(rec.paidAt)) f.paidAt = 'تاريخ غير صحيح'; }
    if (has('note')) rec.note = clean(b.note, 300);
  }

  return Object.keys(f).length ? { fields: f } : { rec };
}

const PREFIX = { students: 'ST', teachers: 'TC', classes: 'CL', fees: 'FE', payments: 'PY' };

function createOffice({ store, send, readBody, getSession, signSession, sessionCookie, rateLimited }) {
  async function loadAll() {
    const [students, teachers, classes, fees, payments] = await Promise.all(
      ['students', 'teachers', 'classes', 'fees', 'payments'].map((k) => store.list(k)));
    return { students, teachers, classes, fees, payments };
  }
  const ctxOf = (all) => ({
    studentIds: new Set(all.students.map((x) => x.id)),
    teacherIds: new Set(all.teachers.map((x) => x.id)),
    classIds: new Set(all.classes.map((x) => x.id)),
  });

  function balances(all) {
    const map = new Map(all.students.map((s) => [s.id, { charged: 0, paid: 0 }]));
    for (const f of all.fees) if (map.has(f.studentId)) map.get(f.studentId).charged += Number(f.amount) || 0;
    for (const p of all.payments) if (map.has(p.studentId)) map.get(p.studentId).paid += Number(p.amount) || 0;
    return map;
  }

  async function handle(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    if (!p.startsWith('/api/office/')) return false;
    const session = getSession(req);

    // ----- teacher login -----
    if (p === '/api/office/teacher-login' && m === 'POST') {
      if (rateLimited(req, 'login', 8, 15 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' }), true;
      const b = await readBody(req);
      const phone = normalizePhone(b.phone);
      const teachers = await store.list('teachers');
      const t = phone && teachers.find((x) => x.phone === phone);
      const ok = verifyPassword(b.password ?? '', t?.passwordHash);
      if (!t || !ok || !t.active) return send(res, 401, { error: 'wrong_credentials' }), true;
      return send(res, 200, { ok: true, name: t.name }, { 'Set-Cookie': sessionCookie(signSession('teacher', t.id)) }), true;
    }

    if (p === '/api/office/me' && m === 'GET') {
      if (!session) return send(res, 401, { error: 'unauthorized' }), true;
      if (session.role === 'admin') return send(res, 200, { role: 'admin', name: 'الإدارة' }), true;
      const t = (await store.list('teachers')).find((x) => x.id === session.uid && x.active);
      return t ? send(res, 200, { role: 'teacher', name: t.name }) : send(res, 401, { error: 'unauthorized' }), true;
    }

    // ----- teacher view: own classes and their students, no finances -----
    if (p === '/api/office/teacher' && m === 'GET') {
      if (session?.role !== 'teacher') return send(res, 401, { error: 'unauthorized' }), true;
      const [teachers, classes, students] = await Promise.all(['teachers', 'classes', 'students'].map((k) => store.list(k)));
      const t = teachers.find((x) => x.id === session.uid && x.active);
      if (!t) return send(res, 401, { error: 'unauthorized' }), true;
      const mine = classes.filter((c) => c.teacherId === t.id);
      const mineIds = new Set(mine.map((c) => c.id));
      const roster = students
        .filter((s) => s.status === 'active' && s.classIds.some((id) => mineIds.has(id)))
        .map((s) => ({ id: s.id, name: s.name, grade: s.grade, phone: s.phone, guardianName: s.guardianName, guardianPhone: s.guardianPhone, classIds: s.classIds.filter((id) => mineIds.has(id)) }));
      return send(res, 200, {
        teacher: { name: t.name, subject: t.subject },
        classes: mine.map(({ id, name, subject, grade, schedule, room, capacity }) => ({ id, name, subject, grade, schedule, room, capacity })),
        students: roster,
      }), true;
    }

    // ----- everything below is admin only -----
    if (session?.role !== 'admin') return send(res, 401, { error: 'unauthorized' }), true;

    if (p === '/api/office/all' && m === 'GET') {
      const all = await loadAll();
      const bal = balances(all);
      return send(res, 200, {
        ...all,
        teachers: all.teachers.map(publicTeacher),
        balances: Object.fromEntries(bal),
        paymentMethods: PAYMENT_METHODS,
      }), true;
    }

    if (p === '/api/office/finance.csv' && m === 'GET') {
      const all = await loadAll();
      const bal = balances(all);
      const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const rows = [['الطالب', 'ولي الأمر', 'جوال ولي الأمر', 'المرحلة', 'إجمالي المستحقات (د.ك)', 'المدفوع (د.ك)', 'المتبقي (د.ك)']];
      for (const s of all.students) {
        const b = bal.get(s.id);
        rows.push([s.name, s.guardianName, s.guardianPhone, s.grade, b.charged.toFixed(3), b.paid.toFixed(3), (b.charged - b.paid).toFixed(3)]);
      }
      return send(res, 200, '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tickmarkin-finance.csv"',
      }), true;
    }

    // issue a fee to every active student in a class
    const charge = p.match(/^\/api\/office\/classes\/([\w-]+)\/charge$/);
    if (charge && m === 'POST') {
      const all = await loadAll();
      const cls = all.classes.find((c) => c.id === charge[1]);
      if (!cls) return send(res, 404, { error: 'not_found' }), true;
      const b = await readBody(req);
      const amount = toNumber(b.amount === undefined || b.amount === '' ? cls.fee : b.amount);
      const description = clean(b.description, 150) || `رسوم ${cls.name}`;
      const dueDate = clean(b.dueDate, 10);
      const fields = {};
      if (!(amount > 0)) fields.amount = 'حدّد مبلغاً أكبر من صفر (أو رسوم الصف)';
      if (dueDate && !isDate(dueDate)) fields.dueDate = 'تاريخ غير صحيح';
      if (Object.keys(fields).length) return send(res, 422, { error: 'validation', fields }), true;
      const targets = all.students.filter((s) => s.status === 'active' && s.classIds.includes(cls.id));
      for (const s of targets) {
        await store.add('fees', { id: newId('FE'), studentId: s.id, classId: cls.id, description, amount, dueDate });
      }
      return send(res, 201, { ok: true, count: targets.length }), true;
    }

    const route = p.match(/^\/api\/office\/(students|teachers|classes|fees|payments)(?:\/([\w-]+))?$/);
    if (!route) return send(res, 404, { error: 'not_found' }), true;
    const [, col, id] = route;

    if (!id && m === 'POST') {
      const all = await loadAll();
      const b = await readBody(req);
      const v = validate(col, b, { isNew: true, ctx: ctxOf(all) });
      if (v.fields) return send(res, 422, { error: 'validation', fields: v.fields }), true;
      if (col === 'teachers' && all.teachers.some((t) => t.phone === v.rec.phone)) {
        return send(res, 422, { error: 'validation', fields: { phone: 'هذا الرقم مسجّل لمعلم آخر' } }), true;
      }
      const saved = await store.add(col, { id: newId(PREFIX[col]), ...v.rec });
      return send(res, 201, { ok: true, record: col === 'teachers' ? publicTeacher(saved) : saved }), true;
    }

    if (id && m === 'PATCH') {
      const all = await loadAll();
      if (!all[col].some((x) => x.id === id)) return send(res, 404, { error: 'not_found' }), true;
      const b = await readBody(req);
      const v = validate(col, b, { isNew: false, ctx: ctxOf(all) });
      if (v.fields) return send(res, 422, { error: 'validation', fields: v.fields }), true;
      if (col === 'teachers' && v.rec.phone && all.teachers.some((t) => t.phone === v.rec.phone && t.id !== id)) {
        return send(res, 422, { error: 'validation', fields: { phone: 'هذا الرقم مسجّل لمعلم آخر' } }), true;
      }
      const saved = await store.update(col, id, { ...v.rec, updatedAt: new Date().toISOString() });
      return send(res, 200, { ok: true, record: col === 'teachers' ? publicTeacher(saved) : saved }), true;
    }

    if (id && m === 'DELETE') {
      const all = await loadAll();
      if (!all[col].some((x) => x.id === id)) return send(res, 404, { error: 'not_found' }), true;
      // keep the file store consistent with the database's foreign keys
      if (col === 'students') {
        for (const f of all.fees.filter((x) => x.studentId === id)) await store.remove('fees', f.id);
        for (const x of all.payments.filter((y) => y.studentId === id)) await store.remove('payments', x.id);
      }
      if (col === 'classes') {
        for (const s of all.students.filter((x) => x.classIds.includes(id))) {
          await store.update('students', s.id, { classIds: s.classIds.filter((c) => c !== id) });
        }
        for (const f of all.fees.filter((x) => x.classId === id)) await store.update('fees', f.id, { classId: '' });
      }
      if (col === 'teachers') {
        for (const c of all.classes.filter((x) => x.teacherId === id)) await store.update('classes', c.id, { teacherId: '' });
      }
      await store.remove(col, id);
      return send(res, 200, { ok: true }), true;
    }

    return send(res, 405, { error: 'method_not_allowed' }), true;
  }

  return { handle };
}

module.exports = { createOffice, hashPassword, verifyPassword };
