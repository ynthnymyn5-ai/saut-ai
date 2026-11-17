import { I18N } from './i18n.js';
import { readSheet, excelSerialToIso } from './sheet.js';

// ---------------------------------------------------------------- state & helpers
const S = { config: null, user: null, lang: 'ar', unread: 0 };
const store = {
  get(k, d) { try { const v = localStorage.getItem('m_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('m_' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const t = (k) => I18N[S.lang][k] ?? I18N.ar[k] ?? k;
const L = (o) => (o ? o[S.lang] || o.ar || '' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const fmtDate = (d) => { try { return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(S.lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } };
const errMsg = (e) => t(e?.code) !== e?.code ? t(e.code) : t('error');

class ApiError extends Error { constructor(code, status, data) { super(code); this.code = code; this.status = status; this.data = data; } }
async function api(method, path, body) {
  const res = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth') && path !== '/me') { S.user = null; go('#/login'); }
    throw new ApiError(data.error || 'error', res.status, data);
  }
  return data;
}

function toast(msg) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function sheet(html, onMount) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeSheet(); });
  document.body.appendChild(bg);
  onMount?.(bg.firstElementChild);
}
const closeSheet = () => $('.sheet-bg')?.remove();

const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

// ---------------------------------------------------------------- icons
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  wallet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  agents: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/><path d="M12 15l-1.5 3 1.5 3 1.5-3z"/>',
  bookings: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  back: '<path d="M9 6l6 6-6 6"/>',
};
const svg = (name, size = 24, stroke = 'currentColor') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
const LOGO = `<span class="logo"><svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true"><path d="M14 48c0-9 7-11 14-11s14-3 14-12" fill="none" stroke="#7fb0ff" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 8"/><circle cx="14" cy="48" r="6" fill="#0b2e59"/><path d="M44 8c-6 0-11 5-11 11 0 9 11 19 11 19s11-10 11-19c0-6-5-11-11-11z" fill="#1f66d1"/><circle cx="44" cy="19" r="4" fill="#fff"/></svg></span>`;
const DOC_ICON = { civil_id: '🪪', passport: '🛂', residency: '📗', driving_license: '🚘', car_registration: '🚗', other: '📄' };
const REL_ICON = { self: '🙂', spouse: '💍', child: '🧒', parent: '👴', domestic_worker: '🧹', employee: '💼', other: '👤' };
const MODE_BADGE = { online: 'b-green', in_person: 'b-yellow', mixed: 'b-blue' };
const catIcon = (c) => S.config.categories[c]?.icon || '📋';

// Which roadmap helps renew a given document.
function renewSlug(doc) {
  const worker = ['domestic_worker'].includes(doc.member_relation);
  switch (doc.type) {
    case 'civil_id': return 'civil-id-renewal';
    case 'driving_license': return 'driving-license-renewal';
    case 'car_registration': return 'vehicle-registration-renewal';
    case 'passport': return ['domestic_worker', 'employee'].includes(doc.member_relation) ? null : 'kuwaiti-passport-renewal';
    case 'residency': return worker ? 'domestic-worker-residency-renewal' : ['spouse', 'child', 'parent'].includes(doc.member_relation) ? 'dependent-residency-renewal' : null;
    default: return null;
  }
}

// ---------------------------------------------------------------- shell
function setLang(lang) {
  S.lang = lang;
  store.set('lang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.title = lang === 'ar' ? 'مرشدك | دليل المعاملات الحكومية' : 'Murshidak | Government services guide';
}

function shell(content, { tab, back, title } = {}) {
  const top = `<header class="topbar">
    <a class="brand" href="#/home">${LOGO}<span><b>${t('appName')}</b><small>${t('tagline')}</small></span></a>
    <button class="icon-btn" data-lang aria-label="${t('language')}">${S.lang === 'ar' ? 'EN' : 'ع'}</button>
    ${S.user ? `<a class="icon-btn" href="#/notifications" aria-label="${t('notifications')}">${svg('bell', 22)}${S.unread ? `<span class="dot">${S.unread}</span>` : ''}</a>` : ''}
  </header>`;
  const backbar = back ? `<div class="backbar"><button data-back aria-label="${t('back')}">${svg('back', 20).replace('<svg', '<svg class="flip"')}</button><h1 class="grow" style="font-size:1.2rem">${esc(title || '')}</h1></div>` : '';
  const tabs = S.user ? `<nav class="tabbar">${['home', 'wallet', 'agents', 'bookings', 'profile'].map((k) => `<a href="#/${k}" class="${tab === k ? 'on' : ''}">${svg(k, 24)}<span>${t(k)}</span></a>`).join('')}</nav>` : '';
  return `${top}${backbar}<main id="view">${content}</main>${tabs}`;
}

function bindShell(root) {
  $('[data-lang]', root)?.addEventListener('click', async () => {
    setLang(S.lang === 'ar' ? 'en' : 'ar');
    if (S.user) api('PATCH', '/me', { lang: S.lang }).catch(() => {});
    route();
  });
  $('[data-back]', root)?.addEventListener('click', () => (history.length > 1 ? history.back() : go('#/home')));
}

const disclaimerBox = () => `<div class="disclaimer" role="note"><span aria-hidden="true">⚠️</span><span>${t('disclaimer')}</span></div>`;

// ---------------------------------------------------------------- reusable fragments
function daysBox(d) {
  const label = d.daysLeft < 0 ? `${t('expired')}<small>${-d.daysLeft} ${t('daysLeft')}</small>` : d.daysLeft === 0 ? t('today') : `${d.daysLeft}<small>${t('daysLeft')}</small>`;
  return `<div class="days ${d.level}">${label}</div>`;
}
function docRow(d) {
  return `<a class="card tight link exp ${d.level}" href="#/wallet/doc/${d.id}">
    <div class="ico" aria-hidden="true">${DOC_ICON[d.type]}</div>
    <div class="grow"><h3>${esc(d.label || t('t_' + d.type))}</h3>
      <p class="small muted">${esc(d.member_name)} · <span class="ltr">${esc(d.numberMasked)}</span></p>
      <p class="tiny muted">${t('expiresOn')} ${fmtDate(d.expiry_date)}</p></div>
    ${daysBox(d)}
  </a>`;
}
function procRow(p) {
  return `<a class="card tight link proc" href="#/p/${p.slug}">
    <div class="ico" aria-hidden="true">${catIcon(p.category)}</div>
    <div class="grow"><h3>${esc(L(p.title))}</h3><p class="tiny muted">${esc(L(p.summary))}</p></div>
    <span class="badge ${MODE_BADGE[p.mode]}">${t('mode_' + p.mode)}</span>
  </a>`;
}
function agentCard(a, slug) {
  return `<div class="card">
    <div class="row"><div class="avatar">${esc(L(a.name).trim()[0] || '؟')}</div>
      <div class="grow"><h3>${esc(L(a.name))} ${a.verified ? `<span class="badge b-green">✓ ${t('verified')}</span>` : ''}</h3>
        <p class="small"><span class="stars">★ ${a.rating.toFixed(1)}</span> <span class="muted">(${a.reviews} ${t('reviews')}) · ${a.years} ${t('years')}</span></p></div></div>
    <p class="small muted" style="margin-top:8px">${esc(L(a.bio))}</p>
    <div class="row wrap" style="margin-top:8px">${a.categories.map((c) => `<span class="badge b-blue">${catIcon(c)} ${esc(L(S.config.categories[c]))}</span>`).join('')}</div>
    <p class="tiny muted" style="margin-top:6px">📍 ${esc(L(a.areas))}</p>
    <div class="row between" style="margin-top:12px"><div><b style="font-size:1.3rem;color:var(--blue-900)">${a.price}</b> <span class="small muted">${t('perRequest')}</span></div>
      <button class="btn btn-primary btn-sm" data-book="${a.id}" data-slug="${esc(slug || '')}">${t('book')}</button></div>
  </div>`;
}

// ---------------------------------------------------------------- screens
const routes = [];
const on = (re, fn, opts = {}) => routes.push({ re, fn, ...opts });

// Onboarding
on(/^#\/onboarding$/, (root) => {
  const slides = [['🧭', 'onb1t', 'onb1p'], ['🗂️', 'onb2t', 'onb2p'], ['🤝', 'onb3t', 'onb3p']];
  let i = 0;
  const draw = () => {
    const [emoji, ti, p] = slides[i];
    root.innerHTML = `<section class="onb">
      <div class="row between"><button class="icon-btn" data-lang>${S.lang === 'ar' ? 'EN' : 'ع'}</button><button class="skip" data-skip>${t('skip')}</button></div>
      <div class="art"><div class="circle" aria-hidden="true">${emoji}</div></div>
      <h1>${t(ti)}</h1><p>${t(p)}</p>
      <div class="dots">${slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="btn block" data-next>${i < 2 ? t('next') : t('start')}</button>
      <p class="tiny" style="opacity:.7;margin-top:14px;text-align:center">${t('notOfficial')}</p>
    </section>`;
    $('[data-next]', root).onclick = () => (i < 2 ? (i++, draw()) : done());
    $('[data-skip]', root).onclick = done;
    $('[data-lang]', root).onclick = () => { setLang(S.lang === 'ar' ? 'en' : 'ar'); draw(); };
  };
  const done = () => { store.set('onboarded', true); go('#/login'); };
  draw();
}, { public: true, bare: true });

// Login: phone → OTP → (name if new)
on(/^#\/login$/, (root) => {
  let phone = '';
  const frame = (inner) => `<div class="auth-top">${LOGO.replace('class="logo"', 'class="logo" style="width:64px;height:64px"')}<h1>${t('appName')}</h1><p style="opacity:.85">${t('tagline')}</p></div>
    <div class="card auth-card stack">${inner}</div>
    <p class="footer-note" style="padding:0 20px">${t('agreeNote')} <a href="#/terms">${t('terms')}</a> ${t('and')} <a href="#/privacy">${t('privacy')}</a>.<br>${t('notOfficial')}</p>
    <div style="text-align:center;margin-top:8px"><button class="btn btn-ghost btn-sm" data-lang>${S.lang === 'ar' ? 'English' : 'العربية'}</button></div>`;
  const bindLang = () => { $('[data-lang]', root).onclick = () => { setLang(S.lang === 'ar' ? 'en' : 'ar'); stepPhone(); }; };

  const stepPhone = () => {
    root.innerHTML = frame(`<h2>${t('login')}</h2>
      <label class="f"><span>${t('phone')}</span><div class="phone"><span>+965</span><input id="ph" inputmode="numeric" autocomplete="tel-national" maxlength="8" placeholder="9XXXXXXX" value="${esc(phone)}"></div></label>
      <p class="err" id="err"></p>
      <button class="btn btn-primary block" id="go">${t('sendCode')}</button>`);
    bindLang();
    const send = async () => {
      phone = $('#ph', root).value.replace(/\D/g, '');
      $('#go', root).disabled = true;
      try { const r = await api('POST', '/auth/request-otp', { phone }); stepOtp(r.devCode); }
      catch (e) { $('#err', root).textContent = errMsg(e); $('#go', root).disabled = false; }
    };
    $('#go', root).onclick = send;
    $('#ph', root).onkeydown = (e) => e.key === 'Enter' && send();
  };

  const stepOtp = (devCode) => {
    root.innerHTML = frame(`<h2>${t('otpTitle')}</h2><p class="muted small">${t('otpSent')} <b class="ltr">+965 ${esc(phone)}</b></p>
      ${devCode ? `<div class="demo-code">${t('demoCode')}<br><b>${esc(devCode)}</b></div>` : ''}
      <input class="input otp" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${t('otpTitle')}">
      <p class="err" id="err"></p>
      <button class="btn btn-primary block" id="go">${t('verify')}</button>
      <div class="row between"><button class="btn btn-ghost btn-sm" id="chg">${t('changeNumber')}</button><button class="btn btn-ghost btn-sm" id="re">${t('resend')}</button></div>`);
    bindLang();
    const inp = $('#code', root);
    inp.focus();
    const verify = async () => {
      $('#go', root).disabled = true;
      try {
        const r = await api('POST', '/auth/verify', { phone, code: inp.value.trim() });
        S.user = r.user;
        if (r.isNew || !r.user.name) stepName(); else enter();
      } catch (e) { $('#err', root).textContent = errMsg(e); $('#go', root).disabled = false; }
    };
    $('#go', root).onclick = verify;
    inp.oninput = () => inp.value.length === 6 && verify();
    $('#chg', root).onclick = stepPhone;
    $('#re', root).onclick = async () => { try { const r = await api('POST', '/auth/request-otp', { phone }); stepOtp(r.devCode); } catch (e) { $('#err', root).textContent = errMsg(e); } };
  };

  const stepName = () => {
    root.innerHTML = frame(`<h2>${t('yourName')}</h2><p class="muted small">${t('nameHint')}</p>
      <input class="input" id="nm" autocomplete="name" maxlength="80"><p class="err" id="err"></p>
      <button class="btn btn-primary block" id="go">${t('continue')}</button>`);
    bindLang();
    $('#go', root).onclick = async () => {
      const name = $('#nm', root).value.trim();
      if (!name) return;
      try { S.user = (await api('PATCH', '/me', { name, lang: S.lang })).user; enter(); } catch (e) { $('#err', root).textContent = errMsg(e); }
    };
  };
  const enter = () => { if (S.user.lang && S.user.lang !== S.lang) setLang(S.user.lang); go('#/home'); };
  stepPhone();
}, { public: true, bare: true });

