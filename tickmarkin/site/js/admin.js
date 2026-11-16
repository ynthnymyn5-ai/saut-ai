// Tickmarkin — admin panel
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const STATUS = { new: 'جديد', contacted: 'تم التواصل', confirmed: 'مؤكد', cancelled: 'ملغي' };
  const fmt = (iso) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' });
  let state = { registrations: [], messages: [], stats: null };

  // Builds DOM nodes with textContent only, so user-submitted data is never parsed as HTML.
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (r.status === 401) { showLogin(); throw new Error('unauthorized'); }
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  function showLogin() {
    $('#login-view').classList.remove('hidden');
    $('#dash-view').classList.add('hidden');
    $('#logout').classList.add('hidden');
    $('#password').focus();
  }
  function showDash() {
    $('#login-view').classList.add('hidden');
    $('#dash-view').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
  }

  async function load() {
    state = await api('/api/admin/data');
    showDash();
    renderKpis();
    fillFilters();
    renderRegs();
    renderMsgs();
  }

  function renderKpis() {
    const s = state.stats;
    const items = [
      ['إجمالي الطلبات', s.total],
      ['جديد', s.byStatus.new],
      ['تم التواصل', s.byStatus.contacted],
      ['مؤكد', s.byStatus.confirmed],
      ['رسائل غير مقروءة', s.unreadMessages],
    ];
    $('#kpis').replaceChildren(...items.map(([l, v]) => h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l))));
    $('#unread-badge').textContent = s.unreadMessages ? `(${s.unreadMessages})` : '';
  }

  function fillFilters() {
    const st = $('#f-status');
    if (st.options.length === 1) for (const [k, v] of Object.entries(STATUS)) st.append(h('option', { value: k }, v));
    const cs = $('#f-course');
    const current = cs.value;
    const titles = [...new Map(state.registrations.map((r) => [r.courseId, r.courseTitle])).entries()];
    cs.replaceChildren(h('option', { value: '' }, 'كل الدورات'), ...titles.map(([id, t]) => h('option', { value: id }, t)));
    cs.value = current;
  }

  function renderRegs() {
    const q = $('#f-q').value.trim().toLowerCase();
    const st = $('#f-status').value;
    const co = $('#f-course').value;
    const rows = state.registrations.filter((r) =>
      (!st || r.status === st) && (!co || r.courseId === co) &&
      (!q || [r.name, r.phone, r.email, r.id].join(' ').toLowerCase().includes(q)));
    const body = $('#regs-body');
    if (!rows.length) {
      body.replaceChildren(h('tr', {}, h('td', { colspan: 7, class: 'center muted' }, state.registrations.length ? 'لا توجد نتائج مطابقة.' : 'لا توجد طلبات تسجيل بعد.')));
      return;
    }
    body.replaceChildren(...rows.map((r) => {
      const sel = h('select', { 'aria-label': 'تغيير الحالة', onchange: async (e) => {
        try {
          await api('/api/admin/registrations/' + encodeURIComponent(r.id), { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
          await load();
        } catch (err) { if (err.message !== 'unauthorized') alert('تعذّر تحديث الحالة'); }
      } }, ...Object.entries(STATUS).map(([k, v]) => h('option', { value: k }, v)));
      sel.value = r.status;
      const wa = r.phone.replace(/^0/, '966').replace(/^\+/, '');
      return h('tr', {},
        h('td', {}, h('b', { dir: 'ltr' }, r.id), h('span', { class: 'sub' }, fmt(r.createdAt))),
        h('td', {}, h('b', {}, r.name),
          h('span', { class: 'sub' }, h('a', { href: 'tel:' + r.phone, dir: 'ltr' }, r.phone), ' · ', h('a', { href: 'https://wa.me/' + wa, target: '_blank', rel: 'noopener' }, 'واتساب')),
          r.email ? h('span', { class: 'sub', dir: 'ltr' }, r.email) : null,
          r.studentType ? h('span', { class: 'sub' }, r.studentType) : null),
        h('td', {}, r.courseTitle),
        h('td', {}, r.mode),
        h('td', { style: 'max-width:260px;white-space:pre-wrap' }, r.notes || '—'),
        h('td', {}, h('span', { class: 'status status-' + r.status }, STATUS[r.status]), h('div', { style: 'margin-top:6px' }, sel)),
        h('td', {}, h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
          if (!confirm(`حذف طلب ${r.name} نهائياً؟`)) return;
          try { await api('/api/admin/registrations/' + encodeURIComponent(r.id), { method: 'DELETE' }); await load(); }
          catch (err) { if (err.message !== 'unauthorized') alert('تعذّر الحذف'); }
        } }, 'حذف')));
    }));
  }

  function renderMsgs() {
    const body = $('#msgs-body');
    if (!state.messages.length) {
      body.replaceChildren(h('tr', {}, h('td', { colspan: 5, class: 'center muted' }, 'لا توجد رسائل بعد.')));
      return;
    }
    body.replaceChildren(...state.messages.map((m) => h('tr', { class: m.read ? '' : 'unread' },
      h('td', {}, fmt(m.createdAt)),
      h('td', {}, h('b', {}, m.name), h('span', { class: 'sub', dir: 'ltr' }, m.contact)),
      h('td', {}, m.subject || '—'),
      h('td', { style: 'max-width:380px;white-space:pre-wrap' }, m.message),
      h('td', { style: 'white-space:nowrap' },
        m.read ? null : h('button', { class: 'btn btn-outline btn-sm', onclick: async () => { await api('/api/admin/messages/' + encodeURIComponent(m.id), { method: 'PATCH' }); load(); } }, 'تمّت القراءة'),
        ' ',
        h('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
          if (!confirm('حذف الرسالة؟')) return;
          await api('/api/admin/messages/' + encodeURIComponent(m.id), { method: 'DELETE' }); load();
        } }, 'حذف')))));
  }

  // events
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = $('.form-alert', e.target);
    const btn = $('button', e.target);
    btn.disabled = true;
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
      if (r.ok) { $('#password').value = ''; alertEl.className = 'form-alert hidden'; await load(); return; }
      alertEl.textContent = r.status === 429 ? 'محاولات كثيرة. انتظر 15 دقيقة.' : 'كلمة المرور غير صحيحة.';
      alertEl.className = 'form-alert alert alert-error';
    } catch {
      alertEl.textContent = 'تعذّر الاتصال بالخادم.';
      alertEl.className = 'form-alert alert alert-error';
    } finally { btn.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); });
  $('#refresh').addEventListener('click', () => load().catch(() => {}));
  ['#f-q', '#f-status', '#f-course'].forEach((s) => $(s).addEventListener('input', renderRegs));
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#tab-regs').classList.toggle('hidden', b.dataset.tab !== 'regs');
    $('#tab-msgs').classList.toggle('hidden', b.dataset.tab !== 'msgs');
  }));

  load().catch(() => showLogin());
})();
