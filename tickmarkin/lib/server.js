// Tickmarkin Institute website — zero-dependency Node.js server.
// Serves the public pages, handles registrations and contact messages,
// and provides a password-protected admin panel.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createStore } = require('./stores');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'site');
const PARTIALS_DIR = path.join(ROOT, 'partials');
const CATALOG_FILE = path.join(ROOT, 'data', 'courses.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const STATUSES = ['new', 'contacted', 'confirmed', 'cancelled'];
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 20 * 1024;

// ---------- helpers ----------
const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max = 2000) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
// Accept digits with optional leading +, spaces or dashes; 8–15 digits.
const normalizePhone = (v) => {
  const s = clean(v, 30).replace(/[\s\-()]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  return /^\+?\d{8,15}$/.test(s) ? s : null;
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf || typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('bad_json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // block spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
};

// ---------- html includes (shared with scripts/build.js) ----------
function loadPartials() {
  const out = {};
  for (const name of ['header', 'footer']) out[name] = fs.readFileSync(path.join(PARTIALS_DIR, name + '.html'), 'utf8');
  return out;
}
const renderHtml = (html, partials) => html
  .replace('<!--#header-->', partials.header)
  .replace('<!--#footer-->', partials.footer)
  .replace(/\{\{year\}\}/g, String(new Date().getFullYear()));

// ---------- server ----------
function createHandler(options = {}) {
  const store = createStore(options);
  const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  const courseById = new Map(catalog.courses.map((c) => [c.id, c]));

  let adminPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(9).toString('base64url');
    console.log(`[admin] ADMIN_PASSWORD is not set. Temporary password for this run: ${adminPassword}`);
  }
  const adminHash = sha256(adminPassword);
  // Stateless signed session cookie (works on serverless where memory is not shared).
  // Changing ADMIN_PASSWORD or SESSION_SECRET invalidates every session.
  const sessionKey = crypto.createHmac('sha256', String(options.sessionSecret ?? process.env.SESSION_SECRET ?? '')).update(adminPassword).digest();
  const signSession = (exp) => {
    const payload = String(exp) + '.' + crypto.randomBytes(12).toString('base64url');
    return payload + '.' + crypto.createHmac('sha256', sessionKey).update(payload).digest('base64url');
  };
  const hits = new Map(); // ip:bucket -> {count, reset}
  const secureCookie = options.secureCookie ?? process.env.NODE_ENV === 'production';

  const partials = loadPartials();

  function rateLimited(req, bucket, limit, windowMs) {
    const ip = (options.trustProxy || process.env.TRUST_PROXY || process.env.VERCEL)
      ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress
      : req.socket?.remoteAddress;
    const key = ip + ':' + bucket;
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return false;
    }
    e.count += 1;
    return e.count > limit;
  }

  function isAdmin(req) {
    const t = parseCookies(req).tm_admin || '';
    const i = t.lastIndexOf('.');
    if (i < 0) return false;
    const payload = t.slice(0, i);
    const sig = Buffer.from(t.slice(i + 1));
    const good = Buffer.from(crypto.createHmac('sha256', sessionKey).update(payload).digest('base64url'));
    if (sig.length !== good.length || !crypto.timingSafeEqual(sig, good)) return false;
    return Number(payload.split('.')[0]) > Date.now();
  }

  function sameOrigin(req) {
    // Reject cross-site state-changing requests (CSRF defence in addition to SameSite cookies).
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  async function handleApi(req, res, url) {
    const p = url.pathname;
    const m = req.method;

    if (m !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'forbidden' });

    if (p === '/api/catalog' && m === 'GET') {
      return send(res, 200, catalog, { 'Cache-Control': 'public, max-age=300' });
    }

    if (p === '/api/register' && m === 'POST') {
      if (rateLimited(req, 'post', 10, 10 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' });
      const b = await readBody(req);
      if (b.website) return send(res, 200, { ok: true }); // honeypot field filled → bot
      const errors = {};
      const name = clean(b.name, 100);
      const phone = normalizePhone(b.phone);
      const email = clean(b.email, 120).toLowerCase();
      const course = courseById.get(clean(b.courseId, 60));
      const mode = clean(b.mode, 30);
      const studentType = clean(b.studentType, 30);
      const notes = cleanMultiline(b.notes, 1000);
      if (name.length < 3) errors.name = 'الرجاء كتابة الاسم الكامل';
      if (!phone) errors.phone = 'رقم الجوال غير صحيح';
      if (email && !isEmail(email)) errors.email = 'البريد الإلكتروني غير صحيح';
      if (!course) errors.courseId = 'الرجاء اختيار الدورة';
      if (!['حضوري', 'عن بُعد'].includes(mode)) errors.mode = 'الرجاء اختيار طريقة الحضور';
      if (!b.agree) errors.agree = 'يجب الموافقة على الشروط';
      if (Object.keys(errors).length) return send(res, 422, { error: 'validation', fields: errors });

      const reg = {
        id: 'TM-' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase(),
        createdAt: new Date().toISOString(),
        status: 'new',
        name, phone, email,
        courseId: course.id,
        courseTitle: course.title,
        mode, studentType, notes,
      };
      await store.addRegistration(reg);
      return send(res, 201, { ok: true, id: reg.id, course: course.title });
    }

    if (p === '/api/contact' && m === 'POST') {
      if (rateLimited(req, 'post', 10, 10 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' });
      const b = await readBody(req);
      if (b.website) return send(res, 200, { ok: true });
      const errors = {};
      const name = clean(b.name, 100);
      const contact = clean(b.contact, 120);
      const subject = clean(b.subject, 120);
      const message = cleanMultiline(b.message, 2000);
      if (name.length < 2) errors.name = 'الرجاء كتابة الاسم';
      if (!(isEmail(contact) || normalizePhone(contact))) errors.contact = 'اكتب بريداً إلكترونياً أو رقم جوال صحيح';
      if (message.length < 5) errors.message = 'الرسالة قصيرة جداً';
      if (Object.keys(errors).length) return send(res, 422, { error: 'validation', fields: errors });
      await store.addMessage({
        id: 'MSG-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        createdAt: new Date().toISOString(),
        read: false,
        name, contact, subject, message,
      });
      return send(res, 201, { ok: true });
    }

    // ----- admin -----
    if (p === '/api/admin/login' && m === 'POST') {
      if (rateLimited(req, 'login', 8, 15 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' });
      const b = await readBody(req);
      if (!crypto.timingSafeEqual(sha256(String(b.password ?? '')), adminHash)) {
        return send(res, 401, { error: 'wrong_password' });
      }
      const token = signSession(Date.now() + SESSION_TTL_MS);
      const cookie = `tm_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secureCookie ? '; Secure' : ''}`;
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie });
    }

    if (p === '/api/admin/logout' && m === 'POST') {
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'tm_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
    }

    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });

      if (p === '/api/admin/data' && m === 'GET') {
        const [regs, messages] = await Promise.all([store.listRegistrations(), store.listMessages()]);
        const byStatus = Object.fromEntries(STATUSES.map((s) => [s, regs.filter((r) => r.status === s).length]));
        const byDept = {};
        for (const r of regs) {
          const d = courseById.get(r.courseId)?.dept || 'other';
          byDept[d] = (byDept[d] || 0) + 1;
        }
        return send(res, 200, {
          registrations: regs,
          messages,
          stats: { total: regs.length, byStatus, byDept, unreadMessages: messages.filter((x) => !x.read).length },
          storage: store.kind,
        });
      }

      const regMatch = p.match(/^\/api\/admin\/registrations\/([\w-]+)$/);
      if (regMatch && m === 'PATCH') {
        const b = await readBody(req);
        if (!STATUSES.includes(b.status)) return send(res, 422, { error: 'bad_status' });
        const rec = await store.updateRegistration(regMatch[1], { status: b.status, updatedAt: new Date().toISOString() });
        return rec ? send(res, 200, { ok: true, registration: rec }) : send(res, 404, { error: 'not_found' });
      }
      if (regMatch && m === 'DELETE') {
        return (await store.deleteRegistration(regMatch[1])) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not_found' });
      }

      const msgMatch = p.match(/^\/api\/admin\/messages\/([\w-]+)$/);
      if (msgMatch && m === 'PATCH') {
        return (await store.updateMessage(msgMatch[1], { read: true })) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not_found' });
      }
      if (msgMatch && m === 'DELETE') {
        return (await store.deleteMessage(msgMatch[1])) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not_found' });
      }

      if (p === '/api/admin/export.csv' && m === 'GET') {
        const cols = ['id', 'createdAt', 'status', 'name', 'phone', 'email', 'courseTitle', 'mode', 'studentType', 'notes'];
        const head = ['رقم الطلب', 'التاريخ', 'الحالة', 'الاسم', 'الجوال', 'البريد', 'الدورة', 'طريقة الحضور', 'الفئة', 'ملاحظات'];
        const lines = [head.map(csvCell).join(',')];
        for (const r of await store.listRegistrations()) lines.push(cols.map((c) => csvCell(r[c])).join(','));
        return send(res, 200, '﻿' + lines.join('\r\n'), {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="tickmarkin-registrations.csv"',
        });
      }
    }

    return send(res, 404, { error: 'not_found' });
  }

  async function serveStatic(req, res, url) {
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, 'Bad request');
    }
    if (rel.endsWith('/')) rel += 'index';
    if (!path.extname(rel)) rel += '.html';
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

    let content;
    let status = 200;
    let target = file;
    try {
      content = await fsp.readFile(file);
    } catch {
      status = 404;
      target = path.join(PUBLIC_DIR, '404.html');
      content = await fsp.readFile(target);
    }
    const ext = path.extname(target);
    if (ext === '.html') content = renderHtml(content.toString('utf8'), partials);
    res.writeHead(status, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') return res.end();
    res.end(content);
  }

  return async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-src https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      if (url.pathname === '/admin') res.setHeader('X-Robots-Tag', 'noindex');
      return await serveStatic(req, res, url);
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      console.error(err);
      if (!res.headersSent) send(res, err.upstream ? 502 : 500, { error: err.upstream ? 'storage_unavailable' : 'server_error' });
    }
  };
}

const createApp = (options) => http.createServer(createHandler(options));

module.exports = { createApp, createHandler, loadPartials, renderHtml, PUBLIC_DIR };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Tickmarkin running on http://localhost:${port} (storage: ${process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'file'})`));
}