// Home
on(/^#\/home$/, async (root) => {
  const data = await api('GET', '/dashboard');
  S.unread = data.unread;
  const first = (S.user.name || '').split(' ')[0];
  const exs = ['ex1', 'ex2', 'ex3', 'ex4', 'ex5'];
  root.innerHTML = shell(`
    <section class="hero">
      <p>${t('hello')} ${esc(first)} 👋</p>
      <h1>${t('askTitle')}</h1>
      <div class="askbox">
        <textarea id="ask" rows="2" maxlength="500" placeholder="${t('askPh')}" aria-label="${t('askHint')}"></textarea>
        <button class="round-btn mic" id="mic" aria-label="mic">${svg('mic', 24)}</button>
        <button class="round-btn send" id="send" aria-label="send">${svg('send', 22).replace('<svg', '<svg class="flip"')}</button>
      </div>
      <div class="chips">${exs.map((k) => `<button class="chip" data-ex="${esc(t(k))}">${esc(t(k))}</button>`).join('')}</div>
    </section>
    <div id="answer"></div>

    <div class="section-title"><h2>${t('upcoming')}</h2><a href="#/wallet">${t('seeAll')}</a></div>
    ${data.counts.total ? `<div class="counts">
        <div class="b-red">${data.counts.red}<small>${t('lvlRed')}</small></div>
        <div class="b-yellow">${data.counts.yellow}<small>${t('lvlYellow')}</small></div>
        <div class="b-green">${data.counts.green}<small>${t('lvlGreen')}</small></div></div>
      <div class="list" style="margin-top:10px">${data.upcoming.map(docRow).join('')}</div>`
      : `<div class="card empty"><div class="big">🗂️</div><p>${t('noDocsYet')}</p><a class="btn btn-primary" style="margin-top:10px" href="#/wallet/new">${t('addFirstDoc')}</a></div>`}

    <div class="section-title"><h2>${t('popular')}</h2><a href="#/library">${t('library')}</a></div>
    <div class="pgrid">${data.popular.map((p) => `<a class="card link" href="#/p/${p.slug}"><span style="font-size:1.6rem">${catIcon(p.category)}</span><h3>${esc(L(p.title))}</h3><span class="badge ${MODE_BADGE[p.mode]}" style="align-self:flex-start;margin-top:auto">${t('mode_' + p.mode)}</span></a>`).join('')}</div>

    <div class="grid2" style="margin-top:14px">
      <a class="card link row" href="#/family"><span style="font-size:1.5rem">👨‍👩‍👧</span><b>${t('family')}</b></a>
      <a class="card link row" href="#/plans"><span style="font-size:1.5rem">⭐</span><b>${t('plans')}</b></a>
    </div>
    <p class="footer-note">${t('notOfficial')}</p>
  `, { tab: 'home' });
  bindShell(root);

  const input = $('#ask', root);
  const ask = async (text) => {
    text = (text ?? input.value).trim();
    if (!text) return input.focus();
    input.value = text;
    const box = $('#answer', root);
    box.innerHTML = `<div class="card" style="margin-top:14px"><div class="spinner" style="margin:10px auto"></div><p class="muted small" style="text-align:center">${t('thinking')}</p></div>`;
    try {
      const r = await api('POST', '/ask', { text, lang: S.lang });
      const src = `<span class="badge b-gray">${r.source === 'ai' ? '✨ ' + t('viaAI') : t('viaLocal')}</span>`;
      const alts = r.alternatives?.length ? `<p class="small muted" style="margin:12px 0 6px">${r.match ? t('maybe') : t('maybe')}</p><div class="list">${r.alternatives.map(procRow).join('')}</div>` : '';
      box.innerHTML = r.match
        ? `<div class="card result-card" style="margin-top:14px"><div class="row between"><b style="color:var(--green)">✓ ${t('found')}</b>${src}</div>
            <div style="margin-top:10px">${procRow(r.match).replace('card tight link', 'link')}</div>
            <a class="btn btn-primary block" style="margin-top:12px" href="#/p/${r.match.slug}">${t('viewRoadmap')}</a>${alts}</div>`
        : `<div class="card" style="margin-top:14px"><div class="row between"><b>${t('noMatch')}</b>${src}</div>
            <p style="margin-top:8px">${esc(L(r.reply))}</p>
            <div class="grid2" style="margin-top:12px"><a class="btn btn-primary" href="#/agents">${t('bookAgent')}</a><a class="btn btn-light" href="#/library">${t('browseLibrary')}</a></div>${alts}</div>`;
    } catch (e) { box.innerHTML = `<div class="card err" style="margin-top:14px">${errMsg(e)}</div>`; }
  };
  $('#send', root).onclick = () => ask();
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } };
  $$('[data-ex]', root).forEach((b) => (b.onclick = () => ask(b.dataset.ex)));
  bindMic($('#mic', root), input, ask);
});

function bindMic(btn, input, onFinal) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  btn.onclick = () => {
    if (!SR) return toast(t('micUnsupported'));
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = S.lang === 'ar' ? 'ar-KW' : 'en-US';
    rec.interimResults = true;
    rec.onresult = (e) => {
      const txt = [...e.results].map((r) => r[0].transcript).join(' ');
      input.value = txt;
      if (e.results[e.results.length - 1].isFinal) onFinal(txt);
    };
    rec.onend = () => { btn.classList.remove('on'); rec = null; };
    rec.onerror = () => { btn.classList.remove('on'); rec = null; };
    btn.classList.add('on');
    toast(t('listening'));
    rec.start();
  };
}

// Procedure library
on(/^#\/library(?:\?(.*))?$/, async (root, m) => {
  const q = new URLSearchParams(m[1] || '');
  const cat = q.get('c') || '';
  const { procedures } = await api('GET', '/procedures' + (cat ? `?category=${cat}` : ''));
  root.innerHTML = shell(`
    <input class="input" id="q" placeholder="${t('searchProcedures')}" aria-label="${t('searchProcedures')}">
    <div class="chips"><a class="chip ${!cat ? 'active' : ''}" href="#/library">${t('all')}</a>${Object.entries(S.config.categories).map(([k, c]) => `<a class="chip ${cat === k ? 'active' : ''}" href="#/library?c=${k}">${c.icon} ${esc(L(c))}</a>`).join('')}</div>
    <div class="list" id="list" style="margin-top:10px">${procedures.map(procRow).join('')}</div>
    <p class="footer-note">${t('disclaimer')}</p>`, { tab: 'home', back: true, title: t('library') });
  bindShell(root);
  $('#q', root).oninput = (e) => {
    const s = e.target.value.trim().toLowerCase();
    $('#list', root).innerHTML = procedures.filter((p) => !s || (L(p.title) + p.title.ar + p.title.en + L(p.summary)).toLowerCase().includes(s)).map(procRow).join('');
  };
}, { public: true });

