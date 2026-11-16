// Storage backends.
// - Supabase (production): used when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
// - JSON file (local development): used otherwise.
// Both expose the same generic async interface over named collections and return camelCase records:
//   list(name) · add(name, rec) · update(name, id, patch) · remove(name, id)
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// collection name → Supabase table and camelCase → snake_case columns
const COLLECTIONS = {
  registrations: { table: 'tm_registrations', cols: { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', status: 'status', name: 'name', phone: 'phone', email: 'email', courseId: 'course_id', courseTitle: 'course_title', mode: 'mode', studentType: 'student_type', notes: 'notes' } },
  messages: { table: 'tm_messages', cols: { id: 'id', createdAt: 'created_at', read: 'read', name: 'name', contact: 'contact', subject: 'subject', message: 'message' } },
  teachers: { table: 'tm_teachers', cols: { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', name: 'name', phone: 'phone', email: 'email', subject: 'subject', passwordHash: 'password_hash', active: 'active', notes: 'notes' } },
  classes: { table: 'tm_classes', cols: { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', name: 'name', teacherId: 'teacher_id', subject: 'subject', grade: 'grade', schedule: 'schedule', room: 'room', fee: 'fee', capacity: 'capacity', notes: 'notes' } },
  students: { table: 'tm_students', cols: { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', name: 'name', phone: 'phone', guardianName: 'guardian_name', guardianPhone: 'guardian_phone', grade: 'grade', classIds: 'class_ids', status: 'status', notes: 'notes' } },
  fees: { table: 'tm_fees', cols: { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', studentId: 'student_id', classId: 'class_id', description: 'description', amount: 'amount', dueDate: 'due_date' } },
  payments: { table: 'tm_payments', cols: { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', studentId: 'student_id', amount: 'amount', method: 'method', paidAt: 'paid_at', note: 'note' } },
};
const DEFAULTS = { read: false, active: true, classIds: [], fee: null, capacity: null, amount: 0 };

const toRow = (cols, rec) => {
  const row = {};
  for (const [k, c] of Object.entries(cols)) if (rec[k] !== undefined) row[c] = rec[k] === '' ? null : rec[k];
  return row;
};
const fromRow = (cols, row) => {
  const rec = {};
  for (const [k, c] of Object.entries(cols)) {
    let v = row[c];
    if (v === null || v === undefined) v = k in DEFAULTS ? DEFAULTS[k] : '';
    else if ((k === 'amount' || k === 'fee') && typeof v === 'string') v = Number(v);
    rec[k] = v;
  }
  return rec;
};

const withLegacy = (s) => ({
  ...s,
  listRegistrations: () => s.list('registrations'),
  addRegistration: (r) => s.add('registrations', r),
  updateRegistration: (id, p) => s.update('registrations', id, p),
  deleteRegistration: (id) => s.remove('registrations', id),
  listMessages: () => s.list('messages'),
  addMessage: (m) => s.add('messages', m),
  updateMessage: (id, p) => s.update('messages', id, p),
  deleteMessage: (id) => s.remove('messages', id),
});

// ---------- JSON file ----------
function createFileStore(file) {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[store] could not read', file, e.message);
  }
  for (const k of Object.keys(COLLECTIONS)) data[k] ||= [];
  let queue = Promise.resolve();
  const persist = () => {
    queue = queue.then(async () => {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const tmp = file + '.' + process.pid + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
      await fsp.rename(tmp, file);
    });
    return queue;
  };
  const copy = (r) => JSON.parse(JSON.stringify(r));
  return withLegacy({
    kind: 'file',
    list: async (k) => copy(data[k]),
    add: async (k, rec) => {
      const full = { createdAt: new Date().toISOString(), ...rec };
      data[k].unshift(full);
      await persist();
      return copy(full);
    },
    update: async (k, id, patch) => {
      const rec = data[k].find((r) => r.id === id);
      if (!rec) return null;
      Object.assign(rec, patch);
      await persist();
      return copy(rec);
    },
    remove: async (k, id) => {
      const i = data[k].findIndex((r) => r.id === id);
      if (i === -1) return false;
      data[k].splice(i, 1);
      await persist();
      return true;
    },
  });
}

// ---------- Supabase (PostgREST over HTTPS, no SDK) ----------
function createSupabaseStore(url, key, fetchImpl = fetch) {
  const base = url.replace(/\/+$/, '') + '/rest/v1/';
  const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only need apikey.
  if (key.split('.').length === 3) headers.Authorization = 'Bearer ' + key;

  async function call(method, pathQuery, body) {
    const r = await fetchImpl(base + pathQuery, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    if (!r.ok) {
      const err = new Error(`supabase ${method} ${pathQuery.split('?')[0]} → ${r.status}: ${text.slice(0, 300)}`);
      err.upstream = r.status;
      if (r.status === 409 || /duplicate key|23505/.test(text)) err.conflict = true;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }
  const meta = (k) => {
    const m = COLLECTIONS[k];
    if (!m) throw new Error('unknown collection ' + k);
    return m;
  };
  const idEq = (id) => 'id=eq.' + encodeURIComponent(id);

  return withLegacy({
    kind: 'supabase',
    list: async (k) => {
      const { table, cols } = meta(k);
      return (await call('GET', `${table}?select=*&order=created_at.desc&limit=10000`)).map((r) => fromRow(cols, r));
    },
    add: async (k, rec) => {
      const { table, cols } = meta(k);
      return fromRow(cols, (await call('POST', table, toRow(cols, rec)))[0]);
    },
    update: async (k, id, patch) => {
      const { table, cols } = meta(k);
      const rows = await call('PATCH', `${table}?${idEq(id)}`, toRow(cols, patch));
      return rows.length ? fromRow(cols, rows[0]) : null;
    },
    remove: async (k, id) => {
      const { table } = meta(k);
      return (await call('DELETE', `${table}?${idEq(id)}`)).length > 0;
    },
  });
}

function createStore(options = {}) {
  if (options.store) return options.store;
  const url = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = options.supabaseKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) return createSupabaseStore(url, key, options.fetch);
  if (process.env.VERCEL) {
    // Vercel's file system is not persistent: refuse to store anything rather than silently lose data.
    console.error('[store] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on Vercel.');
    const fail = async () => { throw Object.assign(new Error('storage_not_configured'), { status: 503 }); };
    return withLegacy({ kind: 'unconfigured', list: fail, add: fail, update: fail, remove: fail });
  }
  return createFileStore(options.dataFile || process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
}

module.exports = { createStore, createFileStore, createSupabaseStore, COLLECTIONS };
