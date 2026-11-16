// Storage backends for registrations and contact messages.
// - Supabase (production): used when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
// - JSON file (local development): used otherwise.
// Both expose the same async interface and return camelCase records.
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// ---------- JSON file ----------
function createFileStore(file) {
  let data = { registrations: [], messages: [] };
  try {
    data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[store] could not read', file, e.message);
  }
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
  const list = (k) => data[k];
  const add = async (k, rec) => { data[k].unshift(rec); await persist(); return rec; };
  const update = async (k, id, patch) => {
    const rec = data[k].find((r) => r.id === id);
    if (!rec) return null;
    Object.assign(rec, patch);
    await persist();
    return rec;
  };
  const remove = async (k, id) => {
    const i = data[k].findIndex((r) => r.id === id);
    if (i === -1) return false;
    data[k].splice(i, 1);
    await persist();
    return true;
  };
  return {
    kind: 'file',
    listRegistrations: async () => list('registrations'),
    addRegistration: (r) => add('registrations', r),
    updateRegistration: (id, p) => update('registrations', id, p),
    deleteRegistration: (id) => remove('registrations', id),
    listMessages: async () => list('messages'),
    addMessage: (m) => add('messages', m),
    updateMessage: (id, p) => update('messages', id, p),
    deleteMessage: (id) => remove('messages', id),
  };
}

// ---------- Supabase (PostgREST over HTTPS, no SDK) ----------
const REG_COLS = { id: 'id', createdAt: 'created_at', updatedAt: 'updated_at', status: 'status', name: 'name', phone: 'phone', email: 'email', courseId: 'course_id', courseTitle: 'course_title', mode: 'mode', studentType: 'student_type', notes: 'notes' };
const MSG_COLS = { id: 'id', createdAt: 'created_at', read: 'read', name: 'name', contact: 'contact', subject: 'subject', message: 'message' };

const toRow = (cols, rec) => {
  const row = {};
  for (const [k, c] of Object.entries(cols)) if (rec[k] !== undefined) row[c] = rec[k] === '' ? null : rec[k];
  return row;
};
const fromRow = (cols, row) => {
  const rec = {};
  for (const [k, c] of Object.entries(cols)) rec[k] = row[c] ?? (k === 'read' ? false : '');
  return rec;
};

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
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }
  const idEq = (id) => 'id=eq.' + encodeURIComponent(id);

  const table = (name, cols) => ({
    list: async () => (await call('GET', `${name}?select=*&order=created_at.desc&limit=5000`)).map((r) => fromRow(cols, r)),
    add: async (rec) => fromRow(cols, (await call('POST', name, toRow(cols, rec)))[0]),
    update: async (id, patch) => {
      const rows = await call('PATCH', `${name}?${idEq(id)}`, toRow(cols, patch));
      return rows.length ? fromRow(cols, rows[0]) : null;
    },
    remove: async (id) => (await call('DELETE', `${name}?${idEq(id)}`)).length > 0,
  });
  const regs = table('tm_registrations', REG_COLS);
  const msgs = table('tm_messages', MSG_COLS);

  return {
    kind: 'supabase',
    listRegistrations: regs.list,
    addRegistration: regs.add,
    updateRegistration: regs.update,
    deleteRegistration: regs.remove,
    listMessages: msgs.list,
    addMessage: msgs.add,
    updateMessage: msgs.update,
    deleteMessage: msgs.remove,
  };
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
    return {
      kind: 'unconfigured',
      listRegistrations: fail, addRegistration: fail, updateRegistration: fail, deleteRegistration: fail,
      listMessages: fail, addMessage: fail, updateMessage: fail, deleteMessage: fail,
    };
  }
  return createFileStore(options.dataFile || process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
}

module.exports = { createStore, createFileStore, createSupabaseStore };