// Roadmap
on(/^#\/p\/([\w-]+)$/, async (root, m) => {
  const { procedure: p, agents } = await api('GET', '/procedures/' + m[1]);
  const E = S.config.entities;
  const key = 'checks:' + p.slug;
  const checks = store.get(key, {});
  const needsVisit = p.mode !== 'online';
  root.innerHTML = shell(`<div class="stack">
    ${disclaimerBox()}
    <div class="card">
      <div class="row" style="align-items:flex-start"><span style="font-size:2rem">${catIcon(p.category)}</span>
        <div class="grow"><h1 style="font-size:1.25rem">${esc(L(p.title))}</h1><p class="muted small" style="margin-top:4px">${esc(L(p.summary))}</p></div></div>
      <div class="meta" style="margin-top:14px">
        <div><small>${t('fees')}</small><b>${esc(L(p.fees))}</b></div>
        <div><small>${t('duration')}</small><b>${esc(L(p.duration))}</b></div>
        <div><small>${t('howTo')}</small><b><span class="badge ${MODE_BADGE[p.mode]}" style="white-space:normal">${t('mode_' + p.mode)}</span></b></div>
      </div>
    </div>

    <div class="card"><h2 style="margin-bottom:14px">🧭 ${t('steps')}</h2>
      <ol class="steps">${p.steps.map((s, i) => {
        const e = E[s.entity] || E.self;
        return `<li><span class="num">${i + 1}</span><p class="t">${esc(L(s.title))}</p>
          <div class="tags"><span class="badge b-blue">🏛️ ${esc(L(e))}</span><span class="badge ${s.mode === 'online' ? 'b-green' : 'b-yellow'}">${s.mode === 'online' ? '💻' : '🚶'} ${t('step_' + s.mode)}</span>
          ${e.url ? `<a class="badge b-gray" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">↗ ${t('entitySite')}</a>` : ''}</div></li>`;
      }).join('')}</ol>
    </div>

    <div class="card"><div class="row between"><h2>📋 ${t('requiredDocs')}</h2><span class="small muted" id="cnt"></span></div>
      <div class="progress" style="margin:10px 0 4px"><i id="bar"></i></div>
      <div id="checks">${p.documents.map((d, i) => `<label class="check ${checks[i] ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${checks[i] ? 'checked' : ''}><span>${esc(L(d))}</span></label>`).join('')}</div>
    </div>

    <div class="grid2">
      ${p.mode !== 'in_person' ? `<a class="btn btn-dark" href="${esc(S.config.sahelUrl)}" target="_blank" rel="noopener noreferrer">📱 ${t('openSahel')}</a>` : ''}
      <a class="btn ${needsVisit ? 'btn-primary' : 'btn-light'}" href="#/agents?p=${p.slug}" ${p.mode === 'in_person' ? 'style="grid-column:1/-1"' : ''}>🤝 ${t('bookAgent')}</a>
    </div>

    ${agents.length && S.user ? `<div><div class="section-title" style="margin-top:6px"><h2>${needsVisit ? t('needAgent') : t('suggestedAgents')}</h2></div><div class="list">${agents.map((a) => agentCard(a, p.slug)).join('')}</div></div>` : ''}

    ${disclaimerBox()}
    <button class="btn btn-ghost btn-sm block" id="report">🚩 ${t('reportError')}</button>
    <p class="footer-note">${t('lastUpdated')}: ${fmtDate(p.updated_at.slice(0, 10))} · ${t('notOfficial')}</p>
  </div>`, { tab: 'home', back: true, title: t('steps') });
  bindShell(root);
  $('#report', root).onclick = () => sheet(`<h2>🚩 ${t('reportError')}</h2><p class="small muted" style="margin:6px 0 10px">${esc(L(p.title))}</p>
    <form id="rf"><textarea class="input" name="message" maxlength="1000" required placeholder="${t('reportHint')}"></textarea>
    <p class="err" id="err"></p><button class="btn btn-primary block">${t('send')}</button></form>`, (el) => {
    $('#rf', el).onsubmit = async (e) => {
      e.preventDefault();
      try { await api('POST', '/reports', { slug: p.slug, message: e.target.message.value }); closeSheet(); toast(t('reportThanks')); }
      catch (err) { $('#err', el).textContent = errMsg(err); }
    };
  });
  const upd = () => {
    const n = p.documents.length, c = Object.values(checks).filter(Boolean).length;
    $('#cnt', root).textContent = `${c} / ${n} ${t('ready')}`;
    $('#bar', root).style.width = (n ? (c / n) * 100 : 0) + '%';
  };
  $$('#checks input', root).forEach((cb) => (cb.onchange = () => { checks[cb.dataset.i] = cb.checked; cb.parentElement.classList.toggle('done', cb.checked); store.set(key, checks); upd(); }));
  upd();
  bindBooking(root);
}, { public: true });

// Documents wallet
on(/^#\/wallet(?:\?(.*))?$/, async (root, m) => {
  const q = new URLSearchParams(m[1] || '');
  const mid = q.get('member') || '';
  const [{ documents, limit }, { members }] = await Promise.all([api('GET', '/documents'), api('GET', '/members')]);
  const list = mid ? documents.filter((d) => String(d.member_id) === mid) : documents;
  root.innerHTML = shell(`
    <div class="row between"><h1>${t('wallet')}</h1>${limit ? `<span class="badge b-gray">${documents.length} ${t('of')} ${limit}</span>` : ''}</div>
    <div class="chips"><a class="chip ${!mid ? 'active' : ''}" href="#/wallet">${t('all')}</a>${members.map((x) => `<a class="chip ${mid === String(x.id) ? 'active' : ''}" href="#/wallet?member=${x.id}">${REL_ICON[x.relation]} ${esc(x.name)}</a>`).join('')}</div>
    <div class="row small muted wrap" style="gap:14px;margin:6px 2px 12px"><span class="row" style="gap:5px"><i class="lvl red"></i>${t('lvlRed')}</span><span class="row" style="gap:5px"><i class="lvl yellow"></i>${t('lvlYellow')}</span><span class="row" style="gap:5px"><i class="lvl green"></i>${t('lvlGreen')}</span></div>
    ${limit && documents.length >= limit ? `<div class="card" style="background:var(--blue-50)"><p class="small">${t('planLimit')}</p><a class="btn btn-primary btn-sm" style="margin-top:8px" href="#/plans">${t('upgrade')}</a></div>` : ''}
    <div class="list" style="margin-top:10px">${list.length ? list.map(docRow).join('') : `<div class="card empty"><div class="big">🗂️</div><p>${t('noDocsYet')}</p></div>`}</div>
    <p class="footer-note">🔒 ${t('secureNote')}</p>
    <button class="fab" aria-label="${t('addDocument')}" id="add">+</button>`, { tab: 'wallet' });
  bindShell(root);
  $('#add', root).onclick = () => (limit && documents.length >= limit ? go('#/plans') : go('#/wallet/new' + (mid ? `?member=${mid}` : '')));
});

function docForm(members, d = {}, preMember) {
  const types = ['civil_id', 'passport', 'residency', 'driving_license', 'car_registration', 'other'];
  return `<label class="f"><span>${t('owner')}</span><select class="input" name="member_id">${members.map((x) => `<option value="${x.id}" ${(d.member_id ?? preMember) == x.id ? 'selected' : ''}>${REL_ICON[x.relation]} ${esc(x.name)} – ${t('r_' + x.relation)}</option>`).join('')}</select></label>
    <label class="f"><span>${t('docType')}</span><select class="input" name="type">${types.map((k) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${DOC_ICON[k]} ${t('t_' + k)}</option>`).join('')}</select></label>
    <label class="f"><span>${t('label')}</span><input class="input" name="label" maxlength="60" value="${esc(d.label || '')}"></label>
    <label class="f"><span>${t('docNumber')}</span><input class="input" name="number" maxlength="40" autocomplete="off" dir="ltr" placeholder="${d.numberMasked ? esc(d.numberMasked) : ''}"></label>
    <label class="f"><span>${t('expiryDate')}</span><input class="input" type="date" name="expiry_date" required value="${esc(d.expiry_date || '')}"></label>
    <label class="f"><span>${t('notes')}</span><input class="input" name="notes" maxlength="300" value="${esc(d.notes || '')}"></label>`;
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());

on(/^#\/wallet\/new(?:\?(.*))?$/, async (root, m) => {
  const pre = new URLSearchParams(m[1] || '').get('member');
  const { members } = await api('GET', '/members');
  root.innerHTML = shell(`${S.config.ai ? `<div class="card" style="background:var(--blue-50);margin-bottom:12px">
      <h3>${t('scanTitle')}</h3><p class="small muted" style="margin:4px 0 10px">${t('scanHint')}</p>
      <label class="btn btn-primary block">📷 ${t('uploadPhoto')}<input type="file" id="scan" accept="image/*" capture="environment" hidden></label>
      <p class="small" id="scanmsg" style="margin-top:8px"></p>
      <p class="tiny muted">${t('scanPrivacy')}</p></div>` : ''}
    <form class="card" id="f">${docForm(members, {}, pre)}
    <label class="f"><span>${t('photo')}</span><input class="input" type="file" name="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment"></label>
    <p class="err" id="err"></p><button class="btn btn-primary block">${t('save')}</button>
    <p class="tiny muted" style="margin-top:10px">🔒 ${t('secureNote')}</p></form>`, { tab: 'wallet', back: true, title: t('addDocument') });
  bindShell(root);
  let scannedFile = null;
  $('#scan', root)?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const msg = $('#scanmsg', root);
    msg.textContent = t('scanning');
    try {
      const { result: r } = await api('POST', '/documents/scan', await prepareFile(f));
      const form = $('#f', root);
      if (r.type) form.type.value = r.type;
      if (r.number) form.number.value = r.number;
      if (r.expiry_date) form.expiry_date.value = r.expiry_date;
      scannedFile = f; // saved with the document unless another file is chosen below
      msg.textContent = (r.number || r.expiry_date) ? '✓ ' + t('scanned') : t('scanFailed');
    } catch (err) { msg.textContent = err.code === 'scan_failed' ? t('scanFailed') : errMsg(err); }
  });
  $('#f', root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = formData(e.target);
    const file = e.target.file.files[0] || scannedFile;
    delete fd.file;
    const btn = $('button', e.target); btn.disabled = true;
    try {
      const { id } = await api('POST', '/documents', { ...fd, member_id: Number(fd.member_id) });
      if (file) { btn.textContent = t('uploading'); await uploadFile(id, file); }
      toast(t('saved')); go('#/wallet/doc/' + id);
    } catch (err) {
      btn.disabled = false;
      if (err.code === 'plan_limit') { toast(t('planLimit')); return go('#/plans'); }
      $('#err', root).textContent = errMsg(err);
    }
  };
});

/** Compress images client-side (max 1600px JPEG) before upload; PDFs go as-is. */
/** Images are resized on the device (max 1600px JPEG) and returned as base64; PDFs as-is. */
async function prepareFile(file) {
  let blob = file, mime = file.type;
  if (mime.startsWith('image/')) {
    const img = await createImageBitmap(file).catch(() => null);
    if (img) {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      mime = 'image/jpeg';
    }
  }
  if (blob.size > 3 * 1024 * 1024) throw new ApiError('file_too_large', 413);
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { mime, data };
}
async function uploadFile(id, file) {
  return api('PUT', `/documents/${id}/file`, await prepareFile(file));
}

