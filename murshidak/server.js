import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.js';
import { initKey, encrypt, decrypt, decryptText, encryptText, sha256, randomToken, mask } from './lib/crypto.js';
import { seedIfEmpty, insertProcedure } from './lib/seed.js';
import { interpret } from './lib/ai.js';
import { ENTITIES, CATEGORIES, SAHEL_URL } from './lib/procedures-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PLANS = {
  free: { price: 0, maxDocuments: 3, reminders: false, employees: false },
  family: { price: 1.5, maxDocuments: Infinity, reminders: true, employees: false },
  business: { price: 9.9, maxDocuments: Infinity, reminders: true, employees: true },
};
const RELATIONS = ['self', 'spouse', 'child', 'parent', 'domestic_worker', 'employee', 'other'];
const DOC_TYPES = ['civil_id', 'passport', 'residency', 'driving_license', 'car_registration', 'other'];
const BOOKING_FLOW = ['requested', 'accepted', 'in_progress', 'done'];
const MIME_OK = { 'image/jpeg': [0xff, 0xd8], 'image/png': [0x89, 0x50], 'image/webp': [0x52, 0x49], 'application/pdf': [0x25, 0x50] };
// 3 MB raw ≈ 4 MB base64: stays under the 4.5 MB request-body limit of serverless hosts.
const MAX_FILE = 3 * 1024 * 1024;
const COUNT = 'CAST(COUNT(*) AS INTEGER)';

/** Today's date in Kuwait (UTC+3, no DST). */
export function kuwaitToday(now = Date.now()) {
  return new Date(now + 3 * 3600e3).toISOString().slice(0, 10);
}
export function daysUntil(date, today = kuwaitToday()) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400e3);
}
export const expiryLevel = (days) => (days < 30 ? 'red' : days < 90 ? 'yellow' : 'green');
const nowStamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const normPhone = (p) => {
  const s = String(p || '').replace(/\D/g, '').replace(/^(00965|965)/, '');
  return /^[4569]\d{7}$/.test(s) ? s : null;
};

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

