import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.js';
import { initKey, encrypt, decrypt, decryptText, encryptText, sha256, randomToken, mask } from './lib/crypto.js';
import { seedIfEmpty, insertProcedure } from './lib/seed.js';
import { migrate } from './lib/migrations.js';
import * as providers from './lib/providers.js';
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
  const s = String(p || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/\D/g, '').replace(/^(00965|965)/, '');
  return /^[4569]\d{7}$/.test(s) ? s : null;
};

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, extra) => { throw new HttpError(status, code, extra); };

export function createApp({
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  databaseUrl = process.env.DATABASE_URL,
  // Sample accounts (99999999 / 98888888 / 90000000) are for local development only, never a live database.
  demoAccounts = process.env.SEED_DEMO_ACCOUNTS ? process.env.SEED_DEMO_ACCOUNTS === '1' : !databaseUrl,
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
    await db.init(async (t) => { await seedIfEmpty(t, kuwaitToday(), { demoAccounts }); await migrate(t); });
    runReminders().catch((e) => console.error('[reminders]', e.message));
  })().catch((e) => { readyPromise = null; throw e; }));
  ready().catch((e) => console.error('[startup]', e.message));
  // No default admin: only numbers listed here become admins (on sign-up or their next sign-in).
  const adminPhones = new Set(String(process.env.ADMIN_PHONES || '').split(',').map((s) => normPhone(s)).filter(Boolean));
  // The OTP is shown on screen only while no SMS provider is configured.
  const demoOtp = () => !providers.status().sms;
  const publicUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const COMMISSION_PCT = Math.max(0, Math.min(100, Number(process.env.AGENT_COMMISSION_PCT ?? 10)));

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
      .then(async (u) => {
        // A paid period that has ended falls back to the Free plan (documents are kept).
        if (u && u.plan !== 'free' && u.plan_expires_at && u.plan_expires_at < nowStamp()) {
          await db.run("UPDATE users SET plan='free', plan_expires_at=NULL WHERE id=?", u.id);
          u.plan = 'free'; u.plan_expires_at = null;
        }
        req.user = u; next();
      }).catch(next);
  });
  const auth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'unauthorized')));
  const admin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(new HttpError(403, 'forbidden')));
  const agentFor = (u) => db.get("SELECT * FROM agents WHERE phone=? AND status='approved'", u.phone);

  const publicUser = async (u) => ({
    id: u.id, phone: u.phone, phoneMasked: mask(u.phone), name: u.name, role: u.role, plan: u.plan, lang: u.lang,
    planExpiresAt: u.plan_expires_at || null, notifyPush: !!u.notify_push, notifyWhatsapp: !!u.notify_whatsapp,
    isAgent: !!(await agentFor(u)),
    limits: { ...PLANS[u.plan], maxDocuments: PLANS[u.plan].maxDocuments === Infinity ? null : PLANS[u.plan].maxDocuments },
  });
  const userById = (id) => db.get('SELECT * FROM users WHERE id=?', id);

  api.get('/health', wrap(async () => ({ ok: true, db: db.kind, procedures: (await db.get(`SELECT ${COUNT} c FROM procedures`)).c })));

  api.get('/config', wrap(() => {
    const live = providers.status();
    return {
      demoOtp: demoOtp(), ai: live.ai, providers: live, vapidPublicKey: live.push ? process.env.VAPID_PUBLIC_KEY.trim() : null,
      sahelUrl: SAHEL_URL, entities: ENTITIES, categories: CATEGORIES,
      plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, maxDocuments: v.maxDocuments === Infinity ? null : v.maxDocuments }])),
      today: today(),
    };
  }));

  // ----- auth (phone + OTP)
  api.post('/auth/request-otp', wrap(async (req) => {
    const phone = normPhone(req.body?.phone);
    if (!phone) fail(400, 'invalid_phone');
    limit('otp:' + phone, 3, 10 * 60e3);
    limit('otpip:' + req.ip, 20, 10 * 60e3);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await db.run(`INSERT INTO otps (phone,code_hash,expires_at,attempts) VALUES (?,?,?,0)
      ON CONFLICT (phone) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0`, phone, sha256(phone + ':' + code), Date.now() + 5 * 60e3);
    if (!demoOtp()) {
      try { await providers.sendSms(phone, `رمز الدخول إلى مرشدك: ${code}\nYour Murshidak code: ${code}`); }
      catch (e) { console.error('[sms]', e.message); fail(502, 'sms_failed'); }
      return { sent: true, demo: false };
    }
    // No SMS provider configured: the code is returned so the flow can be tried (labelled "demo" in the UI).
    return { sent: true, demo: true, devCode: code };
  }));

  api.post('/auth/verify', wrap(async (req, res) => {
    const phone = normPhone(req.body?.phone);
    const code = String(req.body?.code || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf)).trim();
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
    } else if (adminPhones.has(phone) && user.role !== 'admin') {
      await db.run("UPDATE users SET role='admin' WHERE id=?", user.id);
      user = await userById(user.id);
    }
    const token = randomToken();
    await db.run('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', sha256(token), user.id, Date.now() + 30 * 86400e3);
    res.setHeader('Set-Cookie', `msid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${process.env.COOKIE_SECURE || process.env.VERCEL ? '; Secure' : ''}`);
    await runReminders(user.id);
    return { user: await publicUser(user), isNew };
  }));

  api.post('/auth/logout', wrap(async (req, res) => {
    const m = /(?:^|;\s*)msid=([^;]+)/.exec(req.headers.cookie || '');
    if (m) await db.run('DELETE FROM sessions WHERE token_hash=?', sha256(m[1]));
    res.setHeader('Set-Cookie', 'msid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  api.get('/me', auth, wrap(async (req) => ({ user: await publicUser(req.user) })));
  api.patch('/me', auth, wrap(async (req) => {
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 80) : req.user.name;
    const lang = ['ar', 'en'].includes(req.body?.lang) ? req.body.lang : req.user.lang;
    const flag = (k, cur) => (typeof req.body?.[k] === 'boolean' ? (req.body[k] ? 1 : 0) : cur);
    await db.run('UPDATE users SET name=?, lang=?, notify_push=?, notify_whatsapp=? WHERE id=?', name, lang,
      flag('notifyPush', req.user.notify_push), flag('notifyWhatsapp', req.user.notify_whatsapp), req.user.id);
    if (req.body?.name !== undefined) await db.run("UPDATE members SET name=? WHERE user_id=? AND relation='self'", name, req.user.id);
    return { user: await publicUser(await userById(req.user.id)) };
  }));
  api.delete('/me', auth, wrap(async (req, res) => {
    await db.run('DELETE FROM users WHERE id=?', req.user.id); // cascades to members, documents, files, sessions, bookings…
    res.setHeader('Set-Cookie', 'msid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return { ok: true };
  }));

  const checkDowngrade = async (userId, plan) => {
    if (plan === 'free') {
      const c = (await db.get(`SELECT ${COUNT} c FROM documents WHERE user_id=?`, userId)).c;
      if (c > PLANS.free.maxDocuments) fail(409, 'too_many_documents_for_free', { count: c });
    }
    if (plan !== 'business' && await db.get("SELECT 1 x FROM members WHERE user_id=? AND relation='employee'", userId)) fail(409, 'has_employees');
  };

  // Plan change. With a payment provider configured, paid plans go through /billing/checkout
  // and are activated only by a verified payment. Without one (demo), the switch is free and the UI says so.
  api.post('/plan', auth, wrap(async (req) => {
    const plan = req.body?.plan;
    if (!PLANS[plan]) fail(400, 'invalid_plan');
    if (plan !== 'free' && providers.status().payments) fail(402, 'payment_required');
    await checkDowngrade(req.user.id, plan);
    await db.run('UPDATE users SET plan=?, plan_expires_at=NULL WHERE id=?', plan, req.user.id);
    await runReminders(req.user.id);
    return { user: await publicUser(await userById(req.user.id)), paymentCollected: false };
  }));

  // ----- billing (MyFatoorah: KNET + cards)
  api.post('/billing/checkout', auth, wrap(async (req) => {
    const plan = req.body?.plan;
    if (!['family', 'business'].includes(plan)) fail(400, 'invalid_plan');
    if (!providers.status().payments) fail(503, 'payments_not_configured');
    await checkDowngrade(req.user.id, plan);
    limit('pay:' + req.user.id, 10, 3600e3);
    const reference = `M${req.user.id}-${plan}-${randomToken().slice(0, 12)}`;
    const amount = PLANS[plan].price;
    const base = publicUrl(req);
    const inv = await providers.createInvoice({
      amount, reference, customerName: req.user.name, phone: req.user.phone, lang: req.user.lang,
      callbackUrl: `${base}/api/billing/callback`, errorUrl: `${base}/api/billing/callback`,
    }).catch((e) => { console.error('[billing]', e.message); fail(502, 'payment_provider_error'); });
    await db.run('INSERT INTO payments (user_id,plan,amount_kwd,provider,reference,invoice_id) VALUES (?,?,?,?,?,?)',
      req.user.id, plan, amount, 'myfatoorah', reference, inv.invoiceId);
    return { url: inv.url };
  }));

  // MyFatoorah redirects the browser here. The plan is activated only after asking MyFatoorah
  // directly (server-to-server) whether the payment is Paid, for the right amount and reference.
  api.get('/billing/callback', wrap(async (req, res) => {
    const paymentId = String(req.query.paymentId || req.query.Id || '');
    let outcome = 'failed';
    if (paymentId && providers.status().payments) {
      try {
        const st = await providers.getPaymentStatus(paymentId);
        const p = await db.get("SELECT * FROM payments WHERE reference=? AND invoice_id=?", st.reference || '', st.invoiceId);
        if (p && st.status === 'Paid' && Math.abs(st.amount - Number(p.amount_kwd)) < 0.001) {
          await db.tx(async (t) => {
            const upd = await t.run("UPDATE payments SET status='paid', paid_at=? WHERE id=? AND status<>'paid'", nowStamp(), p.id);
            if (upd.changes) {
              const u = await t.get('SELECT plan, plan_expires_at FROM users WHERE id=?', p.user_id);
              // Renewing the same plan extends from the current end date; a new plan starts today.
              const from = u.plan === p.plan && u.plan_expires_at && u.plan_expires_at > nowStamp() ? new Date(u.plan_expires_at.replace(' ', 'T') + 'Z') : new Date();
              const until = new Date(from.getTime() + 30 * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
              await t.run('UPDATE users SET plan=?, plan_expires_at=? WHERE id=?', p.plan, until, p.user_id);
            }
          });
          outcome = 'paid';
        } else if (p) await db.run("UPDATE payments SET status='failed' WHERE id=? AND status='pending'", p.id);
      } catch (e) { console.error('[billing] verify', e.message); }
    }
    res.redirect(302, `/#/plans?payment=${outcome}`);
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

  // Read type / number / expiry from a photo with the AI provider. The image is not stored here;
  // the client saves it with the document afterwards. The privacy page discloses this.
  api.post('/documents/scan', auth, wrap(async (req) => {
    if (!providers.status().ai) fail(503, 'ai_not_configured');
    limit('scan:' + req.user.id, 20, 3600e3);
    const mime = String(req.body?.mime || '');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) fail(415, 'unsupported_type');
    const data = String(req.body?.data || '');
    if (!data || data.length > MAX_FILE * 1.4) fail(413, 'file_too_large');
    try { return { result: await providers.scanDocument(mime, data) }; }
    catch (e) { console.error('[scan]', e.message); fail(502, 'scan_failed'); }
  }));

  // Business plan: bulk-import employees with their residency (rows parsed from Excel/CSV on the device).
  api.post('/members/import', auth, wrap(async (req) => {
    if (!PLANS[req.user.plan].employees) fail(402, 'plan_required', { plan: 'business' });
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) fail(400, 'empty');
    if (rows.length > 500) fail(400, 'too_many_rows', { max: 500 });
    const errors = [];
    let imported = 0;
    await db.tx(async (t) => {
      for (const [i, row] of rows.entries()) {
        const name = String(row.name || '').trim().slice(0, 80);
        const type = DOC_TYPES.includes(row.type) ? row.type : 'residency';
        const expiry = String(row.expiry_date || '').trim();
        const rowNo = Number(row._row) || i + 2; // spreadsheet row as the user sees it
        if (!name) { errors.push({ row: rowNo, error: 'name_required' }); continue; }
        if (!validDate(expiry)) { errors.push({ row: rowNo, error: 'invalid_date' }); continue; }
        const { id: mid } = await t.run('INSERT INTO members (user_id,name,relation,nationality) VALUES (?,?,?,?)', req.user.id, name, 'employee', String(row.nationality || '').slice(0, 40));
        await t.run('INSERT INTO documents (user_id,member_id,type,label,number_enc,expiry_date,notes) VALUES (?,?,?,?,?,?,?)',
          req.user.id, mid, type, '', encryptText(String(row.number || '').slice(0, 40)), expiry, String(row.notes || '').slice(0, 300));
        imported++;
      }
    });
    await runReminders(req.user.id);
    return { imported, errors };
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
    rating: r.rating ?? null, review: r.review || '',
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
  // Rate the agent once the request is done; the agent's average is recomputed from all ratings.
  api.post('/bookings/:id/rate', auth, wrap(async (req) => {
    const r = (await db.get('SELECT * FROM bookings WHERE id=? AND user_id=?', Number(req.params.id) || 0, req.user.id)) || fail(404, 'not_found');
    if (r.status !== 'done') fail(409, 'not_done');
    if (r.rating) fail(409, 'already_rated');
    const rating = Math.round(Number(req.body?.rating));
    if (!(rating >= 1 && rating <= 5)) fail(400, 'invalid_rating');
    await db.tx(async (t) => {
      await t.run('UPDATE bookings SET rating=?, review=? WHERE id=?', rating, String(req.body?.review || '').trim().slice(0, 500), r.id);
      const a = await t.get('SELECT rating, reviews FROM agents WHERE id=?', r.agent_id);
      const n = Number(a.reviews) + 1;
      await t.run('UPDATE agents SET rating=?, reviews=? WHERE id=?', Math.round(((Number(a.rating) * Number(a.reviews) + rating) / n) * 10) / 10, n, r.agent_id);
    });
    return { ok: true };
  }));

  /** Move a booking one stage forward (or cancel it) and notify the customer. Used by admins and agents. */
  async function advanceBooking(r, st) {
    const i = BOOKING_FLOW.indexOf(r.status);
    if (!(BOOKING_FLOW.indexOf(st) === i + 1 || (st === 'cancelled' && !['done', 'cancelled'].includes(r.status)))) fail(409, 'invalid_transition');
    const h = JSON.parse(r.history); h.push({ status: st, at: new Date().toISOString() });
    await db.run('UPDATE bookings SET status=?, history=?, updated_at=? WHERE id=?', st, JSON.stringify(h), nowStamp(), r.id);
    const L = { accepted: ['قَبِل المندوب طلبك', 'Agent accepted your booking'], in_progress: ['المندوب بدأ العمل على معاملتك', 'Agent started on your request'], done: ['اكتملت المعاملة – قيّم المندوب', 'Your request is complete – rate the agent'], cancelled: ['أُلغي الحجز', 'Booking cancelled'] }[st];
    await notify(r.user_id, { key: `booking:${r.id}:${st}`, kind: 'booking', title_ar: L[0], title_en: L[1], body_ar: `${r.agent_name_ar} – ${r.proc_title_ar || ''}`, body_en: `${r.agent_name_en} – ${r.proc_title_en || ''}`, link: '#/bookings' });
    await deliver(r.user_id).catch((e) => console.error('[deliver]', e.message));
  }

  // ----- agent portal: an approved agent signs in with the phone number on their agent profile.
  const agentOnly = async (req) => (await agentFor(req.user)) || fail(403, 'not_an_agent');
  api.get('/agent/bookings', auth, wrap(async (req) => {
    const a = await agentOnly(req);
    const rows = await db.all(`SELECT x.*, u.name user_name, u.phone user_phone FROM (${BOOKING_SELECT}) x JOIN users u ON u.id=x.user_id WHERE x.agent_id=? ORDER BY x.id DESC`, a.id);
    // The agent needs the customer's number to call them, but only for bookings they handle.
    return { agent: toAgent(a), bookings: rows.map((r) => ({ ...toBooking(r), customerPhone: ['accepted', 'in_progress'].includes(r.status) ? r.user_phone : null })) };
  }));
  api.patch('/agent/bookings/:id', auth, wrap(async (req) => {
    const a = await agentOnly(req);
    const r = (await db.get(`${BOOKING_SELECT} WHERE b.id=? AND b.agent_id=?`, Number(req.params.id) || 0, a.id)) || fail(404, 'not_found');
    await advanceBooking(r, req.body?.status);
    return { ok: true };
  }));

  // ----- error reports on procedures (anyone, signed in or not)
  api.post('/reports', wrap(async (req) => {
    limit('report:' + req.ip, 10, 3600e3);
    const message = String(req.body?.message || '').trim().slice(0, 1000);
    if (message.length < 5) fail(400, 'message_required');
    const p = (await db.get('SELECT id FROM procedures WHERE slug=?', String(req.body?.slug || ''))) || fail(404, 'not_found');
    await db.run('INSERT INTO reports (user_id,procedure_id,message) VALUES (?,?,?)', req.user?.id ?? null, p.id, message);
    return { ok: true };
  }));

  // ----- notifications
  api.get('/notifications', auth, wrap(async (req) => ({
    notifications: (await db.all('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100', req.user.id))
      .map((n) => ({ id: n.id, kind: n.kind, title: { ar: n.title_ar, en: n.title_en }, body: { ar: n.body_ar, en: n.body_en }, link: n.link, read: !!n.read, created_at: n.created_at })),
    remindersEnabled: PLANS[req.user.plan].reminders,
  })));
  api.post('/notifications/read-all', auth, wrap(async (req) => { await db.run('UPDATE notifications SET read=1 WHERE user_id=?', req.user.id); return { ok: true }; }));

  // Web Push subscription from the browser / installed app.
  api.post('/push/subscribe', auth, wrap(async (req) => {
    const s = req.body || {};
    const endpoint = String(s.endpoint || '');
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !s.keys?.p256dh || !s.keys?.auth) fail(400, 'invalid_subscription');
    await db.run(`INSERT INTO push_subscriptions (user_id,endpoint,p256dh,auth) VALUES (?,?,?,?)
      ON CONFLICT (endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
      req.user.id, endpoint, String(s.keys.p256dh).slice(0, 200), String(s.keys.auth).slice(0, 100));
    return { ok: true };
  }));
  api.post('/push/unsubscribe', auth, wrap(async (req) => {
    await db.run('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?', req.user.id, String(req.body?.endpoint || ''));
    return { ok: true };
  }));

  /**
   * Send not-yet-delivered notifications (from the last 3 days) by push and/or WhatsApp,
   * according to each user's preferences and the channels that are configured. Each
   * notification is delivered at most once.
   */
  async function deliver(userId) {
    const live = providers.status();
    if (!live.push && !live.whatsapp) return { sent: 0 };
    const since = new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 19).replace('T', ' ');
    const rows = await db.all(`SELECT n.*, u.phone, u.lang, u.notify_push, u.notify_whatsapp FROM notifications n JOIN users u ON u.id=n.user_id
      WHERE n.delivered_at IS NULL AND n.created_at >= ? ${userId ? 'AND n.user_id=?' : ''} ORDER BY n.id LIMIT 300`, since, ...(userId ? [userId] : []));
    let sent = 0;
    for (const n of rows) {
      // Claim it first so two concurrent runs never send the same notification twice.
      if (!(await db.run('UPDATE notifications SET delivered_at=? WHERE id=? AND delivered_at IS NULL', nowStamp(), n.id)).changes) continue;
      const en = n.lang === 'en';
      const title = en ? n.title_en : n.title_ar, body = en ? n.body_en : n.body_ar;
      if (live.push && n.notify_push) {
        for (const s of await db.all('SELECT * FROM push_subscriptions WHERE user_id=?', n.user_id)) {
          try {
            if ((await providers.sendPush(s, { title, body, url: '/' + (n.link || '#/notifications') })) === 'gone') await db.run('DELETE FROM push_subscriptions WHERE id=?', s.id);
            else sent++;
          } catch (e) { console.error('[push]', e.statusCode || e.message); }
        }
      }
      if (live.whatsapp && n.notify_whatsapp) {
        try { await providers.sendWhatsApp(n.phone, title, body); sent++; } catch (e) { console.error('[whatsapp]', e.message); }
      }
    }
    return { sent, checked: rows.length };
  }

  // "Send me a test" button in settings, so a user can confirm push/WhatsApp reach them.
  api.post('/notifications/test', auth, wrap(async (req) => {
    limit('ntest:' + req.user.id, 5, 3600e3);
    await notify(req.user.id, { key: `test:${req.user.id}:${Date.now()}`, kind: 'test', title_ar: 'تجربة تنبيهات مرشدك ✅', title_en: 'Murshidak test notification ✅', body_ar: 'إذا وصلتك هذه الرسالة فالتنبيهات تعمل.', body_en: 'If you received this, notifications work.', link: '#/notifications' });
    return deliver(req.user.id);
  }));

  // Daily job (Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET").
  api.get('/cron/reminders', wrap(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) fail(401, 'unauthorized');
    const created = await runReminders();
    return { created, ...(await deliver()) };
  }));

  // ----- admin
  const ad = express.Router();
  api.use('/admin', auth, admin, ad);
  ad.get('/stats', wrap(async () => ({
    users: (await db.get(`SELECT ${COUNT} c FROM users`)).c,
    documents: (await db.get(`SELECT ${COUNT} c FROM documents`)).c,
    procedures: (await db.get(`SELECT ${COUNT} c FROM procedures`)).c,
    pendingAgents: (await db.get(`SELECT ${COUNT} c FROM agents WHERE status='pending'`)).c,
    openBookings: (await db.get(`SELECT ${COUNT} c FROM bookings WHERE status IN ('requested','accepted','in_progress')`)).c,
    openReports: (await db.get(`SELECT ${COUNT} c FROM reports WHERE status='open'`)).c,
    plans: await db.all(`SELECT plan, ${COUNT} c FROM users GROUP BY plan`),
    // Commission owed by agents on completed bookings (AGENT_COMMISSION_PCT, default 10%).
    commission: {
      pct: COMMISSION_PCT,
      doneBookings: (await db.get(`SELECT ${COUNT} c FROM bookings WHERE status='done'`)).c,
      amount: Math.round(Number((await db.get("SELECT COALESCE(SUM(price_kwd),0) s FROM bookings WHERE status='done'")).s) * COMMISSION_PCT) / 100,
    },
    revenue: Number((await db.get("SELECT COALESCE(SUM(amount_kwd),0) s FROM payments WHERE status='paid'")).s),
    channels: providers.status(),
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
    await advanceBooking(r, req.body?.status);
    return { ok: true };
  }));

  ad.get('/reports', wrap(async () => ({
    reports: (await db.all(`SELECT r.*, p.slug, p.title_ar, p.title_en FROM reports r JOIN procedures p ON p.id=r.procedure_id
      ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.id DESC LIMIT 200`))
      .map((r) => ({ id: r.id, status: r.status, message: r.message, created_at: r.created_at, procedure: { id: r.procedure_id, slug: r.slug, title: { ar: r.title_ar, en: r.title_en } } })),
  })));
  ad.patch('/reports/:id', wrap(async (req) => {
    const st = req.body?.status === 'open' ? 'open' : 'resolved';
    if (!(await db.run('UPDATE reports SET status=? WHERE id=?', st, Number(req.params.id) || 0)).changes) fail(404, 'not_found');
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