on(/^#\/wallet\/doc\/(\d+)$/, async (root, m) => {
  const id = m[1];
  const [{ document: d }, { members }] = await Promise.all([api('GET', '/documents/' + id), api('GET', '/members')]);
  const slug = renewSlug(d);
  const ver = Date.now();
  root.innerHTML = shell(`<div class="stack">
    <div class="card exp ${d.level}" style="display:flex">
      <div class="ico">${DOC_ICON[d.type]}</div>
      <div class="grow"><h2>${esc(d.label || t('t_' + d.type))}</h2><p class="small muted">${esc(d.member_name)} · ${t('r_' + d.member_relation)}</p>
        <p class="small">${t('expiresOn')} <b>${fmtDate(d.expiry_date)}</b></p></div>${daysBox(d)}</div>

    <div class="card"><div class="row between"><div><small class="muted">${t('docNumber')}</small><p><b class="ltr" id="num" style="font-size:1.15rem;letter-spacing:1px">${esc(d.numberMasked || '—')}</b></p></div>
      ${d.numberMasked ? `<button class="btn btn-light btn-sm" id="reveal" data-shown="0">👁 ${t('show')}</button>` : ''}</div></div>

    ${slug ? `<a class="btn btn-primary block" href="#/p/${slug}">🧭 ${t('renewNow')}</a>` : ''}

    <div class="card"><h3 style="margin-bottom:10px">${t('photo')}</h3>
      ${d.hasFile ? (d.file_mime === 'application/pdf'
        ? `<a class="btn btn-light block" href="/api/documents/${d.id}/file" target="_blank" rel="noopener">📄 ${t('openFile')}</a>`
        : `<img class="doc-img" src="/api/documents/${d.id}/file?v=${ver}" alt="${esc(t('t_' + d.type))}">`) : ''}
      <div class="row" style="margin-top:10px"><label class="btn btn-light btn-sm grow">📷 ${d.hasFile ? t('replacePhoto') : t('uploadPhoto')}<input type="file" id="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden></label>
        ${d.hasFile ? `<button class="btn btn-danger btn-sm" id="rmfile">${t('removePhoto')}</button>` : ''}</div>
      <p class="tiny muted" style="margin-top:8px">🔒 ${t('secureNote')}</p></div>

    <form class="card" id="f"><h3 style="margin-bottom:10px">${t('editDocument')}</h3>${docForm(members, d)}<p class="err" id="err"></p>
      <button class="btn btn-primary block">${t('save')}</button></form>
    <button class="btn btn-danger block" id="del">${t('delete')}</button>
  </div>`, { tab: 'wallet', back: true, title: t('wallet') });
  bindShell(root);
  $('#reveal', root)?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (b.dataset.shown === '1') { $('#num', root).textContent = d.numberMasked; b.dataset.shown = '0'; b.textContent = '👁 ' + t('show'); return; }
    const { number } = await api('GET', `/documents/${id}/number`);
    $('#num', root).textContent = number; b.dataset.shown = '1'; b.textContent = '🙈 ' + t('hide');
    setTimeout(() => { if (b.isConnected && b.dataset.shown === '1') b.click(); }, 15000);
  });
  $('#file', root).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    toast(t('uploading'));
    try { await uploadFile(id, f); toast(t('saved')); route(); } catch (err) { toast(errMsg(err)); }
  };
  $('#rmfile', root)?.addEventListener('click', async () => { if (!confirm(t('confirmDelete'))) return; await api('DELETE', `/documents/${id}/file`); route(); });
  $('#f', root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = formData(e.target);
    if (!fd.number) delete fd.number;
    try { await api('PATCH', '/documents/' + id, { ...fd, member_id: Number(fd.member_id) }); toast(t('saved')); route(); } catch (err) { $('#err', root).textContent = errMsg(err); }
  };
  $('#del', root).onclick = async () => { if (!confirm(t('confirmDelete'))) return; await api('DELETE', '/documents/' + id); toast(t('deleted')); go('#/wallet'); };
});

// Family members
// ---------------------------------------------------------------- Excel / CSV import (Business plan)
// Header names accepted in Arabic or English.
const COLS = {
  name: ['name', 'الاسم', 'اسم الموظف', 'employee'],
  nationality: ['nationality', 'الجنسية'],
  number: ['number', 'residency number', 'رقم الإقامة', 'رقم المستند', 'الرقم'],
  expiry_date: ['expiry_date', 'expiry', 'expiry date', 'تاريخ الانتهاء', 'الانتهاء'],
  type: ['type', 'نوع المستند', 'النوع'],
};
const TYPE_WORDS = { residency: ['residency', 'إقامة', 'الإقامة'], passport: ['passport', 'جواز', 'جواز السفر'], civil_id: ['civil id', 'civil_id', 'مدنية', 'البطاقة المدنية'], driving_license: ['driving license', 'رخصة', 'رخصة القيادة'] };
function toIsoDate(v) {
  if (typeof v === 'number' && v > 20000 && v < 80000) return excelSerialToIso(v); // Excel date cell
  const s = String(v ?? '').trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s); // Kuwaiti DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}
function mapRows(raw) {
  const norm = (h) => String(h).trim().toLowerCase();
  return raw.map((r) => {
    const out = { _row: r._row };
    for (const [k, v] of Object.entries(r)) {
      const key = Object.keys(COLS).find((c) => COLS[c].includes(norm(k)));
      if (key) out[key] = v;
    }
    out.expiry_date = toIsoDate(out.expiry_date);
    if (out.type) out.type = Object.keys(TYPE_WORDS).find((k) => TYPE_WORDS[k].includes(norm(out.type))) || 'residency';
    for (const k of ['name', 'nationality', 'number']) if (out[k] != null) out[k] = String(out[k]).trim();
    return out;
  }).filter((r) => ['name', 'nationality', 'number', 'expiry_date'].some((k) => r[k]));
}
function importSheet() {
  let rows = [];
  sheet(`<h2>📊 ${t('importExcel')}</h2><p class="small muted" style="margin:6px 0 12px">${t('importHint')}</p>
    <button class="btn btn-light btn-sm" id="tpl">⬇️ ${t('downloadTemplate')}</button>
    <label class="btn btn-primary block" style="margin-top:12px">📁 ${t('chooseFile')}<input type="file" id="xf" accept=".xlsx,.csv" hidden></label>
    <p class="small" id="info" style="margin-top:10px"></p><p class="err" id="err"></p>
    <button class="btn btn-dark block" id="go" disabled>${t('importNow')}</button>`, (el) => {
    $('#tpl', el).onclick = () => {
      const csv = '﻿الاسم,الجنسية,رقم الإقامة,تاريخ الانتهاء\nأحمد حسن,مصري,18-123456,2027-03-01\n';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'murshidak-employees.csv'; a.click();
    };
    $('#xf', el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $('#err', el).textContent = ''; $('#info', el).textContent = t('loading');
      try {
        rows = mapRows(await readSheet(f));
        $('#info', el).textContent = rows.length ? `${rows.length} ${t('rowsFound')}` : t('empty');
        $('#go', el).disabled = !rows.length;
      } catch { $('#info', el).textContent = ''; $('#err', el).textContent = t('fileReadError'); }
    };
    $('#go', el).onclick = async () => {
      $('#go', el).disabled = true;
      try {
        const r = await api('POST', '/members/import', { rows });
        const errs = r.errors.length ? `<br>${r.errors.length} ${t('rowErrors')}: ${r.errors.slice(0, 8).map((x) => `${t('row')} ${x.row} (${esc(t(x.error))})`).join('، ')}` : '';
        $('#info', el).innerHTML = `✓ ${t('imported')} ${r.imported}${errs}`;
        if (r.imported) setTimeout(() => { closeSheet(); route(); }, errs ? 4000 : 1200);
      } catch (err) { $('#err', el).textContent = errMsg(err); $('#go', el).disabled = false; }
    };
  });
}

on(/^#\/family$/, async (root) => {
  const { members } = await api('GET', '/members');
  const biz = S.user.limits.employees;
  const groups = [[t('family'), members.filter((x) => x.relation !== 'employee')], [t('employees'), members.filter((x) => x.relation === 'employee')]].filter((g) => g[1].length);
  root.innerHTML = shell(`<p class="muted small">${t('familyHint')}</p>
    ${biz ? `<button class="btn btn-light block" id="import" style="margin-top:10px">📊 ${t('importExcel')}</button>` : ''}
    ${groups.map(([title, list]) => `<div class="section-title"><h2>${title}</h2><span class="small muted">${list.length}</span></div><div class="list">${list.map((x) => `
      <div class="card tight row">
        <div class="avatar" aria-hidden="true">${REL_ICON[x.relation]}</div>
        <a class="grow" href="#/wallet?member=${x.id}" style="color:inherit"><h3>${esc(x.name)}</h3>
          <p class="small muted">${t('r_' + x.relation)}${x.nationality ? ' · ' + esc(x.nationality) : ''} · ${x.docCount} ${t('documents')}</p>
          ${x.nextExpiry ? `<p class="tiny row" style="gap:6px"><i class="lvl ${x.nextLevel}"></i>${t('nextExpiry')}: ${fmtDate(x.nextExpiry)}</p>` : ''}</a>
        <button class="btn btn-light btn-sm" data-edit="${x.id}">${t('edit')}</button>
      </div>`).join('')}</div>`).join('')}
    <button class="fab" aria-label="${t('addMember')}" id="add">+</button>`, { tab: 'profile', back: true, title: t('family') });
  bindShell(root);
  $('#import', root)?.addEventListener('click', importSheet);
  const rels = ['spouse', 'child', 'parent', 'domestic_worker', 'employee', 'other'];
  const form = (x = {}) => sheet(`<h2 style="margin-bottom:12px">${x.id ? t('editMember') : t('addMember')}</h2><form id="mf">
      <label class="f"><span>${t('name')}</span><input class="input" name="name" required maxlength="80" value="${esc(x.name || '')}"></label>
      ${x.relation === 'self' ? '' : `<label class="f"><span>${t('relation')}</span><select class="input" name="relation">${rels.map((r) => `<option value="${r}" ${x.relation === r ? 'selected' : ''} ${r === 'employee' && !biz ? 'disabled' : ''}>${REL_ICON[r]} ${t('r_' + r)}${r === 'employee' && !biz ? ' – ' + t('businessOnly') : ''}</option>`).join('')}</select></label>`}
      <label class="f"><span>${t('nationality')}</span><input class="input" name="nationality" maxlength="40" value="${esc(x.nationality || '')}"></label>
      <p class="err" id="err"></p><button class="btn btn-primary block">${t('save')}</button>
      ${x.id && x.relation !== 'self' ? `<button type="button" class="btn btn-danger block" style="margin-top:8px" id="mdel">${t('delete')}</button>` : ''}</form>`, (el) => {
    $('#mf', el).onsubmit = async (e) => {
      e.preventDefault();
      try { x.id ? await api('PATCH', '/members/' + x.id, formData(e.target)) : await api('POST', '/members', formData(e.target)); closeSheet(); toast(t('saved')); route(); }
      catch (err) { $('#err', el).textContent = errMsg(err); }
    };
    $('#mdel', el)?.addEventListener('click', async () => { if (!confirm(t('confirmDelete'))) return; await api('DELETE', '/members/' + x.id); closeSheet(); route(); });
  });
  $('#add', root).onclick = () => form();
  $$('[data-edit]', root).forEach((b) => (b.onclick = () => form(members.find((x) => String(x.id) === b.dataset.edit))));
});

