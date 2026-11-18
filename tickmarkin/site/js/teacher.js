// Tickmarkin — teacher portal: own classes and students (read-only, no finances)
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const waLink = (phone) => { const d = String(phone).replace(/^\+/, '').replace(/^00/, ''); return 'https://wa.me/' + (d.length === 8 ? '965' + d : d.replace(/^0/, '966')); };
  const phoneLinks = (p) => p ? h('span', { class: 'sub' }, h('a', { href: 'tel:' + p, dir: 'ltr' }, p), ' · ', h('a', { href: waLink(p), target: '_blank', rel: 'noopener' }, 'واتساب')) : h('span', { class: 'muted' }, '—');
  let D = null;

  function show(which) {
    $('#login-view').classList.toggle('hidden', which !== 'login');
    $('#app-view').classList.toggle('hidden', which !== 'app');
    $('#logout').classList.toggle('hidden', which !== 'app');
  }

  function render() {
    const q = $('#q').value.trim().toLowerCase();
    $('#hello').textContent = 'مرحباً، ' + D.teacher.name;
    $('#summary').textContent = `${D.classes.length} صف · ${D.students.length} طالب`;
    if (!D.classes.length) {
      $('#classes').replaceChildren(h('div', { class: 'empty' }, 'لم تُسند إليك صفوف بعد. تواصل مع إدارة المعهد.'));
      return;
    }
    $('#classes').replaceChildren(...D.classes.map((c) => {
      const list = D.students.filter((s) => s.classIds.includes(c.id) && (!q || [s.name, s.guardianName, s.guardianPhone, s.phone].join(' ').toLowerCase().includes(q)));
      return h('div', { class: 'card', style: 'margin-bottom:18px' },
        h('div', { class: 'cc-top' }, h('h3', {}, c.name), h('span', { class: 'chip' }, list.length + ' طالب')),
        h('p', { class: 'muted', style: 'margin:4px 0 14px' }, [c.subject, c.grade, c.schedule, c.room && 'قاعة ' + c.room].filter(Boolean).join(' · ') || ' '),
        h('div', { class: 'table-wrap' }, h('table', {},
          h('thead', {}, h('tr', {}, ['#', 'الطالب', 'جوال الطالب', 'ولي الأمر'].map((x) => h('th', {}, x)))),
          h('tbody', {}, list.length ? list.map((s, i) => h('tr', {},
            h('td', {}, i + 1),
            h('td', {}, h('b', {}, s.name), s.grade ? h('span', { class: 'sub' }, s.grade) : null),
            h('td', {}, phoneLinks(s.phone)),
            h('td', {}, s.guardianName || '—', phoneLinks(s.guardianPhone))))
            : h('tr', {}, h('td', { colspan: 4, class: 'center muted' }, q ? 'لا توجد نتائج' : 'لا يوجد طلاب في هذا الصف'))))));
    }));
  }

  async function load() {
    const r = await fetch('/api/office/teacher');
    if (r.status === 401) { show('login'); return; }
    if (!r.ok) throw new Error('http ' + r.status);
    D = await r.json();
    show('app');
    render();
  }

  $('#q').addEventListener('input', () => D && render());
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('.form-alert', e.target);
    const b = $('button', e.target);
    b.disabled = true;
    try {
      const r = await fetch('/api/office/teacher-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: $('#phone').value, password: $('#password').value }) });
      if (r.ok) { $('#password').value = ''; a.className = 'form-alert hidden'; await load(); return; }
      a.textContent = r.status === 429 ? 'محاولات كثيرة. انتظر 15 دقيقة.' : r.status === 503 ? 'النظام غير جاهز بعد. تواصل مع الإدارة.' : 'رقم الجوال أو كلمة المرور غير صحيحة، أو الحساب موقوف.';
      a.className = 'form-alert alert alert-error';
    } catch {
      a.textContent = 'تعذّر الاتصال بالخادم.';
      a.className = 'form-alert alert alert-error';
    } finally { b.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); D = null; show('login'); });
  load().catch(() => show('login'));
})();
