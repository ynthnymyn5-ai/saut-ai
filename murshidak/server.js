import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, tx } from './lib/db.js';
import { initKey, encrypt, decrypt, encryptText, decryptText, sha256, randomToken, randomId, mask } from './lib/crypto.js';
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
const MAX_FILE = 5 * 1024 * 1024;

/** Today's date in Kuwait (UTC+3, no DST). */
export function kuwaitToday(now = Date.now()) {
  return new Date(now + 3 * 3600e3).toISOString().slice(0, 10);
}
export function daysUntil(date, today = kuwaitToday()) {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400e3);
}
export const expiryLevel = (days) => (days < 30 ? 'red' : days < 90 ? 'yellow' : 'green');

const normPhone = (p) => {
  const s = String(p || '').replace(/\D/g, '').replace(/^(00965|965)/, '');
  return /^[4569]\d{7}$/.test(s) ? s : null;
};

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

export function createApp({ dataDir = process.env.DATA_DIR || path.join(__dirname, 'data') } = {}) {
  const db = openDb(dataDir);
  initKey(dataDir);
  seedIfEmpty(db, kuwaitToday());
  const uploads = path.join(dataDir, 'uploads');
  const adminPhones = new Set(String(process.env.ADMIN_PHONES || '90000000').split(',').map((s) => s.trim()).filter(Boolean));
  const demoOtp = !process.env.SMS_PROVIDER;

  // ---------- helpers
  const toProc = (r, { full = true } = {}) => r && ({
    id: r.id, slug: r.slug, category: r.category, mode: r.mode, popular: r.popular, published: !!r.published,
    title: { ar: r.title_ar, en: r.title_en }, summary: { ar: r.summary_ar, en: r.summary_en },
    fees: { ar: r.fees_ar, en: r.fees_en }, duration: { ar: r.duration_ar, en: r.duration_en },
    ...(full ? { steps: JSON.parse(r.steps), documents: JSON.parse(r.documents), keywords: JSON.parse(r.keywords) } : {}),
    updated_at: r.updated_at,
  });
  const procsForMatch = () => db.prepare('SELECT * FROM procedures WHERE published=1').all()
    .map((r) => ({ ...r, keywords: JSON.parse(r.keywords) }));

  const toAgent = (r) => r && ({
    id: r.id, name: { ar: r.name_ar, en: r.name_en }, bio: { ar: r.bio_ar, en: r.bio_en }, areas: { ar: r.areas_ar, en: r.areas_en },
    categories: JSON.parse(r.categories), rating: r.rating, reviews: r.reviews, price: r.price_kwd, years: r.years,
    status: r.status, verified: r.status === 'approved', phoneMasked: mask(r.phone),
  });

  const today = () => kuwaitToday();
  const toDoc = (r) => {
    const days = daysUntil(r.expiry_date, today());
    return {
      id: r.id, member_id: r.member_id, member_name: r.member_name, member_relation: r.member_relation,
      type: r.type, label: r.label, numberMasked: mask(decryptText(r.number_enc)), expiry_date: r.expiry_date,
      daysLeft: days, level: expiryLevel(days), notes: r.notes, hasFile: !!r.file_key, file_mime: r.file_mime,
    };
  };
  const DOC_SELECT = `SELECT d.*, m.name member_name, m.relation member_relation FROM documents d JOIN members m ON m.id=d.member_id`;

  const notify = (userId, n) => db.prepare(`INSERT OR IGNORE INTO notifications (user_id,dedupe_key,kind,title_ar,title_en,body_ar,body_en,link)
    VALUES (?,?,?,?,?,?,?,?)`).run(userId, n.key, n.kind, n.title_ar, n.title_en, n.body_ar || '', n.body_en || '', n.link || '');

  const DOC_NAMES = {
    civil_id: ['البطاقة المدنية', 'Civil ID'], passport: ['جواز السفر', 'Passport'], residency: ['الإقامة', 'Residency'],
    driving_license: ['رخصة القيادة', 'Driving license'], car_registration: ['دفتر السيارة', 'Car registration'], other: ['مستند', 'Document'],
  };
  /** In-app reminders at 30 and 7 days before expiry (and once when expired). Paid plans only. */
  function runReminders(userId) {
    const rows = db.prepare(`${DOC_SELECT} JOIN users u ON u.id=d.user_id WHERE u.plan != 'free' ${userId ? 'AND d.user_id=?' : ''}`)
      .all(...(userId ? [userId] : []));
    let created = 0;
    for (const r of rows) {
      const days = daysUntil(r.expiry_date, today());
      const [nAr, nEn] = DOC_NAMES[r.type];
      const label = { ar: r.label || nAr, en: r.label || nEn };
      const link = `#/wallet/doc/${r.id}`;
      const mk = (kind, title_ar, title_en, body_ar, body_en) => {
        created += notify(r.user_id, { key: `doc:${r.id}:${r.expiry_date}:${kind}`, kind, title_ar, title_en, body_ar, body_en, link }).changes;
      };
      if (days < 0) mk('expired', `انتهت ${label.ar} – ${r.member_name}`, `${label.en} expired – ${r.member_name}`, `انتهت منذ ${-days} يوم. جدّدها لتجنّب الغرامات.`, `Expired ${-days} days ago. Renew to avoid fines.`);
      else {
        if (days <= 30) mk('expiry_30', `${label.ar} لـ${r.member_name} تنتهي خلال 30 يوماً`, `${label.en} for ${r.member_name} expires within 30 days`, `متبقٍ ${days} يوم (${r.expiry_date}).`, `${days} days left (${r.expiry_date}).`);
        if (days <= 7) mk('expiry_7', `تنبيه عاجل: ${label.ar} لـ${r.member_name} تنتهي خلال 7 أيام`, `Urgent: ${label.en} for ${r.member_name} expires within 7 days`, `متبقٍ ${days} يوم فقط.`, `Only ${days} days left.`);
      }
    }
    return created;
  }
  runReminders();
  const reminderTimer = setInterval(() => runReminders(), 60 * 60 * 1000);
  reminderTimer.unref();

  // ---------- simple in-memory rate limiter
  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now();
    const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (h.length >= max) fail(429, 'rate_limited');
    h.push(now); hits.set(key, h);
  };

  // ---------- app
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8mb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    next();
  });

  // session
  app.use((req, res, next) => {
    const m = /(?:^|;\s*)msid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) {
      const s = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(sha256(m[1]), Date.now());
      if (s) req.user = s;
    }
    next();
  });
  const auth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'unauthorized')));
  const admin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(new HttpError(403, 'forbidden')));
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((out) => { if (out !== undefined && !res.headersSent) res.json(out); }).catch(next);
  const api = express.Router();
  app.use('/api', api);

  const publicUser = (u) => ({ id: u.id, phone: u.phone, phoneMasked: mask(u.phone), name: u.name, role: u.role, plan: u.plan, lang: u.lang, limits: { ...PLANS[u.plan], maxDocuments: PLANS[u.plan].maxDocuments === Infinity ? null : PLANS[u.plan].maxDocuments } });

  api.get('/config', wrap(() => ({
    demoOtp, ai: !!process.env.OPENAI_API_KEY, sahelUrl: SAHEL_URL, entities: ENTITIES, categories: CATEGORIES,
    plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, maxDocuments: v.maxDocuments === Infinity ? null : v.maxDocuments }])),
    today: today(),
  })));

  // ----- auth (phone + OTP)
  api.post('/auth/request-otp', wrap((req) => {
    const phone = normPhone(req.body?.phone);
    if (!phone) fail(400, 'invalid_phone');
    limit('otp:' + phone, 3, 10 * 60e3);
    limit('otpip:' + req.ip, 20, 10 * 60e3);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    db.prepare('INSERT OR REPLACE INTO otps (phone,code_hash,expires_at,attempts) VALUES (?,?,?,0)').run(phone, sha256(phone + ':' + code), Date.now() + 5 * 60e3);
    // No SMS provider wired yet: in demo mode the code is returned so the flow can be tried.
    if (demoOtp) console.log(`[otp] demo code for ${mask(phone)}: ${code}`);
    return { sent: true, demo: demoOtp, ...(demoOtp ? { devCode: code } : {}) };
  }));

  api.post('/auth/verify', wrap((req, res) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    if (!phone) fail(400, 'invalid_phone');
    const o = db.prepare('SELECT * FROM otps WHERE phone=?').get(phone);
    if (!o || o.expires_at < Date.now()) fail(400, 'otp_expired');
    if (o.attempts >= 5) fail(429, 'too_many_attempts');
    if (o.code_hash !== sha256(phone + ':' + code)) {
      db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone);
      fail(400, 'otp_wrong');
    }
    db.prepare('DELETE FROM otps WHERE phone=?').run(phone);
    let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
    let isNew = false;
    if (!user) {
      isNew = true;
      const name = String(req.body?.name || '').trim().slice(0, 80);
      const role = adminPhones.has(phone) ? 'admin' : 'user';
      tx(db, () => {
        const id = db.prepare('INSERT INTO users (phone,name,role) VALUES (?,?,?)').run(phone, name, role).lastInsertRowid;
        db.prepare('INSERT INTO members (user_id,name,relation) VALUES (?,?,?)').run(id, name || '—', 'self');
      });
      user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
    }
    const token = randomToken();
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(sha256(token), user.id, Date.now() + 30 * 86400e3);
    res.setHeader('Set-Cookie', `msid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${process.env.COOKIE_SECURE ? '; Secure' : ''}`);
    runReminders(user.id);
    return { user: publicUser(user), isNew };
  }));

  api.post('/auth/logout', wrap((req, res) => {
    const m = /(?:^|;\s*)msid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(m[1]));
    res.setHeader('Set-Cookie', 'msid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  api.get('/me', auth, wrap((req) => ({ user: publicUser(req.user) })));
  api.patch('/me', auth, wrap((req) => {
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : req.user.name;
    const lang = ['ar', 'en'].includes(req.body?.lang) ? req.body.lang : req.user.lang;
    db.prepare('UPDATE users SET name=?, lang=? WHERE id=?').run(name, lang, req.user.id);
    if (req.body?.name !== undefined) db.prepare("UPDATE members SET name=? WHERE user_id=? AND relation='self'").run(name, req.user.id);
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) };
  }));
  api.delete('/me', auth, wrap((req, res) => {
    const files = db.prepare('SELECT file_key FROM documents WHERE user_id=? AND file_key IS NOT NULL').all(req.user.id);
    db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
    for (const f of files) fs.rmSync(path.join(uploads, f.file_key), { force: true });
    res.setHeader('Set-Cookie', 'msid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  // Plan change. There is no payment provider in this version: the UI says so clearly.
  api.post('/plan', auth, wrap((req) => {
    const plan = req.body?.plan;
    if (!PLANS[plan]) fail(400, 'invalid_plan');
    if (plan === 'free') {
      const c = db.prepare('SELECT COUNT(*) c FROM documents WHERE user_id=?').get(req.user.id).c;
      if (c > PLANS.free.maxDocuments) fail(409, 'too_many_documents_for_free', { count: c });
    }
    if (plan !== 'business' && db.prepare("SELECT 1 FROM members WHERE user_id=? AND relation='employee'").get(req.user.id)) fail(409, 'has_employees');
    db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan, req.user.id);
    runReminders(req.user.id);
    return { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)), paymentCollected: false };
  }));

  // ----- procedures (public)
  api.get('/procedures', wrap((req) => {
    const rows = db.prepare('SELECT * FROM procedures WHERE published=1 ORDER BY popular DESC, id').all();
    let list = rows.map((r) => toProc(r, { full: false }));
    if (req.query.category) list = list.filter((p) => p.category === req.query.category);
    if (req.query.q) {
      const q = String(req.query.q).toLowerCase();
      list = list.filter((p) => (p.title.ar + p.title.en + p.summary.ar + p.summary.en).toLowerCase().includes(q));
    }
    return { procedures: list };
  }));
  api.get('/procedures/:slug', wrap((req) => {
    const r = db.prepare('SELECT * FROM procedures WHERE slug=? AND published=1').get(req.params.slug);
    if (!r) fail(404, 'not_found');
    const p = toProc(r);
    delete p.keywords;
    const cats = [p.category];
    const agents = db.prepare("SELECT * FROM agents WHERE status='approved' ORDER BY rating DESC").all().map(toAgent).filter((a) => a.categories.some((c) => cats.includes(c))).slice(0, 3);
    return { procedure: p, agents };
  }));

  api.post('/ask', wrap(async (req) => {
    const text = String(req.body?.text || '').trim();
    if (!text) fail(400, 'empty');
    if (text.length > 500) fail(400, 'too_long');
    limit('ask:' + req.ip, 30, 60e3);
    const procs = procsForMatch();
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
  api.get('/dashboard', auth, wrap((req) => {
    const docs = db.prepare(`${DOC_SELECT} WHERE d.user_id=? ORDER BY d.expiry_date`).all(req.user.id).map(toDoc);
    const popular = db.prepare('SELECT * FROM procedures WHERE published=1 ORDER BY popular DESC LIMIT 6').all().map((r) => toProc(r, { full: false }));
    const unread = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(req.user.id).c;
    const activeBookings = db.prepare("SELECT COUNT(*) c FROM bookings WHERE user_id=? AND status IN ('requested','accepted','in_progress')").get(req.user.id).c;
    return {
      upcoming: docs.slice(0, 5),
      counts: { red: docs.filter((d) => d.level === 'red').length, yellow: docs.filter((d) => d.level === 'yellow').length, green: docs.filter((d) => d.level === 'green').length, total: docs.length },
      popular, unread, activeBookings,
    };
  }));

  // ----- members
  const ownMember = (req, id) => db.prepare('SELECT * FROM members WHERE id=? AND user_id=?').get(id, req.user.id) || fail(404, 'not_found');
  const checkRelation = (req, relation) => {
    if (!RELATIONS.includes(relation) || relation === 'self') fail(400, 'invalid_relation');
    if (relation === 'employee' && !PLANS[req.user.plan].employees) fail(402, 'plan_required', { plan: 'business' });
  };
  api.get('/members', auth, wrap((req) => {
    const rows = db.prepare(`SELECT m.*, COUNT(d.id) doc_count, MIN(d.expiry_date) next_expiry FROM members m
      LEFT JOIN documents d ON d.member_id=m.id WHERE m.user_id=? GROUP BY m.id
      ORDER BY CASE m.relation WHEN 'self' THEN 0 WHEN 'spouse' THEN 1 WHEN 'child' THEN 2 WHEN 'parent' THEN 3 WHEN 'domestic_worker' THEN 4 ELSE 5 END, m.id`).all(req.user.id);
    return { members: rows.map((m) => ({ id: m.id, name: m.name, relation: m.relation, nationality: m.nationality, docCount: m.doc_count, nextExpiry: m.next_expiry, nextLevel: m.next_expiry ? expiryLevel(daysUntil(m.next_expiry, today())) : null })) };
  }));
  api.post('/members', auth, wrap((req) => {
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!name) fail(400, 'name_required');
    checkRelation(req, req.body?.relation);
    const id = db.prepare('INSERT INTO members (user_id,name,relation,nationality) VALUES (?,?,?,?)').run(req.user.id, name, req.body.relation, String(req.body?.nationality || '').slice(0, 40)).lastInsertRowid;
    return { id };
  }));
  api.patch('/members/:id', auth, wrap((req) => {
    const m = ownMember(req, req.params.id);
    const relation = m.relation === 'self' ? 'self' : (req.body?.relation ?? m.relation);
    if (relation !== m.relation) checkRelation(req, relation);
    const name = String(req.body?.name ?? m.name).trim().slice(0, 80) || m.name;
    db.prepare('UPDATE members SET name=?, relation=?, nationality=? WHERE id=?').run(name, relation, String(req.body?.nationality ?? m.nationality).slice(0, 40), m.id);
    return { ok: true };
  }));
  api.delete('/members/:id', auth, wrap((req) => {
    const m = ownMember(req, req.params.id);
    if (m.relation === 'self') fail(400, 'cannot_delete_self');
    const files = db.prepare('SELECT file_key FROM documents WHERE member_id=? AND file_key IS NOT NULL').all(m.id);
    db.prepare('DELETE FROM members WHERE id=?').run(m.id);
    for (const f of files) fs.rmSync(path.join(uploads, f.file_key), { force: true });
    return { ok: true };
  }));

  // ----- documents wallet
  const ownDoc = (req, id) => db.prepare(`${DOC_SELECT} WHERE d.id=? AND d.user_id=?`).get(id, req.user.id) || fail(404, 'not_found');
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
  api.get('/documents', auth, wrap((req) => {
    const rows = db.prepare(`${DOC_SELECT} WHERE d.user_id=? ${req.query.member_id ? 'AND d.member_id=?' : ''} ORDER BY d.expiry_date`)
      .all(req.user.id, ...(req.query.member_id ? [Number(req.query.member_id)] : []));
    const plan = PLANS[req.user.plan];
    return { documents: rows.map(toDoc), limit: plan.maxDocuments === Infinity ? null : plan.maxDocuments };
  }));
  api.get('/documents/:id', auth, wrap((req) => ({ document: toDoc(ownDoc(req, req.params.id)) })));
  // Full number only on explicit request from the owner (the "show" button), never in lists.
  api.get('/documents/:id/number', auth, wrap((req) => ({ number: decryptText(ownDoc(req, req.params.id).number_enc) })));
  api.post('/documents', auth, wrap((req) => {
    const b = req.body || {};
    ownMember(req, b.member_id);
    if (!DOC_TYPES.includes(b.type)) fail(400, 'invalid_type');
    if (!validDate(b.expiry_date)) fail(400, 'invalid_date');
    const max = PLANS[req.user.plan].maxDocuments;
    const count = db.prepare('SELECT COUNT(*) c FROM documents WHERE user_id=?').get(req.user.id).c;
    if (count >= max) fail(402, 'plan_limit', { max });
    const id = db.prepare('INSERT INTO documents (user_id,member_id,type,label,number_enc,expiry_date,notes) VALUES (?,?,?,?,?,?,?)')
      .run(req.user.id, b.member_id, b.type, String(b.label || '').slice(0, 60), encryptText(String(b.number || '').slice(0, 40)), b.expiry_date, String(b.notes || '').slice(0, 300)).lastInsertRowid;
    runReminders(req.user.id);
    return { id };
  }));
  api.patch('/documents/:id', auth, wrap((req) => {
    const d = ownDoc(req, req.params.id);
    const b = req.body || {};
    if (b.member_id !== undefined) ownMember(req, b.member_id);
    if (b.type !== undefined && !DOC_TYPES.includes(b.type)) fail(400, 'invalid_type');
    if (b.expiry_date !== undefined && !validDate(b.expiry_date)) fail(400, 'invalid_date');
    db.prepare('UPDATE documents SET member_id=?, type=?, label=?, number_enc=?, expiry_date=?, notes=? WHERE id=?').run(
      b.member_id ?? d.member_id, b.type ?? d.type, String(b.label ?? d.label).slice(0, 60),
      b.number !== undefined ? encryptText(String(b.number).slice(0, 40)) : d.number_enc,
      b.expiry_date ?? d.expiry_date, String(b.notes ?? d.notes).slice(0, 300), d.id);
    runReminders(req.user.id);
    return { ok: true };
  }));
  api.delete('/documents/:id', auth, wrap((req) => {
    const d = ownDoc(req, req.params.id);
    db.prepare('DELETE FROM documents WHERE id=?').run(d.id);
    if (d.file_key) fs.rmSync(path.join(uploads, d.file_key), { force: true });
    return { ok: true };
  }));
  // Upload a photo/PDF (base64 JSON). Stored encrypted (AES-256-GCM) outside the web root.
  api.put('/documents/:id/file', auth, wrap((req) => {
    const d = ownDoc(req, req.params.id);
    const mime = String(req.body?.mime || '');
    if (!MIME_OK[mime]) fail(415, 'unsupported_type');
    const buf = Buffer.from(String(req.body?.data || ''), 'base64');
    if (!buf.length) fail(400, 'empty_file');
    if (buf.length > MAX_FILE) fail(413, 'file_too_large');
    const magic = MIME_OK[mime];
    if (buf[0] !== magic[0] || buf[1] !== magic[1]) fail(415, 'content_mismatch');
    const key = randomId() + '.bin';
    fs.writeFileSync(path.join(uploads, key), encrypt(buf), { mode: 0o600 });
    db.prepare('UPDATE documents SET file_key=?, file_mime=? WHERE id=?').run(key, mime, d.id);
    if (d.file_key) fs.rmSync(path.join(uploads, d.file_key), { force: true });
    return { ok: true };
  }));
  api.get('/documents/:id/file', auth, wrap((req, res) => {
    const d = ownDoc(req, req.params.id);
    if (!d.file_key) fail(404, 'no_file');
    const buf = decrypt(fs.readFileSync(path.join(uploads, d.file_key)));
    res.set({ 'Content-Type': d.file_mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" });
    res.send(buf);
  }));
  api.delete('/documents/:id/file', auth, wrap((req) => {
    const d = ownDoc(req, req.params.id);
    if (d.file_key) fs.rmSync(path.join(uploads, d.file_key), { force: true });
    db.prepare('UPDATE documents SET file_key=NULL, file_mime=NULL WHERE id=?').run(d.id);
    return { ok: true };
  }));

  // ----- agents marketplace
  api.get('/agents', wrap((req) => {
    let list = db.prepare("SELECT * FROM agents WHERE status='approved'").all().map(toAgent);
    if (req.query.category) list = list.filter((a) => a.categories.includes(req.query.category));
    const sort = req.query.sort === 'price' ? (a, b) => a.price - b.price : (a, b) => b.rating - a.rating || b.reviews - a.reviews;
    return { agents: list.sort(sort) };
  }));
  // Agent sign-up: lands as "pending" until an admin approves it.
  api.post('/agents/apply', wrap((req) => {
    limit('apply:' + req.ip, 5, 3600e3);
    const b = req.body || {};
    const phone = normPhone(b.phone);
    const name = String(b.name || '').trim().slice(0, 80);
    const price = Number(b.price);
    if (!name || !phone || !(price > 0 && price < 1000)) fail(400, 'invalid_input');
    const cats = (Array.isArray(b.categories) ? b.categories : []).filter((c) => CATEGORIES[c]);
    const id = db.prepare(`INSERT INTO agents (name_ar,name_en,phone,bio_ar,bio_en,categories,areas_ar,areas_en,price_kwd,years,status) VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`)
      .run(name, name, phone, String(b.bio || '').slice(0, 300), String(b.bio || '').slice(0, 300), JSON.stringify(cats), String(b.areas || '').slice(0, 80), String(b.areas || '').slice(0, 80), price, Math.max(0, Math.min(60, Number(b.years) || 0))).lastInsertRowid;
    return { id, status: 'pending' };
  }));

  // ----- bookings
  const toBooking = (r) => ({
    id: r.id, status: r.status, preferred_date: r.preferred_date, notes: r.notes, price: r.price_kwd, created_at: r.created_at, updated_at: r.updated_at,
    history: JSON.parse(r.history),
    agent: { id: r.agent_id, name: { ar: r.agent_name_ar, en: r.agent_name_en }, rating: r.agent_rating },
    procedure: r.procedure_slug ? { slug: r.procedure_slug, title: { ar: r.proc_title_ar, en: r.proc_title_en } } : null,
    member: r.member_name ? { id: r.member_id, name: r.member_name } : null,
    user: r.user_name !== undefined ? { name: r.user_name, phoneMasked: mask(r.user_phone) } : undefined,
  });
  const BOOKING_SELECT = `SELECT b.*, a.name_ar agent_name_ar, a.name_en agent_name_en, a.rating agent_rating,
    p.slug procedure_slug, p.title_ar proc_title_ar, p.title_en proc_title_en, m.name member_name
    FROM bookings b JOIN agents a ON a.id=b.agent_id LEFT JOIN procedures p ON p.id=b.procedure_id LEFT JOIN members m ON m.id=b.member_id`;
  api.get('/bookings', auth, wrap((req) => ({ bookings: db.prepare(`${BOOKING_SELECT} WHERE b.user_id=? ORDER BY b.id DESC`).all(req.user.id).map(toBooking) })));
  api.post('/bookings', auth, wrap((req) => {
    const b = req.body || {};
    const agent = db.prepare("SELECT * FROM agents WHERE id=? AND status='approved'").get(b.agent_id) || fail(404, 'agent_not_found');
    const proc = b.procedure_slug ? (db.prepare('SELECT id FROM procedures WHERE slug=?').get(b.procedure_slug) || fail(404, 'procedure_not_found')) : null;
    if (b.member_id) ownMember(req, b.member_id);
    if (b.preferred_date && !validDate(b.preferred_date)) fail(400, 'invalid_date');
    const now = new Date().toISOString();
    const id = db.prepare('INSERT INTO bookings (user_id,agent_id,procedure_id,member_id,preferred_date,notes,price_kwd,history) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.user.id, agent.id, proc?.id ?? null, b.member_id || null, b.preferred_date || null, String(b.notes || '').slice(0, 500), agent.price_kwd, JSON.stringify([{ status: 'requested', at: now }])).lastInsertRowid;
    return { id, status: 'requested' };
  }));
  api.post('/bookings/:id/cancel', auth, wrap((req) => {
    const r = db.prepare('SELECT * FROM bookings WHERE id=? AND user_id=?').get(req.params.id, req.user.id) || fail(404, 'not_found');
    if (!['requested', 'accepted'].includes(r.status)) fail(409, 'cannot_cancel');
    const h = JSON.parse(r.history); h.push({ status: 'cancelled', at: new Date().toISOString() });
    db.prepare("UPDATE bookings SET status='cancelled', history=?, updated_at=datetime('now') WHERE id=?").run(JSON.stringify(h), r.id);
    return { ok: true };
  }));

  // ----- notifications
  api.get('/notifications', auth, wrap((req) => ({
    notifications: db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id)
      .map((n) => ({ id: n.id, kind: n.kind, title: { ar: n.title_ar, en: n.title_en }, body: { ar: n.body_ar, en: n.body_en }, link: n.link, read: !!n.read, created_at: n.created_at })),
    remindersEnabled: PLANS[req.user.plan].reminders,
  })));
  api.post('/notifications/read-all', auth, wrap((req) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); return { ok: true }; }));

  // ----- admin
  const ad = express.Router();
  api.use('/admin', auth, admin, ad);
  ad.get('/stats', wrap(() => ({
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    documents: db.prepare('SELECT COUNT(*) c FROM documents').get().c,
    procedures: db.prepare('SELECT COUNT(*) c FROM procedures').get().c,
    pendingAgents: db.prepare("SELECT COUNT(*) c FROM agents WHERE status='pending'").get().c,
    openBookings: db.prepare("SELECT COUNT(*) c FROM bookings WHERE status IN ('requested','accepted','in_progress')").get().c,
    plans: db.prepare('SELECT plan, COUNT(*) c FROM users GROUP BY plan').all(),
  })));
  ad.get('/procedures', wrap(() => ({ procedures: db.prepare('SELECT * FROM procedures ORDER BY popular DESC, id').all().map((r) => toProc(r)) })));

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
  ad.post('/procedures', wrap((req) => {
    const p = cleanProc(req.body || {});
    if (db.prepare('SELECT 1 FROM procedures WHERE slug=?').get(p.slug)) fail(409, 'slug_taken');
    const id = insertProcedure(db, p);
    db.prepare('UPDATE procedures SET published=? WHERE id=?').run(p.published, id);
    return { id };
  }));
  ad.put('/procedures/:id', wrap((req) => {
    const cur = db.prepare('SELECT * FROM procedures WHERE id=?').get(req.params.id) || fail(404, 'not_found');
    const p = cleanProc(req.body || {});
    if (p.slug !== cur.slug && db.prepare('SELECT 1 FROM procedures WHERE slug=?').get(p.slug)) fail(409, 'slug_taken');
    db.prepare(`UPDATE procedures SET slug=?, category=?, mode=?, popular=?, title_ar=?, title_en=?, summary_ar=?, summary_en=?, fees_ar=?, fees_en=?,
      duration_ar=?, duration_en=?, keywords=?, steps=?, documents=?, published=?, updated_at=datetime('now') WHERE id=?`).run(
      p.slug, p.category, p.mode, p.popular, p.title.ar, p.title.en, p.summary.ar, p.summary.en, p.fees.ar, p.fees.en, p.duration.ar, p.duration.en,
      JSON.stringify(p.keywords), JSON.stringify(p.steps), JSON.stringify(p.documents), p.published, cur.id);
    return { ok: true };
  }));
  ad.delete('/procedures/:id', wrap((req) => { db.prepare('DELETE FROM procedures WHERE id=?').run(req.params.id); return { ok: true }; }));

  ad.get('/agents', wrap(() => ({ agents: db.prepare("SELECT * FROM agents ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, id").all().map((r) => ({ ...toAgent(r), phone: r.phone })) })));
  ad.patch('/agents/:id', wrap((req) => {
    const st = req.body?.status;
    if (!['pending', 'approved', 'rejected'].includes(st)) fail(400, 'invalid_status');
    const r = db.prepare('UPDATE agents SET status=? WHERE id=?').run(st, req.params.id);
    if (!r.changes) fail(404, 'not_found');
    return { ok: true };
  }));

  ad.get('/bookings', wrap(() => ({ bookings: db.prepare(`SELECT x.*, u.name user_name, u.phone user_phone FROM (${BOOKING_SELECT}) x JOIN users u ON u.id=x.user_id ORDER BY x.id DESC`).all().map(toBooking) })));
  ad.patch('/bookings/:id', wrap((req) => {
    const r = db.prepare(`${BOOKING_SELECT} WHERE b.id=?`).get(req.params.id) || fail(404, 'not_found');
    const st = req.body?.status;
    const i = BOOKING_FLOW.indexOf(r.status);
    if (!(BOOKING_FLOW.indexOf(st) === i + 1 || (st === 'cancelled' && r.status !== 'done'))) fail(409, 'invalid_transition');
    const h = JSON.parse(r.history); h.push({ status: st, at: new Date().toISOString() });
    db.prepare("UPDATE bookings SET status=?, history=?, updated_at=datetime('now') WHERE id=?").run(st, JSON.stringify(h), r.id);
    const L = { accepted: ['قَبِل المندوب طلبك', 'Agent accepted your booking'], in_progress: ['المندوب بدأ العمل على معاملتك', 'Agent started on your request'], done: ['اكتملت المعاملة', 'Your request is complete'], cancelled: ['أُلغي الحجز', 'Booking cancelled'] }[st];
    notify(r.user_id, { key: `booking:${r.id}:${st}`, kind: 'booking', title_ar: L[0], title_en: L[1], body_ar: `${r.agent_name_ar} – ${r.proc_title_ar || ''}`, body_en: `${r.agent_name_en} – ${r.proc_title_en || ''}`, link: '#/bookings' });
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

  app.locals.db = db;
  app.locals.runReminders = runReminders;
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  createApp().listen(port, () => console.log(`Murshidak running on http://localhost:${port}`));
}