// Agents marketplace
on(/^#\/agents(?:\?(.*))?$/, async (root, m) => {
  const q = new URLSearchParams(m[1] || '');
  const slug = q.get('p') || '';
  let cat = q.get('c') || '';
  let proc = null;
  if (slug) { proc = (await api('GET', '/procedures/' + slug)).procedure; if (!q.get('c')) cat = proc.category; }
  const sort = q.get('sort') || 'rating';
  const { agents } = await api('GET', `/agents?sort=${sort}${cat ? '&category=' + cat : ''}`);
  const link = (o) => '#/agents?' + new URLSearchParams({ ...(slug ? { p: slug } : {}), ...(cat ? { c: cat } : {}), sort, ...o }).toString();
  root.innerHTML = shell(`
    <div class="row between"><h1>${t('agents')}</h1><a class="small" href="#/agents/apply">${t('joinAsAgent')}</a></div>
    ${proc ? `<div class="card tight" style="margin-top:10px;background:var(--blue-50)"><p class="small">${t('procedure')}: <b>${esc(L(proc.title))}</b></p></div>` : ''}
    <div class="chips"><a class="chip ${!cat ? 'active' : ''}" href="${link({ c: '' })}">${t('all')}</a>${Object.entries(S.config.categories).map(([k, c]) => `<a class="chip ${cat === k ? 'active' : ''}" href="${link({ c: k })}">${c.icon} ${esc(L(c))}</a>`).join('')}</div>
    <div class="tabs" style="margin:8px 0 12px"><button class="${sort === 'rating' ? 'on' : ''}" data-sort="rating">★ ${t('sortRating')}</button><button class="${sort === 'price' ? 'on' : ''}" data-sort="price">💰 ${t('sortPrice')}</button></div>
    <div class="list">${agents.map((a) => agentCard(a, slug)).join('') || `<div class="card empty">—</div>`}</div>
    <p class="footer-note">${t('agentNote')}</p>`, { tab: 'agents' });
  bindShell(root);
  $$('[data-sort]', root).forEach((b) => (b.onclick = () => go(link({ sort: b.dataset.sort }))));
  bindBooking(root);
});

function bindBooking(root) {
  $$('[data-book]', root).forEach((b) => (b.onclick = async () => {
    if (!S.user) return go('#/login');
    const [{ procedures }, { members }, { agents }] = await Promise.all([api('GET', '/procedures'), api('GET', '/members'), api('GET', '/agents')]);
    const a = agents.find((x) => String(x.id) === b.dataset.book);
    const minDate = S.config.today;
    sheet(`<h2>${t('bookingFor')}</h2><p class="muted small" style="margin-bottom:12px">${esc(L(a.name))} · ${a.price} ${t('kwd')}</p>
      <form id="bf">
        <label class="f"><span>${t('procedure')}</span><select class="input" name="procedure_slug"><option value="">${t('none')}</option>${procedures.map((p) => `<option value="${p.slug}" ${p.slug === b.dataset.slug ? 'selected' : ''}>${esc(L(p.title))}</option>`).join('')}</select></label>
        <label class="f"><span>${t('forWhom')}</span><select class="input" name="member_id">${members.map((x) => `<option value="${x.id}">${REL_ICON[x.relation]} ${esc(x.name)}</option>`).join('')}</select></label>
        <label class="f"><span>${t('preferredDate')}</span><input class="input" type="date" name="preferred_date" min="${minDate}"></label>
        <label class="f"><span>${t('notes')}</span><textarea class="input" name="notes" maxlength="500"></textarea></label>
        <p class="tiny muted" style="margin-bottom:10px">${t('agentNote')}</p>
        <p class="err" id="err"></p><button class="btn btn-primary block">${t('sendRequest')}</button></form>`, (el) => {
      $('#bf', el).onsubmit = async (e) => {
        e.preventDefault();
        const fd = formData(e.target);
        try {
          await api('POST', '/bookings', { agent_id: a.id, procedure_slug: fd.procedure_slug || null, member_id: Number(fd.member_id) || null, preferred_date: fd.preferred_date || null, notes: fd.notes });
          closeSheet(); toast(t('bookingSent')); go('#/bookings');
        } catch (err) { $('#err', el).textContent = errMsg(err); }
      };
    });
  }));
}

on(/^#\/agents\/apply$/, (root) => {
  root.innerHTML = shell(`<form class="card" id="f"><p class="small muted" style="margin-bottom:12px">${t('agentNote')}</p>
    <label class="f"><span>${t('name')}</span><input class="input" name="name" required maxlength="80"></label>
    <label class="f"><span>${t('phone')}</span><div class="phone"><span>+965</span><input name="phone" inputmode="numeric" maxlength="8" required></div></label>
    <label class="f"><span>${t('price')}</span><input class="input" name="price" type="number" min="1" max="999" step="0.5" required></label>
    <label class="f"><span>${t('years')}</span><input class="input" name="years" type="number" min="0" max="60"></label>
    <label class="f"><span>${t('areas')}</span><input class="input" name="areas" maxlength="80"></label>
    <div class="f"><span style="display:block;font-weight:700;margin-bottom:6px">${t('categories')}</span><div class="row wrap">${Object.entries(S.config.categories).map(([k, c]) => `<label class="chip"><input type="checkbox" name="cat" value="${k}"> ${c.icon} ${esc(L(c))}</label>`).join('')}</div></div>
    <label class="f"><span>${t('bio')}</span><textarea class="input" name="bio" maxlength="300"></textarea></label>
    <p class="err" id="err"></p><button class="btn btn-primary block">${t('sendRequest')}</button></form>`, { tab: 'agents', back: true, title: t('applyTitle') });
  bindShell(root);
  $('#f', root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = formData(e.target);
    try { await api('POST', '/agents/apply', { ...fd, categories: $$('[name=cat]:checked', root).map((c) => c.value) }); toast(t('applied')); go('#/agents'); }
    catch (err) { $('#err', root).textContent = errMsg(err); }
  };
});