export function createApp({
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  databaseUrl = process.env.DATABASE_URL,
} = {}) {
  if (databaseUrl && !process.env.MURSHIDAK_SECRET) {
    throw new Error('MURSHIDAK_SECRET is required with DATABASE_URL (all instances must share the encryption key).');
  }
  initKey(dataDir);
  let db;
  let readyPromise;
  // Connect + create tables + seed. If it fails (e.g. a database blip), the next request retries
  // instead of leaving a warm serverless instance broken.
  const ready = () => (readyPromise ||= (async () => {
    db ||= await openDb({ dataDir, databaseUrl });
    await db.init((t) => seedIfEmpty(t, kuwaitToday()));
    runReminders().catch((e) => console.error('[reminders]', e.message));
  })().catch((e) => { readyPromise = null; throw e; }));
  ready().catch((e) => console.error('[startup]', e.message));
  const adminPhones = new Set(String(process.env.ADMIN_PHONES || '90000000').split(',').map((s) => s.trim()).filter(Boolean));
  const demoOtp = !process.env.SMS_PROVIDER;

  // ---------- serializers
  const toProc = (r, { full = true } = {}) => r && ({
    id: r.id, slug: r.slug, category: r.category, mode: r.mode, popular: r.popular, published: !!r.published,
    title: { ar: r.title_ar, en: r.title_en }, summary: { ar: r.summary_ar, en: r.summary_en },
    fees: { ar: r.fees_ar, en: r.fees_en }, duration: { ar: r.duration_ar, en: r.duration_en },
    ...(full ? { steps: JSON.parse(r.steps), documents: JSON.parse(r.documents), keywords: JSON.parse(r.keywords) } : {}),
    updated_at: r.updated_at,
  });
  const procsForMatch = async () => (await db.all('SELECT * FROM procedures WHERE published=1')).map((r) => ({ ...r, keywords: JSON.parse(r.keywords) }));

  const toAgent = (r) => r && ({
    id: r.id, name: { ar: r.name_ar, en: r.name_en }, bio: { ar: r.bio_ar, en: r.bio_en }, areas: { ar: r.areas_ar, en: r.areas_en },
    categories: JSON.parse(r.categories), rating: Number(r.rating), reviews: r.reviews, price: Number(r.price_kwd), years: r.years,
    status: r.status, verified: r.status === 'approved', phoneMasked: mask(r.phone),
  });

  const today = () => kuwaitToday();
  const toDoc = (r) => {
    const days = daysUntil(r.expiry_date, today());
    return {
      id: r.id, member_id: r.member_id, member_name: r.member_name, member_relation: r.member_relation,
      type: r.type, label: r.label, numberMasked: mask(decryptText(r.number_enc)), expiry_date: r.expiry_date,
      daysLeft: days, level: expiryLevel(days), notes: r.notes, hasFile: !!r.file_mime, file_mime: r.file_mime,
    };
  };
  const DOC_SELECT = 'SELECT d.*, m.name member_name, m.relation member_relation FROM documents d JOIN members m ON m.id=d.member_id';

  const notify = (userId, n) => db.run(`INSERT INTO notifications (user_id,dedupe_key,kind,title_ar,title_en,body_ar,body_en,link)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (dedupe_key) DO NOTHING`, userId, n.key, n.kind, n.title_ar, n.title_en, n.body_ar || '', n.body_en || '', n.link || '');

  const DOC_NAMES = {
    civil_id: ['البطاقة المدنية', 'Civil ID'], passport: ['جواز السفر', 'Passport'], residency: ['الإقامة', 'Residency'],
    driving_license: ['رخصة القيادة', 'Driving license'], car_registration: ['دفتر السيارة', 'Car registration'], other: ['مستند', 'Document'],
  };
  /** In-app reminders at 30 and 7 days before expiry (and once when expired). Paid plans only. Idempotent. */
  async function runReminders(userId) {
    const rows = await db.all(`${DOC_SELECT} JOIN users u ON u.id=d.user_id WHERE u.plan <> 'free' AND d.expiry_date <= ? ${userId ? 'AND d.user_id=?' : ''}`,
      ...[addDaysStr(today(), 30), ...(userId ? [userId] : [])]);
    let created = 0;
    for (const r of rows) {
      const days = daysUntil(r.expiry_date, today());
      const [nAr, nEn] = DOC_NAMES[r.type];
      const label = { ar: r.label || nAr, en: r.label || nEn };
      const link = `#/wallet/doc/${r.id}`;
      const mk = async (kind, title_ar, title_en, body_ar, body_en) => {
        created += (await notify(r.user_id, { key: `doc:${r.id}:${r.expiry_date}:${kind}`, kind, title_ar, title_en, body_ar, body_en, link })).changes;
      };
      if (days < 0) await mk('expired', `انتهت ${label.ar} – ${r.member_name}`, `${label.en} expired – ${r.member_name}`, `انتهت منذ ${-days} يوم. جدّدها لتجنّب الغرامات.`, `Expired ${-days} days ago. Renew to avoid fines.`);
      else {
        await mk('expiry_30', `${label.ar} لـ${r.member_name} تنتهي خلال 30 يوماً`, `${label.en} for ${r.member_name} expires within 30 days`, `متبقٍ ${days} يوم (${r.expiry_date}).`, `${days} days left (${r.expiry_date}).`);
        if (days <= 7) await mk('expiry_7', `تنبيه عاجل: ${label.ar} لـ${r.member_name} تنتهي خلال 7 أيام`, `Urgent: ${label.en} for ${r.member_name} expires within 7 days`, `متبقٍ ${days} يوم فقط.`, `Only ${days} days left.`);
      }
    }
    return created;
  }
  const reminderTimer = setInterval(() => ready().then(() => runReminders()).catch((e) => console.error('[reminders]', e.message)), 60 * 60 * 1000);
  reminderTimer.unref();

  // ---------- simple in-memory rate limiter (per instance)
  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now();
    const h = (hits.get(key) || []).filter((x) => now - x < windowMs);
    if (h.length >= max) fail(429, 'rate_limited');
    h.push(now); hits.set(key, h);
  };

  // ---------- app
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });
  const api = express.Router();
  app.use('/api', express.json({ limit: '8mb' }), (req, res, next) => ready().then(() => next(), next), api);

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((out) => { if (out !== undefined && !res.headersSent) res.json(out); }).catch(next);

  // session
  api.use((req, res, next) => {
    const m = /(?:^|;\s*)msid=([^;]+)/.exec(req.headers.cookie || '');
    if (!m) return next();
    db.get('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', sha256(m[1]), Date.now())
      .then((u) => { req.user = u; next(); }, next);
  });
  const auth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'unauthorized')));
  const admin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(new HttpError(403, 'forbidden')));

  const publicUser = (u) => ({ id: u.id, phone: u.phone, phoneMasked: mask(u.phone), name: u.name, role: u.role, plan: u.plan, lang: u.lang, limits: { ...PLANS[u.plan], maxDocuments: PLANS[u.plan].maxDocuments === Infinity ? null : PLANS[u.plan].maxDocuments } });
  const userById = (id) => db.get('SELECT * FROM users WHERE id=?', id);

  api.get('/health', wrap(async () => ({ ok: true, db: db.kind, procedures: (await db.get(`SELECT ${COUNT} c FROM procedures`)).c })));

  api.get('/config', wrap(() => ({
    demoOtp, ai: !!process.env.OPENAI_API_KEY, sahelUrl: SAHEL_URL, entities: ENTITIES, categories: CATEGORIES,
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, maxDocuments: v.maxDocuments === Infinity ? null : v.maxDocuments }])),
    today: today(),
  })));

  // ----- auth (phone + OTP)
  api.post('/auth/request-otp', wrap(async (req) => {
    const phone = normPhone(req.body?.phone);
    if (!phone) fail(400, 'invalid_phone');
    limit('otp:' + phone, 3, 10 * 60e3);
    limit('otpip:' + req.ip, 20, 10 * 60e3);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.run(`INSERT INTO otps (phone,code_hash,expires_at,attempts) VALUES (?,?,?,0)
      ON CONFLICT (phone) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0`, phone, sha256(phone + ':' + code), Date.now() + 5 * 60e3);
    // No SMS provider wired yet: in demo mode the code is returned so the flow can be tried.
    return { sent: true, demo: demoOtp, ...(demoOtp ? { devCode: code } : {}) };
  }));

  api.post('/auth/verify', wrap(async (req, res) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!phone) fail(400, 'invalid_phone');
    const o = await db.get('SELECT * FROM otps WHERE phone=?', phone);
    if (!o || Number(o.expires_at) < Date.now()) fail(400, 'otp_expired');
    if (o.attempts >= 5) fail(429, 'too_many_attempts');
    if (o.code_hash !== sha256(phone + ':' + code)) {
      await db.run('UPDATE otps SET attempts=attempts+1 WHERE phone=?', phone);
      fail(400, 'otp_wrong');
    }
    await db.run('DELETE FROM otps WHERE phone=?', phone);
    let user = await db.get('SELECT * FROM users WHERE phone=?', phone);
    let isNew = false;
    if (!user) {
      isNew = true;
      const name = String(req.body?.name || '').trim().slice(0, 80);
      const role = adminPhones.has(phone) ? 'admin' : 'user';
      await db.tx(async (t) => {
        const ins = await t.run('INSERT INTO users (phone,name,role) VALUES (?,?,?) ON CONFLICT (phone) DO NOTHING', phone, name, role);
        const id = ins.changes ? ins.id : (await t.get('SELECT id FROM users WHERE phone=?', phone)).id;
        if (!(await t.get("SELECT 1 x FROM members WHERE user_id=? AND relation='self'", id))) await t.run('INSERT INTO members (user_id,name,relation) VALUES (?,?,?)', id, name || '—', 'self');
      });
      user = await db.get('SELECT * FROM users WHERE phone=?', phone);
    }
    const token = randomToken();
    await db.run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', sha256(token), user.id, Date.now() + 30 * 86400e3);
    res.setHeader('Set-Cookie', `msid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${process.env.COOKIE_SECURE || process.env.VERCEL ? '; Secure' : ''}`);
    await runReminders(user.id);
    return { user: publicUser(user), isNew };
  }));

  api.post('/auth/logout', wrap(async (req, res) => {
    const m = /(?:^|;\s*)msid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) await db.run('DELETE FROM sessions WHERE token_hash=?', sha256(m[1]));
    res.setHeader('Set-Cookie', 'msid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  api.get('/me', auth, wrap((req) => ({ user: publicUser(req.user) })));
  api.patch('/me', auth, wrap(async (req) => {
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : req.user.name;
    const lang = ['ar', 'en'].includes(req.body?.lang) ? req.body.lang : req.user.lang;
    await db.run('UPDATE users SET name=?, lang=? WHERE id=?', name, lang, req.user.id);
    if (req.body?.name !== undefined) await db.run("UPDATE members SET name=? WHERE user_id=? AND relation='self'", name, req.user.id);
    return { user: publicUser(await userById(req.user.id)) };
  }));
  api.delete('/me', auth, wrap(async (req, res) => {
    await db.run('DELETE FROM users WHERE id=?', req.user.id); // cascades to members, documents, files, sessions, bookings…
    res.setHeader('Set-Cookie', 'msid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  // Plan change. There is no payment provider in this version: the UI says so clearly.
  api.post('/plan', auth, wrap(async (req) => {
    const plan = req.body?.plan;
    if (!PLANS[plan]) fail(400, 'invalid_plan');
    if (plan === 'free') {
      const c = (await db.get(`SELECT ${COUNT} c FROM documents WHERE user_id=?`, req.user.id)).c;
      if (c > PLANS.free.maxDocuments) fail(409, 'too_many_documents_for_free', { count: c });
    }
    if (plan !== 'business' && await db.get("SELECT 1 x FROM members WHERE user_id=? AND relation='employee'", req.user.id)) fail(409, 'has_employees');
    await db.run('UPDATE users SET plan=? WHERE id=?', plan, req.user.id);
    await runReminders(req.user.id);
    return { user: publicUser(await userById(req.user.id)), paymentCollected: false };
  }));

  // ----- procedures (public)
  api.get('/procedures', wrap(async (req) => {
    let list = (await db.all('SELECT * FROM procedures WHERE published=1 ORDER BY popular DESC, id')).map((r) => toProc(r, { full: false }));
    if (req.query.category) list = list.filter((p) => p.category === req.query.category);
    if (req.query.q) {
      const q = String(req.query.q).toLowerCase();
      list = list.filter((p) => (p.title.ar + p.title.en + p.summary.ar + p.summary.en).toLowerCase().includes(q));
    }
    return { procedures: list };
  }));
  api.get('/procedures/:slug', wrap(async (req) => {
    const r = await db.get('SELECT * FROM procedures WHERE slug=? AND published=1', req.params.slug);
    if (!r) fail(404, 'not_found');
    const p = toProc(r);
    delete p.keywords;
    const agents = (await db.all("SELECT * FROM agents WHERE status='approved' ORDER BY rating DESC")).map(toAgent).filter((a) => a.categories.includes(p.category)).slice(0, 3);
    return { procedure: p, agents };
  }));

  api.post('/ask', wrap(async (req) => {
    const text = String(req.body?.text || '').trim();
    if (!text) fail(400, 'empty');
    if (text.length > 500) fail(400, 'too_long');
    limit('ask:' + req.ip, 30, 60e3);
    const procs = await procsForMatch();
    const r = await interpret(text, procs, req.body?.lang);
    const bySlug = Object.fromEntries(procs.map((p) => [p.slug, p]));
    return {
      match: r.slug ? toProc(bySlug[r.slug], { full: false }) : null,
      confidence: r.confidence,
      alternatives: r.alternatives.map((s) => toProc(bySlug[s], { full: false })),
      reply: r.reply || null,
      source: r.source,
    };
  }));

  // ----- dashboard
  api.get('/dashboard', auth, wrap(async (req) => {
    const docs = (await db.all(`${DOC_SELECT} WHERE d.user_id=? ORDER BY d.expiry_date`, req.user.id)).map(toDoc);
    const popular = (await db.all('SELECT * FROM procedures WHERE published=1 ORDER BY popular DESC LIMIT 6')).map((r) => toProc(r, { full: false }));
    await runReminders(req.user.id); // serverless hosts may not keep the hourly timer alive
    const unread = (await db.get(`SELECT ${COUNT} c FROM notifications WHERE user_id=? AND read=0`, req.user.id)).c;
    const activeBookings = (await db.get(`SELECT ${COUNT} c FROM bookings WHERE user_id=? AND status IN ('requested','accepted','in_progress')`, req.user.id)).c;
    return {
      upcoming: docs.slice(0, 5),
      counts: { red: docs.filter((d) => d.level === 'red').length, yellow: docs.filter((d) => d.level === 'yellow').length, green: docs.filter((d) => d.level === 'green').length, total: docs.length },
      popular, unread, activeBookings,
    };
  }));

  // ----- members
  const ownMember = async (req, id) => (await db.get('SELECT * FROM members WHERE id=? AND user_id=?', Number(id) || 0, req.user.id)) || fail(404, 'not_found');
  const checkRelation = (req, relation) => {
    if (!RELATIONS.includes(relation) || relation === 'self') fail(400, 'invalid_relation');
    if (relation === 'employee' && !PLANS[req.user.plan].employees) fail(402, 'plan_required', { plan: 'business' });
  };
  api.get('/members', auth, wrap(async (req) => {
    const rows = await db.all(`SELECT m.id, m.name, m.relation, m.nationality, ${COUNT.replace('*', 'd.id')} doc_count, MIN(d.expiry_date) next_expiry FROM members m
      LEFT JOIN documents d ON d.member_id=m.id WHERE m.user_id=? GROUP BY m.id, m.name, m.relation, m.nationality
      ORDER BY CASE m.relation WHEN 'self' THEN 0 WHEN 'spouse' THEN 1 WHEN 'child' THEN 2 WHEN 'parent' THEN 3 WHEN 'domestic_worker' THEN 4 ELSE 5 END, m.id`, req.user.id);
    return { members: rows.map((m) => ({ id: m.id, name: m.name, relation: m.relation, nationality: m.nationality, docCount: m.doc_count, nextExpiry: m.next_expiry, nextLevel: m.next_expiry ? expiryLevel(daysUntil(m.next_expiry, today())) : null })) };
  }));
  api.post('/members', auth, wrap(async (req) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) fail(400, 'name_required');
    checkRelation(req, req.body?.relation);
    const { id } = await db.run('INSERT INTO members (user_id,name,relation,nationality) VALUES (?,?,?,?)', req.user.id, name, req.body.relation, String(req.body?.nationality || '').slice(0, 40));
    return { id };
  }));
  api.patch('/members/:id', auth, wrap(async (req) => {
    const m = await ownMember(req, req.params.id);
    const relation = m.relation === 'self' ? 'self' : (req.body?.relation ?? m.relation);
    if (relation !== m.relation) checkRelation(req, relation);
    const name = String(req.body?.name ?? m.name).trim().slice(0, 80) || m.name;
    await db.run('UPDATE members SET name=?, relation=?, nationality=? WHERE id=?', name, relation, String(req.body?.nationality ?? m.nationality).slice(0, 40), m.id);
    return { ok: true };
  }));
  api.delete('/members/:id', auth, wrap(async (req) => {
    const m = await ownMember(req, req.params.id);
    if (m.relation === 'self') fail(400, 'cannot_delete_self');
    await db.run('DELETE FROM members WHERE id=?', m.id);
    return { ok: true };
  }));

  // ----- documents wallet
  const ownDoc = async (req, id) => (await db.get(`${DOC_SELECT} WHERE d.id=? AND d.user_id=?`, Number(id) || 0, req.user.id)) || fail(404, 'not_found');
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
  api.get('/documents', auth, wrap(async (req) => {
    const mid = Number(req.query.member_id) || 0;
    const rows = await db.all(`${DOC_SELECT} WHERE d.user_id=? ${mid ? 'AND d.member_id=?' : ''} ORDER BY d.expiry_date`, req.user.id, ...(mid ? [mid] : []));
    const plan = PLANS[req.user.plan];
    return { documents: rows.map(toDoc), limit: plan.maxDocuments === Infinity ? null : plan.maxDocuments };
  }));
  api.get('/documents/:id', auth, wrap(async (req) => ({ document: toDoc(await ownDoc(req, req.params.id)) })));
  // Full number only on explicit request from the owner (the "show" button), never in lists.
  api.get('/documents/:id/number', auth, wrap(async (req) => ({ number: decryptText((await ownDoc(req, req.params.id)).number_enc) })));
  api.post('/documents', auth, wrap(async (req) => {
    const b = req.body || {};
    await ownMember(req, b.member_id);
    if (!DOC_TYPES.includes(b.type)) fail(400, 'invalid_type');
    if (!validDate(b.expiry_date)) fail(400, 'invalid_date');
    const max = PLANS[req.user.plan].maxDocuments;
    const count = (await db.get(`SELECT ${COUNT} c FROM documents WHERE user_id=?`, req.user.id)).c;
    if (count >= max) fail(402, 'plan_limit', { max });
    const { id } = await db.run('INSERT INTO documents (user_id,member_id,type,label,number_enc,expiry_date,notes) VALUES (?,?,?,?,?,?,?)',
      req.user.id, Number(b.member_id), b.type, String(b.label || '').slice(0, 60), encryptText(String(b.number || '').slice(0, 40)), b.expiry_date, String(b.notes || '').slice(0, 300));
    await runReminders(req.user.id);
    return { id };
  }));
  api.patch('/documents/:id', auth, wrap(async (req) => {
    const d = await ownDoc(req, req.params.id);
    const b = req.body || {};
    if (b.member_id !== undefined) await ownMember(req, b.member_id);
    if (b.type !== undefined && !DOC_TYPES.includes(b.type)) fail(400, 'invalid_type');
    if (b.expiry_date !== undefined && !validDate(b.expiry_date)) fail(400, 'invalid_date');
    await db.run('UPDATE documents SET member_id=?, type=?, label=?, number_enc=?, expiry_date=?, notes=? WHERE id=?',
      b.member_id !== undefined ? Number(b.member_id) : d.member_id, b.type ?? d.type, String(b.label ?? d.label).slice(0, 60),
      b.number !== undefined ? encryptText(String(b.number).slice(0, 40)) : d.number_enc,
      b.expiry_date ?? d.expiry_date, String(b.notes ?? d.notes).slice(0, 300), d.id);
    await runReminders(req.user.id);
    return { ok: true };
  }));
  api.delete('/documents/:id', auth, wrap(async (req) => {
    const d = await ownDoc(req, req.params.id);
    await db.run('DELETE FROM documents WHERE id=?', d.id); // file row cascades
    return { ok: true };
  }));
  // Upload a photo/PDF (base64 JSON). Stored encrypted (AES-256-GCM) in the database, never publicly.
  api.put('/documents/:id/file', auth, wrap(async (req) => {
    const d = await ownDoc(req, req.params.id);
    const mime = String(req.body?.mime || '');
    if (!MIME_OK[mime]) fail(415, 'unsupported_type');
    const buf = Buffer.from(String(req.body?.data || ''), 'base64');
    if (!buf.length) fail(400, 'empty_file');
    if (buf.length > MAX_FILE) fail(413, 'file_too_large');
    const magic = MIME_OK[mime];
    if (buf[0] !== magic[0] || buf[1] !== magic[1]) fail(415, 'content_mismatch');
    await db.tx(async (t) => {
      await t.run('INSERT INTO files (document_id,data) VALUES (?,?) ON CONFLICT (document_id) DO UPDATE SET data=excluded.data', d.id, encrypt(buf));
      await t.run('UPDATE documents SET file_mime=? WHERE id=?', mime, d.id);
    });
    return { ok: true };
  }));
  api.get('/documents/:id/file', auth, wrap(async (req, res) => {
    const d = await ownDoc(req, req.params.id);
    const f = d.file_mime && await db.get('SELECT data FROM files WHERE document_id=?', d.id);
    if (!f) fail(404, 'no_file');
    res.set({ 'Content-Type': d.file_mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
    res.send(decrypt(Buffer.from(f.data)));
  }));
  api.delete('/documents/:id/file', auth, wrap(async (req) => {
    const d = await ownDoc(req, req.params.id);
    await db.run('DELETE FROM files WHERE document_id=?', d.id);
    await db.run('UPDATE documents SET file_mime=NULL WHERE id=?', d.id);
    return { ok: true };
  }));

  // ----- agents marketplace
  api.get('/agents', wrap(async (req) => {
    let list = (await db.all("SELECT * FROM agents WHERE status='approved'")).map(toAgent);
    if (req.query.category) list = list.filter((a) => a.categories.includes(req.query.category));
    const sort = req.query.sort === 'price' ? (a, b) => a.price - b.price : (a, b) => b.rating - a.rating || b.reviews - a.reviews;
    return { agents: list.sort(sort) };
  }));
  // Agent sign-up: lands as "pending" until an admin approves it.
  api.post('/agents/apply', wrap(async (req) => {
    limit('apply:' + req.ip, 5, 3600e3);
    const b = req.body || {};
    const phone = normPhone(b.phone);
    const name = String(b.name || '').trim().slice(0, 80);
    const price = Number(b.price);
    if (!name || !phone || !(price > 0 && price < 1000)) fail(400, 'invalid_input');
    const cats = (Array.isArray(b.categories) ? b.categories : []).filter((c) => CATEGORIES[c]);
    const { id } = await db.run(`INSERT INTO agents (name_ar,name_en,phone,bio_ar,bio_en,categories,areas_ar,areas_en,price_kwd,years,status) VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`,
      name, name, phone, String(b.bio || '').slice(0, 300), String(b.bio || '').slice(0, 300), JSON.stringify(cats), String(b.areas || '').slice(0, 80), String(b.areas || '').slice(0, 80), price, Math.max(0, Math.min(60, Number(b.years) || 0)));
    return { id, status: 'pending' };
  }));

  // ----- bookings
  const toBooking = (r) => ({
    id: r.id, status: r.status, preferred_date: r.preferred_date, notes: r.notes, price: Number(r.price_kwd), created_at: r.created_at, updated_at: r.updated_at,
    history: JSON.parse(r.history),
    agent: { id: r.agent_id, name: { ar: r.agent_name_ar, en: r.agent_name_en }, rating: Number(r.agent_rating) },
    procedure: r.procedure_slug ? { slug: r.procedure_slug, title: { ar: r.proc_title_ar, en: r.proc_title_en } } : null,
    member: r.member_name ? { id: r.member_id, name: r.member_name } : null,
    user: r.user_name !== undefined ? { name: r.user_name, phoneMasked: mask(r.user_phone) } : undefined,
  });
  const BOOKING_SELECT = `SELECT b.*, a.name_ar agent_name_ar, a.name_en agent_name_en, a.rating agent_rating,
    p.slug procedure_slug, p.title_ar proc_title_ar, p.title_en proc_title_en, m.name member_name
    FROM bookings b JOIN agents a ON a.id=b.agent_id LEFT JOIN procedures p ON p.id=b.procedure_id LEFT JOIN members m ON m.id=b.member_id`;
  api.get('/bookings', auth, wrap(async (req) => ({ bookings: (await db.all(`${BOOKING_SELECT} WHERE b.user_id=? ORDER BY b.id DESC`, req.user.id)).map(toBooking) })));
  api.post('/bookings', auth, wrap(async (req) => {
    const b = req.body || {};
    const agent = (await db.get("SELECT * FROM agents WHERE id=? AND status='approved'", Number(b.agent_id) || 0)) || fail(404, 'agent_not_found');
    const proc = b.procedure_slug ? ((await db.get('SELECT id FROM procedures WHERE slug=?', String(b.procedure_slug))) || fail(404, 'procedure_not_found')) : null;
    if (b.member_id) await ownMember(req, b.member_id);
    if (b.preferred_date && !validDate(b.preferred_date)) fail(400, 'invalid_date');
    const now = new Date().toISOString();
    const { id } = await db.run('INSERT INTO bookings (user_id,agent_id,procedure_id,member_id,preferred_date,notes,price_kwd,history) VALUES (?,?,?,?,?,?,?,?)',
      req.user.id, agent.id, proc?.id ?? null, Number(b.member_id) || null, b.preferred_date || null, String(b.notes || '').slice(0, 500), agent.price_kwd, JSON.stringify([{ status: 'requested', at: now }]));
    return { id, status: 'requested' };
  }));
  api.post('/bookings/:id/cancel', auth, wrap(async (req) => {
    const r = (await db.get('SELECT * FROM bookings WHERE id=? AND user_id=?', Number(req.params.id) || 0, req.user.id)) || fail(404, 'not_found');
    if (!['requested', 'accepted'].includes(r.status)) fail(409, 'cannot_cancel');
    const h = JSON.parse(r.history); h.push({ status: 'cancelled', at: new Date().toISOString() });
    await db.run("UPDATE bookings SET status='cancelled', history=?, updated_at=? WHERE id=?", JSON.stringify(h), nowStamp(), r.id);
    return { ok: true };
  }));

  // ----- notifications
  api.get('/notifications', auth, wrap(async (req) => ({
    notifications: (await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', req.user.id))
      .map((n) => ({ id: n.id, kind: n.kind, title: { ar: n.title_ar, en: n.title_en }, body: { ar: n.body_ar, en: n.body_en }, link: n.link, read: !!n.read, created_at: n.created_at })),
    remindersEnabled: PLANS[req.user.plan].reminders,
  })));
  api.post('/notifications/read-all', auth, wrap(async (req) => { await db.run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id); return { ok: true }; }));

  // ----- admin
  const ad = express.Router();
  api.use('/admin', auth, admin, ad);
  ad.get('/stats', wrap(async () => ({
    users: (await db.get(`SELECT ${COUNT} c FROM users`)).c,
    documents: (await db.get(`SELECT ${COUNT} c FROM documents`)).c,
    procedures: (await db.get(`SELECT ${COUNT} c FROM procedures`)).c,
    pendingAgents: (await db.get(`SELECT ${COUNT} c FROM agents WHERE status='pending'`)).c,
    openBookings: (await db.get(`SELECT ${COUNT} c FROM bookings WHERE status IN ('requested','accepted','in_progress')`)).c,
    plans: await db.all(`SELECT plan, ${COUNT} c FROM users GROUP BY plan`),
  })));
  ad.get('/procedures', wrap(async () => ({ procedures: (await db.all('SELECT * FROM procedures ORDER BY popular DESC, id')).map((r) => toProc(r)) })));

  const cleanProc = (b) => {
    const str = (v, n = 300) => String(v ?? '').trim().slice(0, n);
    const bi = (o, n) => ({ ar: str(o?.ar, n), en: str(o?.en, n) });
    const p = {
      slug: str(b.slug, 80).toLowerCase(), category: b.category, mode: b.mode, popular: Math.max(0, Math.min(1000, Number(b.popular) || 0)),
      title: bi(b.title, 120), summary: bi(b.summary), fees: bi(b.fees, 200), duration: bi(b.duration, 100),
      steps: (Array.isArray(b.steps) ? b.steps : []).slice(0, 30).map((s) => ({ title: bi(s.title, 200), entity: ENTITIES[s.entity] ? s.entity : 'self', mode: s.mode === 'in_person' ? 'in_person' : 'online' })).filter((s) => s.title.ar),
      documents: (Array.isArray(b.documents) ? b.documents : []).slice(0, 30).map((x) => bi(x, 150)).filter((x) => x.ar),
      keywords: { s: [], a: [], x: [], ...(b.keywords && typeof b.keywords === 'object' ? b.keywords : {}) },
      published: b.published === false ? 0 : 1,
    };
    for (const k of ['s', 'a', 'x']) p.keywords[k] = (Array.isArray(p.keywords[k]) ? p.keywords[k] : []).map((w) => str(w, 60)).filter(Boolean).slice(0, 40);
    if (!/^[a-z0-9-]{3,80}$/.test(p.slug)) fail(400, 'invalid_slug');
    if (!CATEGORIES[p.category]) fail(400, 'invalid_category');
    if (!['online', 'in_person', 'mixed'].includes(p.mode)) fail(400, 'invalid_mode');
    if (!p.title.ar || !p.title.en) fail(400, 'title_required');
    if (!p.steps.length) fail(400, 'steps_required');
    return p;
  };
  ad.post('/procedures', wrap(async (req) => {
    const p = cleanProc(req.body || {});
    if (await db.get('SELECT 1 x FROM procedures WHERE slug=?', p.slug)) fail(409, 'slug_taken');
    return { id: await insertProcedure(db, p) };
  }));
  ad.put('/procedures/:id', wrap(async (req) => {
    const cur = (await db.get('SELECT * FROM procedures WHERE id=?', Number(req.params.id) || 0)) || fail(404, 'not_found');
    const p = cleanProc(req.body || {});
    if (p.slug !== cur.slug && await db.get('SELECT 1 x FROM procedures WHERE slug=?', p.slug)) fail(409, 'slug_taken');
    await db.run(`UPDATE procedures SET slug=?, category=?, mode=?, popular=?, title_ar=?, title_en=?, summary_ar=?, summary_en=?, fees_ar=?, fees_en=?,
      duration_ar=?, duration_en=?, keywords=?, steps=?, documents=?, published=?, updated_at=? WHERE id=?`,
      p.slug, p.category, p.mode, p.popular, p.title.ar, p.title.en, p.summary.ar, p.summary.en, p.fees.ar, p.fees.en, p.duration.ar, p.duration.en,
      JSON.stringify(p.keywords), JSON.stringify(p.steps), JSON.stringify(p.documents), p.published, nowStamp(), cur.id);
    return { ok: true };
  }));
  ad.delete('/procedures/:id', wrap(async (req) => { await db.run('DELETE FROM procedures WHERE id=?', Number(req.params.id) || 0); return { ok: true }; }));

  ad.get('/agents', wrap(async () => ({ agents: (await db.all("SELECT * FROM agents ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id")).map((r) => ({ ...toAgent(r), phone: r.phone })) })));
  ad.patch('/agents/:id', wrap(async (req) => {
    const st = req.body?.status;
    if (!['pending', 'approved', 'rejected'].includes(st)) fail(400, 'invalid_status');
    const r = await db.run('UPDATE agents SET status=? WHERE id=?', st, Number(req.params.id) || 0);
    if (!r.changes) fail(404, 'not_found');
    return { ok: true };
  }));

  ad.get('/bookings', wrap(async () => ({ bookings: (await db.all(`SELECT x.*, u.name user_name, u.phone user_phone FROM (${BOOKING_SELECT}) x JOIN users u ON u.id=x.user_id ORDER BY x.id DESC`)).map(toBooking) })));
  ad.patch('/bookings/:id', wrap(async (req) => {
    const r = (await db.get(`${BOOKING_SELECT} WHERE b.id=?`, Number(req.params.id) || 0)) || fail(404, 'not_found');
    const st = req.body?.status;
    const i = BOOKING_FLOW.indexOf(r.status);
    if (!(BOOKING_FLOW.indexOf(st) === i + 1 || (st === 'cancelled' && !['done', 'cancelled'].includes(r.status)))) fail(409, 'invalid_transition');
    const h = JSON.parse(r.history); h.push({ status: st, at: new Date().toISOString() });
    await db.run('UPDATE bookings SET status=?, history=?, updated_at=? WHERE id=?', st, JSON.stringify(h), nowStamp(), r.id);
    const L = { accepted: ['قَبِل المندوب طلبك', 'Agent accepted your booking'], in_progress: ['المندوب بدأ العمل على معاملتك', 'Agent started on your request'], done: ['اكتملت المعاملة', 'Your request is complete'], cancelled: ['أُلغي الحجز', 'Booking cancelled'] }[st];
    await notify(r.user_id, { key: `booking:${r.id}:${st}`, kind: 'booking', title_ar: L[0], title_en: L[1], body_ar: `${r.agent_name_ar} – ${r.proc_title_ar || ''}`, body_en: `${r.agent_name_en} – ${r.proc_title_en || ''}`, link: '#/bookings' });
    return { ok: true };
  }));

  // ---------- errors + static
  api.use((req, res) => res.status(404).json({ error: 'not_found' }));
  app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0 }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, ...(err.extra || {}) });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'file_too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });

  app.locals.ready = ready();
  app.locals.runReminders = (id) => ready().then(() => runReminders(id));
  app.locals.db = () => db;
  return app;
}

function addDaysStr(base, n) {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  const app = createApp();
  app.locals.ready.then(() => app.listen(port, () => console.log(`Murshidak running on http://localhost:${port}`)))
    .catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
}