// Bookings
const FLOW = ['requested', 'accepted', 'in_progress', 'done'];
const statusBadge = (s) => `<span class="badge ${{ requested: 'b-gray', accepted: 'b-blue', in_progress: 'b-yellow', done: 'b-green', cancelled: 'b-red' }[s]}">${t('s_' + s)}</span>`;
const stepper = (s) => s === 'cancelled' ? '' : `<div class="stepper">${FLOW.map((k, i) => `<div class="${i <= FLOW.indexOf(s) ? 'on' : ''}"><i></i>${t('s_' + k)}</div>`).join('')}</div>`;
on(/^#\/bookings$/, async (root) => {
  const { bookings } = await api('GET', '/bookings');
  root.innerHTML = shell(`<h1>${t('bookings')}</h1><div class="list" style="margin-top:12px">${bookings.length ? bookings.map((b) => `
    <div class="card"><div class="row between"><h3>${esc(b.procedure ? L(b.procedure.title) : '—')}</h3>${statusBadge(b.status)}</div>
      <p class="small muted">🤝 ${esc(L(b.agent.name))} · ${b.price} ${t('kwd')}${b.member ? ' · ' + esc(b.member.name) : ''}</p>
      ${b.preferred_date ? `<p class="tiny muted">📅 ${fmtDate(b.preferred_date)}</p>` : ''}
      ${b.notes ? `<p class="small" style="margin-top:4px">${esc(b.notes)}</p>` : ''}
      ${stepper(b.status)}
      ${['requested', 'accepted'].includes(b.status) ? `<button class="btn btn-danger btn-sm" style="margin-top:12px" data-cancel="${b.id}">${t('cancel')}</button>` : ''}
      ${b.status === 'done' ? (b.rating
        ? `<p class="small" style="margin-top:10px">${t('yourRating')}: <span class="stars">${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)}</span></p>`
        : `<button class="btn btn-light btn-sm" style="margin-top:12px" data-rate="${b.id}">⭐ ${t('rateAgent')}</button>`) : ''}
    </div>`).join('') : `<div class="card empty"><div class="big">📭</div><p>${t('noBookings')}</p><a class="btn btn-primary" style="margin-top:10px" href="#/agents">${t('bookAgent')}</a></div>`}</div>`, { tab: 'bookings' });
  bindShell(root);
  $$('[data-cancel]', root).forEach((b) => (b.onclick = async () => { if (!confirm(t('cancel') + '?')) return; await api('POST', `/bookings/${b.dataset.cancel}/cancel`); toast(t('cancelled')); route(); }));
  $$('[data-rate]', root).forEach((b) => (b.onclick = () => {
    let stars = 0;
    sheet(`<h2>⭐ ${t('rateAgent')}</h2><div class="row" id="stars" style="justify-content:center;gap:6px;margin:16px 0">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="btn btn-ghost" data-s="${n}" style="font-size:2rem;padding:4px;min-height:auto" aria-label="${n}">☆</button>`).join('')}</div>
      <textarea class="input" id="rv" maxlength="500" placeholder="${t('yourReview')}"></textarea><p class="err" id="err"></p>
      <button class="btn btn-primary block" id="go" disabled>${t('send')}</button>`, (el) => {
      $$('[data-s]', el).forEach((s) => (s.onclick = () => {
        stars = Number(s.dataset.s);
        $$('[data-s]', el).forEach((x) => { x.textContent = Number(x.dataset.s) <= stars ? '★' : '☆'; x.style.color = '#f0a500'; });
        $('#go', el).disabled = false;
      }));
      $('#go', el).onclick = async () => {
        try { await api('POST', `/bookings/${b.dataset.rate}/rate`, { rating: stars, review: $('#rv', el).value }); closeSheet(); toast(t('thanksRating')); route(); }
        catch (err) { $('#err', el).textContent = errMsg(err); }
      };
    });
  }));
});

// Agent portal: approved agents sign in with their own number and update their requests.
on(/^#\/agent$/, async (root) => {
  const { agent, bookings } = await api('GET', '/agent/bookings');
  root.innerHTML = shell(`<div class="card row"><div class="avatar">${esc(L(agent.name).trim()[0] || '؟')}</div><div class="grow"><h2>${esc(L(agent.name))}</h2>
      <p class="small"><span class="stars">★ ${agent.rating.toFixed(1)}</span> <span class="muted">(${agent.reviews} ${t('reviews')})</span></p></div></div>
    <p class="small muted" style="margin:12px 2px">${t('agentPortalHint')}</p>
    <div class="list">${bookings.length ? bookings.map((b) => {
      const next = FLOW[FLOW.indexOf(b.status) + 1];
      return `<div class="card"><div class="row between"><h3>${esc(b.procedure ? L(b.procedure.title) : '—')}</h3>${statusBadge(b.status)}</div>
        <p class="small muted">👤 ${t('customer')}: ${esc(b.user.name)}${b.member ? ' · ' + esc(b.member.name) : ''}</p>
        ${b.preferred_date ? `<p class="tiny muted">📅 ${fmtDate(b.preferred_date)}</p>` : ''}
        ${b.notes ? `<p class="small" style="margin-top:4px">${esc(b.notes)}</p>` : ''}
        ${stepper(b.status)}
        <div class="row wrap" style="margin-top:12px">
          ${next && b.status !== 'cancelled' ? `<button class="btn btn-primary btn-sm" data-st="${next}" data-id="${b.id}">${t('advance')}: ${t('s_' + next)}</button>` : ''}
          ${b.customerPhone ? `<a class="btn btn-light btn-sm" href="tel:+965${esc(b.customerPhone)}">📞 ${t('call')}</a>` : ''}
          ${b.rating ? `<span class="stars small">${'★'.repeat(b.rating)}</span>` : ''}
        </div></div>`;
    }).join('') : `<div class="card empty"><div class="big">📭</div><p>${t('noAgentBookings')}</p></div>`}</div>`, { tab: 'profile', back: true, title: t('agentPortal') });
  bindShell(root);
  $$('[data-st]', root).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await api('PATCH', '/agent/bookings/' + b.dataset.id, { status: b.dataset.st }); route(); } catch (e) { toast(errMsg(e)); b.disabled = false; }
  }));
});

// Plans
on(/^#\/plans(?:\?(.*))?$/, async (root, m) => {
  const P = S.config.plans;
  const payments = S.config.providers?.payments;
  const result = new URLSearchParams(m[1] || '').get('payment');
  if (result) {
    S.user = (await api('GET', '/me')).user; // the plan may have just been activated
    toast(result === 'paid' ? t('paid') : t('paymentFailed'));
    history.replaceState(null, '', '#/plans');
  }
  const feats = {
    free: [['pf1', 1], ['pf2', 1], ['pf7', 1], ['pf3', 0], ['pf5', 0]],
    family: [['pf1', 1], ['pf4', 1], ['pf3', 1], ['pf5', 1], ['pf7', 1]],
    business: [['pf1', 1], ['pf4', 1], ['pf3', 1], ['pf5', 1], ['pf6', 1]],
  };
  const names = { free: 'planFree', family: 'planFamily', business: 'planBusiness' };
  root.innerHTML = shell(`<div class="list">${Object.keys(P).map((k) => `
    <div class="card plan ${S.user.plan === k ? 'current' : ''}">
      <div class="row between"><h2>${k === 'family' ? '👨‍👩‍👧 ' : k === 'business' ? '💼 ' : '🙂 '}${t(names[k])}</h2>${S.user.plan === k ? `<span class="badge b-blue">${t('currentPlan')}</span>` : ''}</div>
      <p class="price">${P[k].price ? P[k].price : '0'} <span class="small muted">${t('perMonth')}</span></p>
      <ul>${feats[k].map(([f, ok]) => `<li class="${ok ? '' : 'no'}">${t(f)}</li>`).join('')}</ul>
      ${S.user.plan === k && S.user.planExpiresAt ? `<p class="small muted" style="margin-bottom:10px">${t('validUntil')} ${fmtDate(S.user.planExpiresAt.slice(0, 10))}</p>` : ''}
      ${S.user.plan === k
        ? (payments && k !== 'free' ? `<button class="btn btn-light block" data-pay="${k}">${t('renew')}</button>` : '')
        : (payments && k !== 'free' ? `<button class="btn btn-primary block" data-pay="${k}">💳 ${t('payNow')}</button>` : `<button class="btn btn-primary block" data-plan="${k}">${t('choose')}</button>`)}
    </div>`).join('')}</div>
    <p class="footer-note">ℹ️ ${payments ? t('securePay') : t('paymentNote')}</p>`, { tab: 'profile', back: true, title: t('plans') });
  bindShell(root);
  $$('[data-plan]', root).forEach((b) => (b.onclick = async () => {
    try { S.user = (await api('POST', '/plan', { plan: b.dataset.plan })).user; toast(t('planChanged')); route(); } catch (e) { toast(errMsg(e)); }
  }));
  $$('[data-pay]', root).forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { location.href = (await api('POST', '/billing/checkout', { plan: b.dataset.pay })).url; } catch (e) { toast(errMsg(e)); b.disabled = false; }
  }));
});

// Profile / settings
/** Ask permission and register this device for Web Push. Returns 'ok' | 'denied' | 'unsupported'. */
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !S.config.vapidPublicKey) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(S.config.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (S.config.vapidPublicKey.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api('POST', '/push/subscribe', sub.toJSON());
  return 'ok';
}

on(/^#\/profile$/, (root) => {
  const names = { free: 'planFree', family: 'planFamily', business: 'planBusiness' };
  const pv = S.config.providers || {};
  root.innerHTML = shell(`<div class="stack">
    <div class="card row"><div class="avatar">${esc((S.user.name || '؟')[0])}</div><div class="grow"><h2>${esc(S.user.name)}</h2><p class="small muted ltr">+965 ${esc(S.user.phoneMasked)}</p></div><span class="badge b-blue">${t(names[S.user.plan])}</span></div>
    <form class="card" id="nf"><label class="f"><span>${t('name')}</span><input class="input" name="name" maxlength="80" value="${esc(S.user.name)}"></label><button class="btn btn-light btn-sm">${t('save')}</button></form>
    <div class="card menu">
      <a href="#/family">👨‍👩‍👧 ${t('family')}<span class="chev">›</span></a>
      <a href="#/plans">⭐ ${t('plans')}<span class="chev">›</span></a>
      <a href="#/notifications">🔔 ${t('notifications')}<span class="chev">›</span></a>
      <a href="#/library">📚 ${t('library')}<span class="chev">›</span></a>
      <button data-lang2>🌐 ${t('language')}: ${S.lang === 'ar' ? 'العربية' : 'English'}<span class="chev">⇄</span></button>
      ${S.user.isAgent ? `<a href="#/agent">🧑‍💼 ${t('agentPortal')}<span class="chev">›</span></a>` : ''}
      ${S.user.role === 'admin' ? `<a href="#/admin">🛠️ ${t('admin')}<span class="chev">›</span></a>` : ''}
    </div>
    <div class="card"><h3>📲 ${t('notifSettings')}</h3><p class="small muted" style="margin:4px 0 6px">${t('notifHint')}</p>
      <label class="check"><input type="checkbox" id="np" ${S.user.notifyPush ? 'checked' : ''} ${pv.push ? '' : 'disabled'}><span class="grow">${t('pushLabel')}${pv.push ? '' : ` <span class="tiny muted">(${t('notConfigured')})</span>`}</span></label>
      <label class="check"><input type="checkbox" id="nw" ${S.user.notifyWhatsapp ? 'checked' : ''} ${pv.whatsapp ? '' : 'disabled'}><span class="grow">${t('waLabel')}${pv.whatsapp ? '' : ` <span class="tiny muted">(${t('notConfigured')})</span>`}</span></label>
      ${pv.push || pv.whatsapp ? `<button class="btn btn-light btn-sm" id="ntest" style="margin-top:10px">${t('sendTest')}</button>` : ''}
    </div>
    <div class="card"><h3>${t('about')}</h3><p class="small muted" style="margin-top:6px">${t('notOfficial')}</p><p class="small muted" style="margin-top:6px">${t('disclaimer')}.</p>
      <p class="small" style="margin-top:8px"><a href="#/privacy">${t('privacy')}</a> · <a href="#/terms">${t('terms')}</a></p></div>
    <button class="btn btn-light block" id="out">${t('logout')}</button>
    <button class="btn btn-danger block" id="delacc">${t('deleteAccount')}</button>
  </div>`, { tab: 'profile' });
  bindShell(root);
  const savePref = async (body) => { S.user = (await api('PATCH', '/me', body)).user; };
  $('#np', root).onchange = async (e) => {
    if (e.target.checked) {
      const r = await enablePush();
      if (r !== 'ok') { e.target.checked = false; return toast(t(r === 'denied' ? 'pushDenied' : 'pushUnsupported')); }
    }
    await savePref({ notifyPush: e.target.checked }); toast(t('saved'));
  };
  $('#nw', root).onchange = async (e) => { await savePref({ notifyWhatsapp: e.target.checked }); toast(t('saved')); };
  $('#ntest', root)?.addEventListener('click', async () => { try { await api('POST', '/notifications/test'); toast(t('testSent')); } catch (err) { toast(errMsg(err)); } });
  $('[data-lang2]', root).onclick = () => $('[data-lang]', root).click();
  $('#nf', root).onsubmit = async (e) => { e.preventDefault(); S.user = (await api('PATCH', '/me', formData(e.target))).user; toast(t('saved')); route(); };
  $('#out', root).onclick = async () => { await api('POST', '/auth/logout'); S.user = null; go('#/login'); };
  $('#delacc', root).onclick = async () => { if (!confirm(t('confirmDeleteAccount'))) return; await api('DELETE', '/me'); S.user = null; go('#/login'); };
});

// Notifications
on(/^#\/notifications$/, async (root) => {
  const { notifications, remindersEnabled } = await api('GET', '/notifications');
  root.innerHTML = shell(`${remindersEnabled ? '' : `<div class="card" style="background:var(--blue-50)"><p class="small">${t('remindersOff')}</p><a class="btn btn-primary btn-sm" style="margin-top:8px" href="#/plans">${t('upgrade')}</a></div>`}
    <div class="list" style="margin-top:10px">${notifications.length ? notifications.map((n) => `
      <a class="card tight link row" href="${esc(n.link || '#/home')}" style="${n.read ? '' : 'border-inline-start:4px solid var(--blue-500)'}">
        <span style="font-size:1.4rem">${n.kind === 'expiry_7' || n.kind === 'expired' ? '🚨' : n.kind === 'booking' ? '🤝' : '⏰'}</span>
        <div class="grow"><h3 style="font-size:.95rem">${esc(L(n.title))}</h3><p class="small muted">${esc(L(n.body))}</p></div></a>`).join('')
      : `<div class="card empty"><div class="big">🔕</div><p>${t('noNotifications')}</p></div>`}</div>`, { back: true, title: t('notifications') });
  bindShell(root);
  if (notifications.some((n) => !n.read)) { await api('POST', '/notifications/read-all'); S.unread = 0; const d = $('.topbar .dot', root); d?.remove(); }
});

// ---------------------------------------------------------------- admin panel
on(/^#\/admin(?:\/(\w+))?$/, async (root, m) => {
  if (S.user.role !== 'admin') return go('#/home');
  const tab = m[1] || 'stats';
  const tabs = ['stats', 'procedures', 'reports', 'agents', 'bookings'];
  const tabLabel = { stats: t('stats'), procedures: t('procedures'), reports: t('reports'), agents: t('agents'), bookings: t('bookings') };
  let body = '';
  if (tab === 'stats') {
    const s = await api('GET', '/admin/stats');
    const ch = s.channels;
    body = `<div class="grid2">${[['users', s.users], ['procedures', s.procedures], ['pendingAgents', s.pendingAgents], ['openBookings', s.openBookings], ['openReports', s.openReports]].map(([k, v]) => `<div class="card"><p class="small muted">${t(k)}</p><p style="font-size:1.8rem;font-weight:800;color:var(--blue-900)">${v}</p></div>`).join('')}</div>
      <div class="card" style="margin-top:10px"><h3>${t('plans')}</h3>${s.plans.map((p) => `<p class="row between small"><span>${t({ free: 'planFree', family: 'planFamily', business: 'planBusiness' }[p.plan])}</span><b>${p.c}</b></p>`).join('')}
        <p class="row between small" style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><span>${t('revenue')}</span><b>${s.revenue.toFixed(3)} ${t('kwd')}</b></p></div>
      <div class="card" style="margin-top:10px"><h3>${t('commission')} (${s.commission.pct}%)</h3>
        <p class="row between small"><span>${t('s_done')}</span><b>${s.commission.doneBookings}</b></p>
        <p class="row between small"><span>${t('commission')}</span><b>${s.commission.amount.toFixed(3)} ${t('kwd')}</b></p></div>
      <div class="card" style="margin-top:10px"><h3>${t('channels')}</h3>${[['SMS', ch.sms], ['WhatsApp', ch.whatsapp], ['Push', ch.push], ['AI', ch.ai], ['MyFatoorah', ch.payments]].map(([n, on]) => `<p class="row between small"><span>${n}</span><span class="badge ${on ? 'b-green' : 'b-gray'}">${on ? '✓' : t('notConfigured')}</span></p>`).join('')}</div>`;
  } else if (tab === 'reports') {
    const { reports } = await api('GET', '/admin/reports');
    body = `<div class="list">${reports.length ? reports.map((r) => `<div class="card tight"><div class="row between"><a href="#/admin-p/${r.procedure.id}"><h3 style="font-size:.95rem">${esc(L(r.procedure.title))}</h3></a><span class="badge ${r.status === 'open' ? 'b-yellow' : 'b-green'}">${t(r.status)}</span></div>
      <p class="small" style="margin-top:6px;white-space:pre-wrap">${esc(r.message)}</p><p class="tiny muted">${esc(r.created_at)}</p>
      <button class="btn btn-light btn-sm" style="margin-top:8px" data-rp="${r.id}" data-st="${r.status === 'open' ? 'resolved' : 'open'}">${r.status === 'open' ? '✓ ' + t('resolve') : t('reopen')}</button></div>`).join('')
      : `<div class="card empty"><p>${t('noReports')}</p></div>`}</div>`;
  } else if (tab === 'procedures') {
    const { procedures } = await api('GET', '/admin/procedures');
    body = `<a class="btn btn-primary block" href="#/admin-p/new">+ ${t('newProcedure')}</a><div class="list" style="margin-top:10px">${procedures.map((p) => `
      <a class="card tight link row" href="#/admin-p/${p.id}"><span style="font-size:1.4rem">${catIcon(p.category)}</span><div class="grow"><h3 style="font-size:.95rem">${esc(L(p.title))}</h3><p class="tiny muted">${p.steps.length} ${t('steps')} · ${esc(p.slug)}</p></div>${p.published ? '' : `<span class="badge b-gray">${t('unpublished')}</span>`}<span class="chev">✎</span></a>`).join('')}</div>`;
  } else if (tab === 'agents') {
    const { agents } = await api('GET', '/admin/agents');
    body = `<div class="list">${agents.map((a) => `<div class="card tight"><div class="row between"><h3>${esc(L(a.name))}</h3><span class="badge ${{ pending: 'b-yellow', approved: 'b-green', rejected: 'b-red' }[a.status]}">${t(a.status)}</span></div>
      <p class="small muted"><span class="ltr">${esc(a.phone)}</span> · ${a.price} ${t('kwd')} · ${a.categories.map((c) => catIcon(c)).join(' ')}</p>
      <div class="row" style="margin-top:8px">${a.status !== 'approved' ? `<button class="btn btn-primary btn-sm" data-ag="${a.id}" data-st="approved">${t('approve')}</button>` : ''}${a.status !== 'rejected' ? `<button class="btn btn-danger btn-sm" data-ag="${a.id}" data-st="rejected">${t('reject')}</button>` : ''}</div></div>`).join('')}</div>`;
  } else {
    const { bookings } = await api('GET', '/admin/bookings');
    body = `<div class="list">${bookings.map((b) => {
      const next = FLOW[FLOW.indexOf(b.status) + 1];
      return `<div class="card tight"><div class="row between"><h3 style="font-size:.95rem">${esc(b.procedure ? L(b.procedure.title) : '—')}</h3>${statusBadge(b.status)}</div>
        <p class="small muted">👤 ${esc(b.user.name)} (<span class="ltr">${esc(b.user.phoneMasked)}</span>) · 🤝 ${esc(L(b.agent.name))}</p>${stepper(b.status)}
        ${next && b.status !== 'cancelled' ? `<button class="btn btn-light btn-sm" style="margin-top:10px" data-bk="${b.id}" data-st="${next}">${t('advance')}: ${t('s_' + next)}</button>` : ''}</div>`;
    }).join('')}</div>`;
  }
  root.innerHTML = shell(`<div class="tabs" style="margin-bottom:14px">${tabs.map((k) => `<button class="${k === tab ? 'on' : ''}" data-tab="${k}">${tabLabel[k]}</button>`).join('')}</div>${body}`, { tab: 'profile', back: true, title: t('admin') });
  bindShell(root);
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => go('#/admin/' + b.dataset.tab)));
  $$('[data-ag]', root).forEach((b) => (b.onclick = async () => { await api('PATCH', '/admin/agents/' + b.dataset.ag, { status: b.dataset.st }); route(); }));
  $$('[data-rp]', root).forEach((b) => (b.onclick = async () => { await api('PATCH', '/admin/reports/' + b.dataset.rp, { status: b.dataset.st }); route(); }));
  $$('[data-bk]', root).forEach((b) => (b.onclick = async () => { try { await api('PATCH', '/admin/bookings/' + b.dataset.bk, { status: b.dataset.st }); route(); } catch (e) { toast(errMsg(e)); } }));
});

on(/^#\/admin-p\/(new|\d+)$/, async (root, m) => {
  if (S.user.role !== 'admin') return go('#/home');
  const isNew = m[1] === 'new';
  const { procedures } = await api('GET', '/admin/procedures');
  const p = isNew ? { slug: '', category: 'civil', mode: 'online', popular: 10, published: true, title: {}, summary: {}, fees: {}, duration: {}, steps: [{ title: {}, entity: 'sahel', mode: 'online' }], documents: [], keywords: { s: [], a: [], x: [] } } : procedures.find((x) => String(x.id) === m[1]);
  if (!p) return go('#/admin/procedures');
  const E = S.config.entities;
  const stepRow = (s = { title: {}, entity: 'sahel', mode: 'online' }) => `<div class="step-edit">
    <input class="input" data-k="ar" placeholder="${t('titleAr')}" value="${esc(s.title.ar || '')}" style="margin-bottom:6px">
    <input class="input" data-k="en" placeholder="${t('titleEn')}" value="${esc(s.title.en || '')}" dir="ltr" style="margin-bottom:6px">
    <div class="row"><select class="input" data-k="entity">${Object.entries(E).map(([k, e]) => `<option value="${k}" ${s.entity === k ? 'selected' : ''}>${esc(L(e))}</option>`).join('')}</select>
      <select class="input" data-k="mode" style="max-width:130px"><option value="online" ${s.mode === 'online' ? 'selected' : ''}>${t('step_online')}</option><option value="in_person" ${s.mode === 'in_person' ? 'selected' : ''}>${t('step_in_person')}</option></select></div>
    <div class="row" style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-up>↑</button><button type="button" class="btn btn-ghost btn-sm" data-down>↓</button><span class="grow"></span><button type="button" class="btn btn-danger btn-sm" data-rm>✕</button></div></div>`;
  const pair = (name, lab, o, ta) => `<div class="grid2">${['ar', 'en'].map((lg) => `<label class="f"><span>${t(lab + (lg === 'ar' ? 'Ar' : 'En'))}</span>${ta ? `<textarea class="input" name="${name}_${lg}" ${lg === 'en' ? 'dir="ltr"' : ''}>${esc(o[lg] || '')}</textarea>` : `<input class="input" name="${name}_${lg}" value="${esc(o[lg] || '')}" ${lg === 'en' ? 'dir="ltr"' : ''}>`}</label>`).join('')}</div>`;
  root.innerHTML = shell(`<form class="card" id="pf">
    ${pair('title', 'title', p.title)}${pair('summary', 'summary', p.summary, true)}${pair('fees', 'fees', p.fees)}${pair('duration', 'duration', p.duration)}
    <div class="grid2"><label class="f"><span>${t('slug')}</span><input class="input" name="slug" dir="ltr" required pattern="[a-z0-9-]{3,80}" value="${esc(p.slug)}"></label>
      <label class="f"><span>${t('popularity')}</span><input class="input" name="popular" type="number" min="0" max="1000" value="${p.popular}"></label></div>
    <div class="grid2"><label class="f"><span>${t('category')}</span><select class="input" name="category">${Object.entries(S.config.categories).map(([k, c]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${esc(L(c))}</option>`).join('')}</select></label>
      <label class="f"><span>${t('mode')}</span><select class="input" name="mode">${['online', 'in_person', 'mixed'].map((k) => `<option value="${k}" ${p.mode === k ? 'selected' : ''}>${t('mode_' + k)}</option>`).join('')}</select></label></div>
    <label class="check"><input type="checkbox" name="published" ${p.published ? 'checked' : ''}><span>${t('published')}</span></label>
    <h3 style="margin:14px 0 8px">${t('steps')}</h3><div id="steps">${p.steps.map(stepRow).join('')}</div>
    <button type="button" class="btn btn-light btn-sm" id="addstep">+ ${t('addStep')}</button>
    <label class="f" style="margin-top:14px"><span>${t('docsLines')}</span><textarea class="input" name="docs" rows="5">${esc(p.documents.map((d) => `${d.ar} | ${d.en}`).join('\n'))}</textarea></label>
    <label class="f"><span>${t('keywordsS')}</span><input class="input" name="kw_s" value="${esc((p.keywords.s || []).join('، '))}"></label>
    <label class="f"><span>${t('keywordsA')}</span><input class="input" name="kw_a" value="${esc((p.keywords.a || []).join('، '))}"></label>
    <label class="f"><span>${t('keywordsX')}</span><input class="input" name="kw_x" value="${esc((p.keywords.x || []).join('، '))}"></label>
    <p class="err" id="err"></p><button class="btn btn-primary block">${t('save')}</button>
    ${isNew ? '' : `<button type="button" class="btn btn-danger block" style="margin-top:8px" id="pdel">${t('delete')}</button>`}
  </form>`, { tab: 'profile', back: true, title: isNew ? t('newProcedure') : L(p.title) });
  bindShell(root);
  const stepsEl = $('#steps', root);
  stepsEl.onclick = (e) => {
    const row = e.target.closest('.step-edit'); if (!row) return;
    if (e.target.matches('[data-rm]')) row.remove();
    if (e.target.matches('[data-up]') && row.previousElementSibling) stepsEl.insertBefore(row, row.previousElementSibling);
    if (e.target.matches('[data-down]') && row.nextElementSibling) stepsEl.insertBefore(row.nextElementSibling, row);
  };
  $('#addstep', root).onclick = () => stepsEl.insertAdjacentHTML('beforeend', stepRow());
  const split = (s) => s.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
  $('#pf', root).onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const bi = (n) => ({ ar: f[n + '_ar'] || '', en: f[n + '_en'] || '' });
    const body = {
      slug: f.slug, category: f.category, mode: f.mode, popular: Number(f.popular), published: !!e.target.published.checked,
      title: bi('title'), summary: bi('summary'), fees: bi('fees'), duration: bi('duration'),
      steps: $$('.step-edit', stepsEl).map((r) => ({ title: { ar: $('[data-k=ar]', r).value, en: $('[data-k=en]', r).value }, entity: $('[data-k=entity]', r).value, mode: $('[data-k=mode]', r).value })),
      documents: f.docs.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [ar, en] = l.split('|').map((x) => x.trim()); return { ar, en: en || ar }; }),
      keywords: { s: split(f.kw_s), a: split(f.kw_a), x: split(f.kw_x) },
    };
    try { isNew ? await api('POST', '/admin/procedures', body) : await api('PUT', '/admin/procedures/' + p.id, body); toast(t('saved')); go('#/admin/procedures'); }
    catch (err) { $('#err', root).textContent = errMsg(err) + ` (${err.code})`; }
  };
  $('#pdel', root)?.addEventListener('click', async () => { if (!confirm(t('confirmDelete'))) return; await api('DELETE', '/admin/procedures/' + p.id); go('#/admin/procedures'); });
});

// ---------------------------------------------------------------- legal pages
const LEGAL = {
  privacy: {
    ar: [
      ['ما الذي نجمعه', 'رقم هاتفك واسمك، وأسماء أفراد عائلتك أو موظفيك وصلتهم وجنسيتهم، وبيانات المستندات التي تضيفها (النوع والرقم وتاريخ الانتهاء والصورة إن رفعتها)، وحجوزاتك مع المناديب وملاحظاتك عليها، وتفضيلات التنبيهات.'],
      ['كيف نحفظها', 'تُحفظ البيانات في قاعدة بيانات سحابية (Supabase) ويعمل التطبيق على خوادم Vercel، وقد تكون هذه الخوادم خارج الكويت. أرقام المستندات وصورها مشفّرة بمعيار AES-256 ولا تظهر الأرقام كاملة في القوائم. الاتصال بالتطبيق مشفّر (HTTPS).'],
      ['من يطّلع عليها', 'أنت فقط ترى مستنداتك. المندوب الذي تحجزه يرى اسمك وتفاصيل الطلب، ويرى رقم هاتفك فقط أثناء تنفيذ طلبك. فريق الإدارة يرى بيانات الحجوزات ورقم هاتفك مخفياً جزئياً، ولا يرى مستنداتك.'],
      ['الخدمات الخارجية', 'نستعين بمزوّدين عند تفعيل خدماتهم: Twilio لإرسال رمز الدخول ورسائل واتساب (يستلم رقمك ونص الرسالة)، وOpenAI لفهم طلبك المكتوب ولقراءة صورة المستند عندما تستخدم «القراءة التلقائية» (تُرسل الصورة مؤقتاً لقراءتها)، وMyFatoorah لمعالجة الدفع (لا نحفظ بيانات بطاقتك). لا نبيع بياناتك ولا نستخدمها للإعلانات.'],
      ['حذف بياناتك', 'من «حسابي ← حذف الحساب وكل بياناته» تُحذف فوراً كل بياناتك: الحساب والأفراد والمستندات والصور والحجوزات والتنبيهات.'],
      ['ملفات الارتباط والتخزين', 'نستخدم ملف ارتباط واحداً لإبقائك مسجلاً، ونحفظ على جهازك لغتك وعلامات قائمة المستندات فقط.'],
      ['تنبيه', 'مرشدك تطبيق إرشادي مستقل وليس جهة حكومية، ولا يرتبط بتطبيق سهل أو أي جهة رسمية.'],
    ],
    en: [
      ['What we collect', 'Your phone number and name; names, relations and nationalities of family members or employees; the documents you add (type, number, expiry date and photo if uploaded); your bookings with agents and notes; and your notification preferences.'],
      ['How we store it', 'Data is stored in a cloud database (Supabase) and the app runs on Vercel; these servers may be outside Kuwait. Document numbers and photos are encrypted with AES-256, and numbers are never shown in full in lists. Connections are encrypted (HTTPS).'],
      ['Who can see it', 'Only you see your documents. An agent you book sees your name and the request details, and your phone number only while working on your request. The admin team sees booking details and a partly hidden phone number, not your documents.'],
      ['Outside services', 'When enabled we use: Twilio to send sign-in codes and WhatsApp messages (it receives your number and the message text); OpenAI to understand typed requests and to read a document photo when you use "automatic reading" (the photo is sent temporarily); MyFatoorah to process payments (we never store card details). We do not sell your data or use it for advertising.'],
      ['Deleting your data', '"Profile → Delete account and all data" immediately deletes everything: account, members, documents, photos, bookings and notifications.'],
      ['Cookies & storage', 'One cookie keeps you signed in. On your device we store only your language and document-checklist ticks.'],
      ['Note', 'Murshidak is an independent guide, not a government body, and is not affiliated with Sahel or any official entity.'],
    ],
  },
  terms: {
    ar: [
      ['طبيعة الخدمة', 'مرشدك دليل إرشادي يشرح خطوات المعاملات الحكومية في الكويت. لا ينفّذ المعاملات ولا يمثّل أي جهة حكومية، والمعلومات (الرسوم والمدد والخطوات) إرشادية وقد تتغيّر؛ تأكد دائماً من الجهة الرسمية قبل التقديم.'],
      ['المناديب', 'المناديب مستقلون؛ نتحقق منهم قبل إظهارهم لكن الاتفاق والدفع يكونان بينك وبين المندوب مباشرة، والسعر المعروض أتعابه ولا يشمل الرسوم الحكومية. يمكنك الإبلاغ عن أي مشكلة من خلال التطبيق.'],
      ['الباقات والدفع', 'الباقات المدفوعة صالحة 30 يوماً من تأكيد الدفع، ولا تتجدد تلقائياً. عند انتهائها يعود حسابك للباقة المجانية وتبقى مستنداتك محفوظة.'],
      ['مسؤوليتك', 'أنت مسؤول عن صحة البيانات التي تضيفها، وعن الحفاظ على رقم هاتفك، وعن استخدام التطبيق لأغراض مشروعة فقط.'],
      ['حدود المسؤولية', 'نبذل جهدنا لدقة المعلومات والتذكيرات، لكننا لا نتحمل مسؤولية غرامات أو تأخير ناتج عن الاعتماد على التطبيق وحده. التذكيرات مساعدة ولا تغني عن متابعتك.'],
      ['التعديلات', 'قد نحدّث هذه الشروط، وسننشر التاريخ الجديد في هذه الصفحة. تخضع هذه الشروط لقوانين دولة الكويت.'],
    ],
    en: [
      ['The service', 'Murshidak is a guide explaining the steps of government procedures in Kuwait. It does not carry out transactions or represent any government body. Information (fees, durations, steps) is guidance and may change; always confirm with the official entity before applying.'],
      ['Agents', 'Agents are independent. We verify them before listing, but the agreement and payment are between you and the agent directly; the price shown is their fee and excludes government fees. You can report any problem through the app.'],
      ['Plans & payment', 'Paid plans last 30 days from payment confirmation and do not renew automatically. When a plan ends, your account returns to Free and your documents are kept.'],
      ['Your responsibilities', 'You are responsible for the accuracy of data you add, for keeping your phone number secure, and for lawful use of the app.'],
      ['Liability', 'We work to keep information and reminders accurate, but we are not liable for fines or delays caused by relying on the app alone. Reminders help but do not replace your own follow-up.'],
      ['Changes', 'We may update these terms and will show the new date on this page. These terms are governed by the laws of the State of Kuwait.'],
    ],
  },
};
for (const page of ['privacy', 'terms']) {
  on(new RegExp(`^#\\/${page}$`), (root) => {
    root.innerHTML = shell(`<div class="card stack">${LEGAL[page][S.lang].map(([h, p]) => `<div><h3>${esc(h)}</h3><p class="small" style="margin-top:4px">${esc(p)}</p></div>`).join('')}
      <p class="tiny muted">${S.lang === 'ar' ? 'آخر تحديث: 17 نوفمبر 2026' : 'Last updated: 17 November 2026'}</p></div>`, { back: true, title: t(page) });
    bindShell(root);
  }, { public: true });
}

// ---------------------------------------------------------------- router
async function route() {
  const root = $('#app');
  let hash = location.hash || '';
  if (!hash || hash === '#' || hash === '#/') hash = S.user ? '#/home' : store.get('onboarded', false) ? '#/login' : '#/onboarding';
  if (hash !== location.hash) { history.replaceState(null, '', hash); }
  const r = routes.find((x) => x.re.test(hash));
  if (!r) return go('#/home');
  if (!r.public && !S.user) return go(store.get('onboarded', false) ? '#/login' : '#/onboarding');
  if ((hash === '#/login' || hash === '#/onboarding') && S.user) return go('#/home');
  closeSheet();
  window.scrollTo(0, 0);
  // Fresh container per navigation: a slower, older screen finishing late writes into a
  // detached node instead of overwriting the current one.
  const view = document.createElement('div');
  root.replaceChildren(view);
  if (!r.bare) view.innerHTML = shell('<div class="spinner"></div>');
  try { await r.fn(view, hash.match(r.re)); }
  catch (e) {
    if (e.status === 401 || !view.isConnected) return;
    console.error(e);
    view.innerHTML = shell(`<div class="card empty"><div class="big">😕</div><p>${e.status === 404 ? '404' : t('error')}</p><a class="btn btn-light" style="margin-top:10px" href="#/home">${t('home')}</a></div>`, { back: true });
    bindShell(view);
  }
}

async function boot() {
  setLang(store.get('lang', 'ar'));
  S.config = await api('GET', '/config');
  try { S.user = (await api('GET', '/me')).user; } catch { S.user = null; }
  if (S.user && !store.get('lang', null)) setLang(S.user.lang);
  window.addEventListener('hashchange', route);
  route();
  // Needed for push notifications and to install the app on the home screen.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
