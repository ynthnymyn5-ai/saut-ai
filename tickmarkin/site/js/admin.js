// Tickmarkin — institute management (admin)
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // DOM builder: user data only ever goes through textContent / attributes, never innerHTML.
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }

  const REG_STATUS = { new: 'جديد', contacted: 'تم التواصل', confirmed: 'مؤكد', cancelled: 'ملغي' };
  const money = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' د.ك';
  const fmtDate = (iso) => iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const today = () => new Date().toISOString().slice(0, 10);
  const waLink = (phone) => { const d = String(phone).replace(/^\+/, '').replace(/^00/, ''); return 'https://wa.me/' + (d.length === 8 ? '965' + d : d.replace(/^0/, '966')); }; // 8-digit numbers are Kuwaiti (+965)

  let S = { students: [], teachers: [], classes: [], fees: [], payments: [], balances: {}, paymentMethods: [], registrations: [], messages: [], storage: '' };
  let current = 'overview';
  const byId = (col, id) => S[col].find((x) => x.id === id);
  const bal = (sid) => { const b = S.balances[sid] || { charged: 0, paid: 0 }; return { ...b, due: b.charged - b.paid }; };

  // ---------- api ----------
  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const body = await r.json().catch(() => ({}));
    if (r.status === 401) { showLogin(); throw Object.assign(new Error('unauthorized'), { status: 401 }); }
    if (!r.ok) throw Object.assign(new Error(body.error || 'http ' + r.status), { status: r.status, body });
    return body;
  }
  function toast(msg, bad) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.className = 'toast'), 2600);
  }
  const errText = (e) => e.status === 503 ? 'قاعدة البيانات غير مربوطة بعد (أضف مفتاح Supabase).' : e.status === 422 ? 'تحقّق من الحقول.' : 'حدث خطأ، حاول مرة أخرى.';

  async function load() {
    const [office, admin] = await Promise.all([api('/api/office/all'), api('/api/admin/data')]);
    S = { ...S, ...office, registrations: admin.registrations, messages: admin.messages, storage: admin.storage };
    showApp();
    render();
  }

  // ---------- shell ----------
  function showLogin() {
    $('#login-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
    $('#logout').classList.add('hidden');
    $('#password')?.focus();
  }
  function showApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
    const newRegs = S.registrations.filter((r) => r.status === 'new').length;
    const unread = S.messages.filter((m) => !m.read).length;
    $('#badge-regs').textContent = newRegs || '';
    $('#badge-msgs').textContent = unread || '';
    const note = $('#storage-note');
    note.classList.toggle('hidden', S.storage !== 'file');
    note.textContent = S.storage === 'file' ? 'وضع التجربة: البيانات محفوظة في ملف محلي على الخادم.' : '';
  }
  function go(view) {
    current = view;
    $$('.office-nav [data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    render();
    $('.office-main').scrollTo?.({ top: 0 });
  }
  function render() {
    const views = { overview, students, teachers, classes, finance, registrations, messages };
    $('#view').replaceChildren(views[current]());
  }
  const head = (title, sub, ...actions) => h('div', { class: 'view-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'view-actions' }, actions));
  const btn = (label, onclick, cls = 'btn btn-primary btn-sm') => h('button', { class: cls, type: 'button', onclick }, label);
  const empty = (cols, text) => h('tr', {}, h('td', { colspan: cols, class: 'center muted', style: 'padding:36px' }, text));
  const table = (headers, rows, emptyText) => h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.length ? rows : empty(headers.length, emptyText))));
  const chip = (text, c) => h('span', { class: 'chip', style: c ? `--c:${c}` : null }, text);
  const dueCell = (d) => h('b', { class: d > 0 ? 'due' : d < 0 ? 'credit' : 'paid' }, d > 0 ? money(d) : d < 0 ? 'رصيد ' + money(-d) : 'مسدّد');
  const contact = (phone) => phone ? h('span', { class: 'sub' }, h('a', { href: 'tel:' + phone, dir: 'ltr' }, phone), ' · ', h('a', { href: waLink(phone), target: '_blank', rel: 'noopener' }, 'واتساب')) : null;
  const actions = (...items) => h('div', { class: 'row-actions' }, items);
  const studentsIn = (cid) => S.students.filter((s) => s.status === 'active' && s.classIds.includes(cid));

  // ---------- generic form dialog ----------
  // field: { name, label, type, options:[[value,label]], required, hint, full, placeholder }
  function openForm({ title, fields, values = {}, submitLabel = 'حفظ', onSubmit }) {
    const form = h('form', { class: 'form-grid', novalidate: true });
    const alertEl = h('div', { class: 'form-alert hidden full', role: 'alert' });
    form.append(alertEl);
    for (const f of fields) {
      const id = 'f-' + f.name;
      let input;
      const v = values[f.name];
      if (f.type === 'select') {
        input = h('select', { id, name: f.name }, f.options.map(([val, lab]) => h('option', { value: val }, lab)));
        input.value = v ?? f.options[0]?.[0] ?? '';
      } else if (f.type === 'textarea') {
        input = h('textarea', { id, name: f.name, rows: 3, placeholder: f.placeholder });
        input.value = v ?? '';
      } else if (f.type === 'checks') {
        const set = new Set(v || []);
        input = h('div', { class: 'checks', id }, f.options.length ? f.options.map(([val, lab]) =>
          h('label', {}, h('input', { type: 'checkbox', name: f.name, value: val, checked: set.has(val) }), ' ', lab)) : h('span', { class: 'muted' }, f.emptyText || 'لا توجد خيارات'));
      } else if (f.type === 'switch') {
        input = h('label', { class: 'check' }, h('input', { type: 'checkbox', id, name: f.name, checked: v !== false }), ' ', f.switchLabel || '');
      } else {
        input = h('input', { id, name: f.name, type: f.type || 'text', placeholder: f.placeholder, inputmode: f.inputmode, dir: f.dir, step: f.step, min: f.min, autocomplete: f.autocomplete || 'off' });
        input.value = v ?? '';
      }
      form.append(h('div', { class: 'field' + (f.full ? ' full' : ''), 'data-field': f.name },
        f.type === 'switch' ? null : h('label', { for: id }, f.label, f.required ? h('span', { class: 'req' }, ' *') : null),
        input, f.hint ? h('small', { class: 'muted' }, f.hint) : null, h('div', { class: 'err' })));
    }
    const submit = h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel);
    form.append(h('div', { class: 'full dlg-foot' }, submit, h('button', { class: 'btn btn-outline', type: 'button', onclick: closeDlg }, 'إلغاء')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {};
      for (const f of fields) {
        if (f.type === 'checks') data[f.name] = $$(`input[name="${f.name}"]:checked`, form).map((x) => x.value);
        else if (f.type === 'switch') data[f.name] = form.elements[f.name].checked;
        else data[f.name] = form.elements[f.name].value;
      }
      $$('.field', form).forEach((x) => { x.classList.remove('invalid'); $('.err', x).textContent = ''; });
      alertEl.className = 'form-alert hidden full';
      submit.disabled = true;
      try {
        await onSubmit(data);
        closeDlg();
      } catch (err) {
        if (err.status === 401) return;
        const fieldsErr = err.body?.fields || {};
        for (const [k, msg] of Object.entries(fieldsErr)) {
          const box = $(`.field[data-field="${k}"]`, form);
          if (box) { box.classList.add('invalid'); $('.err', box).textContent = msg; }
        }
        alertEl.textContent = errText(err);
        alertEl.className = 'form-alert alert alert-error full';
      } finally { submit.disabled = false; }
    });
    openDlg(title, form);
    setTimeout(() => form.querySelector('input:not([type=checkbox]),select,textarea')?.focus(), 50);
  }
  function openDlg(title, content) {
    $('#dlg-title').textContent = title;
    $('#dlg-body').replaceChildren(content);
    const d = $('#dlg');
    if (!d.open) d.showModal();
  }
  function closeDlg() { $('#dlg').close(); }
  $('.dlg-x').addEventListener('click', closeDlg);
  $('#dlg').addEventListener('click', (e) => { if (e.target.id === 'dlg') closeDlg(); });

  async function save(col, id, data, msg) {
    await api(`/api/office/${col}${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body: data });
    toast(msg || 'تم الحفظ');
    await load();
  }
  async function remove(col, id, question) {
    if (!confirm(question)) return;
    try {
      await api(`/api/office/${col}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast('تم الحذف');
      await load();
    } catch (e) { if (e.status !== 401) toast(errText(e), true); }
  }

  // ---------- forms ----------
  const classOptions = () => S.classes.map((c) => [c.id, c.name + (c.teacherId && byId('teachers', c.teacherId) ? ' — ' + byId('teachers', c.teacherId).name : '')]);
  const studentOptions = () => [['', '— اختر الطالب —'], ...S.students.map((s) => [s.id, s.name + (s.grade ? ' · ' + s.grade : '')])];

  function studentForm(s = {}) {
    openForm({
      title: s.id ? 'تعديل بيانات الطالب' : 'إضافة طالب',
      values: s,
      fields: [
        { name: 'name', label: 'اسم الطالب', required: true },
        { name: 'grade', label: 'المرحلة / الصف الدراسي', placeholder: 'مثال: ثالث ثانوي' },
        { name: 'phone', label: 'جوال الطالب', type: 'tel', dir: 'ltr', inputmode: 'tel' },
        { name: 'guardianName', label: 'اسم ولي الأمر' },
        { name: 'guardianPhone', label: 'جوال ولي الأمر', type: 'tel', dir: 'ltr', inputmode: 'tel' },
        { name: 'status', label: 'الحالة', type: 'select', options: [['active', 'منتظم'], ['inactive', 'منقطع / متوقف']] },
        { name: 'classIds', label: 'الصفوف', type: 'checks', options: classOptions(), full: true, emptyText: 'أضف صفوفاً أولاً من قسم الصفوف' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
      ],
      onSubmit: (d) => save('students', s.id, d, s.id ? 'تم تحديث الطالب' : 'تمت إضافة الطالب'),
    });
  }
  function teacherForm(t = {}) {
    openForm({
      title: t.id ? 'تعديل بيانات المعلم' : 'إضافة معلم',
      values: t,
      fields: [
        { name: 'name', label: 'اسم المعلم', required: true },
        { name: 'subject', label: 'التخصص / المادة' },
        { name: 'phone', label: 'رقم الجوال (اسم الدخول)', type: 'tel', dir: 'ltr', inputmode: 'tel', required: true },
        { name: 'email', label: 'البريد الإلكتروني', type: 'email', dir: 'ltr' },
        { name: 'password', label: t.id ? 'كلمة مرور جديدة' : 'كلمة المرور', type: 'text', dir: 'ltr', required: !t.id, hint: t.id ? 'اتركه فارغاً لإبقاء كلمة المرور الحالية' : '6 أحرف على الأقل. سلّمها للمعلم ليدخل من صفحة المعلمين.', autocomplete: 'new-password' },
        { name: 'active', type: 'switch', switchLabel: 'الحساب مفعّل (يستطيع الدخول)' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
      ],
      onSubmit: (d) => save('teachers', t.id, d, t.id ? 'تم تحديث المعلم' : 'تمت إضافة المعلم'),
    });
  }
  function classForm(c = {}) {
    openForm({
      title: c.id ? 'تعديل الصف' : 'إضافة صف',
      values: { ...c, fee: c.fee ?? '', capacity: c.capacity ?? '' },
      fields: [
        { name: 'name', label: 'اسم الصف', required: true, placeholder: 'مثال: رياضيات ثالث ثانوي - مجموعة أ' },
        { name: 'teacherId', label: 'المعلم', type: 'select', options: [['', '— بدون معلم —'], ...S.teachers.map((t) => [t.id, t.name])] },
        { name: 'subject', label: 'المادة' },
        { name: 'grade', label: 'المرحلة' },
        { name: 'schedule', label: 'المواعيد', placeholder: 'مثال: الأحد والثلاثاء 5–7م' },
        { name: 'room', label: 'القاعة' },
        { name: 'fee', label: 'الرسوم الافتراضية (د.ك)', inputmode: 'decimal', dir: 'ltr' },
        { name: 'capacity', label: 'السعة (عدد الطلاب)', inputmode: 'numeric', dir: 'ltr' },
        { name: 'notes', label: 'ملاحظات', type: 'textarea', full: true },
      ],
      onSubmit: (d) => save('classes', c.id, d, c.id ? 'تم تحديث الصف' : 'تمت إضافة الصف'),
    });
  }
  function feeForm(pre = {}) {
    openForm({
      title: 'إضافة مستحق على طالب',
      values: { dueDate: '', ...pre },
      fields: [
        { name: 'studentId', label: 'الطالب', type: 'select', options: studentOptions(), required: true, full: true },
        { name: 'description', label: 'الوصف', required: true, placeholder: 'مثال: رسوم شهر ديسمبر' },
        { name: 'amount', label: 'المبلغ (د.ك)', required: true, inputmode: 'decimal', dir: 'ltr' },
        { name: 'classId', label: 'مرتبط بصف (اختياري)', type: 'select', options: [['', '—'], ...S.classes.map((c) => [c.id, c.name])] },
        { name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
      ],
      onSubmit: (d) => save('fees', null, d, 'تمت إضافة المستحق'),
    });
  }
  function paymentForm(pre = {}) {
    openForm({
      title: 'تسجيل دفعة',
      values: { paidAt: today(), ...pre },
      submitLabel: 'تسجيل الدفعة',
      fields: [
        { name: 'studentId', label: 'الطالب', type: 'select', options: studentOptions(), required: true, full: true },
        { name: 'amount', label: 'المبلغ المدفوع (د.ك)', required: true, inputmode: 'decimal', dir: 'ltr' },
        { name: 'method', label: 'طريقة الدفع', type: 'select', options: S.paymentMethods.map((m) => [m, m]) },
        { name: 'paidAt', label: 'تاريخ الدفع', type: 'date' },
        { name: 'note', label: 'ملاحظة / رقم الإيصال' },
      ],
      onSubmit: (d) => save('payments', null, d, 'تم تسجيل الدفعة'),
    });
  }
  function chargeClassForm(c) {
    const n = studentsIn(c.id).length;
    openForm({
      title: 'إصدار رسوم لصف: ' + c.name,
      values: { description: 'رسوم ' + c.name, amount: c.fee ?? '', dueDate: '' },
      submitLabel: `إصدار لـ ${n} طالب`,
      fields: [
        { name: 'description', label: 'الوصف', required: true, full: true },
        { name: 'amount', label: 'المبلغ لكل طالب (د.ك)', required: true, inputmode: 'decimal', dir: 'ltr' },
        { name: 'dueDate', label: 'تاريخ الاستحقاق', type: 'date' },
      ],
      onSubmit: async (d) => {
        const r = await api(`/api/office/classes/${encodeURIComponent(c.id)}/charge`, { method: 'POST', body: d });
        toast(`تم إصدار الرسوم على ${r.count} طالب`);
        await load();
      },
    });
  }
  function statement(s) {
    const b = bal(s.id);
    const fees = S.fees.filter((f) => f.studentId === s.id);
    const pays = S.payments.filter((p) => p.studentId === s.id);
    const delBtn = (col, id, q) => h('button', { class: 'icon-btn danger', type: 'button', title: 'حذف', onclick: async () => { closeDlg(); await remove(col, id, q); statement(byId('students', s.id) || s); } }, '×');
    openDlg('كشف حساب: ' + s.name, h('div', { class: 'statement' },
      h('div', { class: 'mini-kpis' },
        h('div', {}, h('span', {}, 'إجمالي المستحقات'), h('b', {}, money(b.charged))),
        h('div', {}, h('span', {}, 'المدفوع'), h('b', { class: 'paid' }, money(b.paid))),
        h('div', {}, h('span', {}, 'المتبقي'), dueCell(b.due))),
      h('div', { class: 'dlg-foot', style: 'margin:0 0 14px' },
        btn('+ تسجيل دفعة', () => paymentForm({ studentId: s.id })), btn('+ إضافة مستحق', () => feeForm({ studentId: s.id }), 'btn btn-outline btn-sm')),
      h('h3', {}, 'المستحقات'),
      table(['التاريخ', 'الوصف', 'الاستحقاق', 'المبلغ', ''], fees.map((f) => h('tr', {},
        h('td', {}, fmtDate(f.createdAt)), h('td', {}, f.description, f.classId && byId('classes', f.classId) && !f.description.includes(byId('classes', f.classId).name) ? h('span', { class: 'sub' }, byId('classes', f.classId).name) : null),
        h('td', {}, fmtDate(f.dueDate)), h('td', {}, money(f.amount)), h('td', {}, delBtn('fees', f.id, 'حذف هذا المستحق؟')))), 'لا توجد مستحقات'),
      h('h3', { style: 'margin-top:18px' }, 'الدفعات'),
      table(['التاريخ', 'الطريقة', 'ملاحظة', 'المبلغ', ''], pays.map((p) => h('tr', {},
        h('td', {}, fmtDate(p.paidAt)), h('td', {}, p.method), h('td', {}, p.note || '—'), h('td', {}, h('b', { class: 'paid' }, money(p.amount))),
        h('td', {}, delBtn('payments', p.id, 'حذف هذه الدفعة؟')))), 'لا توجد دفعات')));
  }

  // ---------- views ----------
  function overview() {
    const active = S.students.filter((s) => s.status === 'active');
    let charged = 0, paid = 0;
    for (const s of S.students) { const b = bal(s.id); charged += b.charged; paid += b.paid; }
    const debtors = S.students.map((s) => ({ s, d: bal(s.id).due })).filter((x) => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 6);
    const kpi = (label, value, view, cls) => h('button', { class: 'kpi' + (cls ? ' ' + cls : ''), type: 'button', onclick: () => go(view) }, h('b', {}, value), h('span', {}, label));
    return h('div', {},
      head('لوحة المعهد', 'نظرة سريعة على الطلاب والصفوف والمالية'),
      h('div', { class: 'kpis' },
        kpi('طالب منتظم', active.length, 'students'),
        kpi('معلم', S.teachers.filter((t) => t.active).length, 'teachers'),
        kpi('صف', S.classes.length, 'classes'),
        kpi('إجمالي المحصّل', money(paid), 'finance', 'k-green'),
        kpi('المتبقي على الطلاب', money(charged - paid), 'finance', 'k-red')),
      h('div', { class: 'grid grid-2', style: 'gap:18px' },
        h('div', { class: 'card' }, h('h3', {}, 'أعلى المتأخرات'),
          debtors.length ? h('ul', { class: 'plain-list' }, debtors.map(({ s, d }) => h('li', {}, h('button', { class: 'link', type: 'button', onclick: () => statement(s) }, s.name), dueCell(d))))
            : h('p', { class: 'muted' }, 'لا توجد متأخرات 🎉')),
        h('div', { class: 'card' }, h('h3', {}, 'الصفوف'),
          S.classes.length ? h('ul', { class: 'plain-list' }, S.classes.slice(0, 8).map((c) => h('li', {}, h('span', {}, c.name, h('span', { class: 'sub' }, byId('teachers', c.teacherId)?.name || 'بدون معلم')),
            h('span', { class: 'muted' }, studentsIn(c.id).length + (c.capacity ? ' / ' + c.capacity : '') + ' طالب'))))
            : h('p', { class: 'muted' }, 'لم تُضف صفوف بعد.'))),
      h('div', { class: 'quick' }, btn('+ طالب جديد', () => studentForm()), btn('+ تسجيل دفعة', () => paymentForm(), 'btn btn-outline btn-sm'), btn('+ صف جديد', () => classForm(), 'btn btn-outline btn-sm')));
  }

  const filters = {};
  function toolbar(key, opts, onChange) {
    filters[key] ||= {};
    const st = filters[key];
    return h('div', { class: 'toolbar' }, opts.map((o) => {
      if (o.type === 'search') {
        const i = h('input', { type: 'search', placeholder: o.placeholder, 'aria-label': o.placeholder });
        i.value = st[o.name] || '';
        i.addEventListener('input', () => { st[o.name] = i.value; onChange(); });
        return i;
      }
      const sel = h('select', { 'aria-label': o.label }, o.options.map(([v, l]) => h('option', { value: v }, l)));
      sel.value = st[o.name] || '';
      sel.addEventListener('change', () => { st[o.name] = sel.value; onChange(); });
      return sel;
    }));
  }

  function students() {
    const wrap = h('div', {});
    const f = (filters.students ||= { status: 'active' });
    const body = h('div', {});
    const draw = () => {
      const q = (f.q || '').trim().toLowerCase();
      const rows = S.students.filter((s) => (!f.status || s.status === f.status) && (!f.cls || s.classIds.includes(f.cls)) &&
        (!q || [s.name, s.phone, s.guardianName, s.guardianPhone, s.grade].join(' ').toLowerCase().includes(q)));
      body.replaceChildren(table(['الطالب', 'ولي الأمر', 'الصفوف', 'المتبقي', ''], rows.map((s) => h('tr', { class: s.status === 'inactive' ? 'dim' : null },
        h('td', {}, h('b', {}, s.name), s.grade ? h('span', { class: 'sub' }, s.grade) : null, contact(s.phone)),
        h('td', {}, s.guardianName || '—', contact(s.guardianPhone)),
        h('td', {}, s.classIds.length ? h('div', { class: 'chips' }, s.classIds.map((id) => chip(byId('classes', id)?.name || '—'))) : h('span', { class: 'muted' }, '—')),
        h('td', {}, dueCell(bal(s.id).due)),
        h('td', {}, actions(btn('كشف حساب', () => statement(s), 'btn btn-outline btn-sm'), btn('تعديل', () => studentForm(s), 'btn btn-outline btn-sm'),
          btn('حذف', () => remove('students', s.id, `حذف الطالب ${s.name}؟ سيُحذف سجله المالي أيضاً.`), 'btn btn-danger btn-sm'))))),
        S.students.length ? 'لا توجد نتائج مطابقة.' : 'لا يوجد طلاب بعد. ابدأ بإضافة أول طالب.'));
    };
    wrap.append(
      head('الطلاب', `${S.students.filter((s) => s.status === 'active').length} طالب منتظم`, btn('+ إضافة طالب', () => studentForm())),
      toolbar('students', [
        { type: 'search', name: 'q', placeholder: 'بحث بالاسم أو الجوال أو ولي الأمر' },
        { name: 'cls', label: 'الصف', options: [['', 'كل الصفوف'], ...S.classes.map((c) => [c.id, c.name])] },
        { name: 'status', label: 'الحالة', options: [['active', 'المنتظمون'], ['inactive', 'المتوقفون'], ['', 'الكل']] },
      ], draw), body);
    draw();
    return wrap;
  }

  function teachers() {
    return h('div', {},
      head('المعلمون', 'كل معلم يدخل من صفحة المعلمين برقم جواله وكلمة المرور، ويرى صفوفه وطلابه فقط.', btn('+ إضافة معلم', () => teacherForm())),
      table(['المعلم', 'الجوال', 'الصفوف', 'الحساب', ''], S.teachers.map((t) => {
        const cls = S.classes.filter((c) => c.teacherId === t.id);
        return h('tr', { class: t.active ? null : 'dim' },
          h('td', {}, h('b', {}, t.name), t.subject ? h('span', { class: 'sub' }, t.subject) : null),
          h('td', {}, h('a', { href: 'tel:' + t.phone, dir: 'ltr' }, t.phone), t.email ? h('span', { class: 'sub', dir: 'ltr' }, t.email) : null),
          h('td', {}, cls.length ? h('div', { class: 'chips' }, cls.map((c) => chip(c.name))) : h('span', { class: 'muted' }, '—')),
          h('td', {}, h('span', { class: 'status ' + (t.active ? 'status-confirmed' : 'status-cancelled') }, t.active ? 'مفعّل' : 'موقوف')),
          h('td', {}, actions(btn('تعديل', () => teacherForm(t), 'btn btn-outline btn-sm'),
            btn('حذف', () => remove('teachers', t.id, `حذف المعلم ${t.name}؟ ستبقى صفوفه بدون معلم.`), 'btn btn-danger btn-sm'))));
      }), 'لا يوجد معلمون بعد.'));
  }

  function classes() {
    return h('div', {},
      head('الصفوف', 'الصفوف والمجموعات الدراسية ومواعيدها ورسومها', btn('+ إضافة صف', () => classForm())),
      S.classes.length ? h('div', { class: 'class-grid' }, S.classes.map((c) => {
        const n = studentsIn(c.id).length;
        const pct = c.capacity ? Math.min(100, Math.round((n / c.capacity) * 100)) : null;
        return h('div', { class: 'card class-card' },
          h('div', { class: 'cc-top' }, h('h3', {}, c.name), c.fee ? h('span', { class: 'price' }, money(c.fee)) : null),
          h('ul', { class: 'cc-meta' },
            h('li', {}, h('span', {}, 'المعلم'), h('b', {}, byId('teachers', c.teacherId)?.name || '—')),
            c.subject || c.grade ? h('li', {}, h('span', {}, 'المادة / المرحلة'), h('b', {}, [c.subject, c.grade].filter(Boolean).join(' · '))) : null,
            c.schedule ? h('li', {}, h('span', {}, 'المواعيد'), h('b', {}, c.schedule)) : null,
            c.room ? h('li', {}, h('span', {}, 'القاعة'), h('b', {}, c.room)) : null,
            h('li', {}, h('span', {}, 'الطلاب'), h('b', {}, n + (c.capacity ? ' / ' + c.capacity : '')))),
          pct !== null ? h('div', { class: 'meter', title: pct + '%' }, h('span', { style: `width:${pct}%` })) : null,
          h('div', { class: 'row-actions' },
            btn('إصدار رسوم', () => chargeClassForm(c)),
            btn('الطلاب', () => { (filters.students ||= {}).cls = c.id; filters.students.status = 'active'; go('students'); }, 'btn btn-outline btn-sm'),
            btn('تعديل', () => classForm(c), 'btn btn-outline btn-sm'),
            btn('حذف', () => remove('classes', c.id, `حذف الصف ${c.name}؟`), 'btn btn-danger btn-sm')));
      })) : h('div', { class: 'empty' }, 'لا توجد صفوف بعد. أضف أول صف.'));
  }

  function finance() {
    const wrap = h('div', {});
    const f = (filters.finance ||= {});
    let charged = 0, paid = 0;
    for (const s of S.students) { const b = bal(s.id); charged += b.charged; paid += b.paid; }
    const body = h('div', {});
    const draw = () => {
      const q = (f.q || '').trim().toLowerCase();
      const rows = S.students.map((s) => ({ s, b: bal(s.id) }))
        .filter(({ s, b }) => (!q || [s.name, s.guardianName, s.guardianPhone].join(' ').toLowerCase().includes(q)) &&
          (f.show !== 'due' || b.due > 0) && (!f.cls || s.classIds.includes(f.cls)))
        .sort((a, b) => b.b.due - a.b.due);
      body.replaceChildren(table(['الطالب', 'المستحقات', 'المدفوع', 'المتبقي', ''], rows.map(({ s, b }) => h('tr', {},
        h('td', {}, h('b', {}, s.name), s.guardianName ? h('span', { class: 'sub' }, 'ولي الأمر: ' + s.guardianName) : null, contact(s.guardianPhone)),
        h('td', {}, money(b.charged)), h('td', {}, h('span', { class: 'paid' }, money(b.paid))), h('td', {}, dueCell(b.due)),
        h('td', {}, actions(btn('دفعة', () => paymentForm({ studentId: s.id })), btn('كشف حساب', () => statement(s), 'btn btn-outline btn-sm'))))),
        S.students.length ? 'لا توجد نتائج.' : 'أضف طلاباً أولاً.'));
    };
    wrap.append(
      head('المستحقات المالية', 'الرسوم المستحقة على الطلاب والدفعات المحصّلة',
        btn('+ تسجيل دفعة', () => paymentForm()), btn('+ إضافة مستحق', () => feeForm(), 'btn btn-outline btn-sm'),
        h('a', { class: 'btn btn-outline btn-sm', href: '/api/office/finance.csv' }, 'تصدير Excel')),
      h('div', { class: 'kpis kpis-3' },
        h('div', { class: 'kpi' }, h('b', {}, money(charged)), h('span', {}, 'إجمالي المستحقات')),
        h('div', { class: 'kpi k-green' }, h('b', {}, money(paid)), h('span', {}, 'المحصّل')),
        h('div', { class: 'kpi k-red' }, h('b', {}, money(charged - paid)), h('span', {}, 'المتبقي'))),
      toolbar('finance', [
        { type: 'search', name: 'q', placeholder: 'بحث باسم الطالب أو ولي الأمر' },
        { name: 'cls', label: 'الصف', options: [['', 'كل الصفوف'], ...S.classes.map((c) => [c.id, c.name])] },
        { name: 'show', label: 'العرض', options: [['', 'كل الطلاب'], ['due', 'عليهم متأخرات فقط']] },
      ], draw), body);
    draw();
    return wrap;
  }

  function registrations() {
    const wrap = h('div', {});
    const f = (filters.regs ||= {});
    const body = h('div', {});
    const draw = () => {
      const q = (f.q || '').trim().toLowerCase();
      const rows = S.registrations.filter((r) => (!f.status || r.status === f.status) && (!q || [r.name, r.phone, r.email, r.id].join(' ').toLowerCase().includes(q)));
      body.replaceChildren(table(['الطلب', 'المتقدم', 'الدورة', 'ملاحظات', 'الحالة', ''], rows.map((r) => {
        const sel = h('select', { 'aria-label': 'الحالة', onchange: async (e) => {
          try { await api('/api/admin/registrations/' + encodeURIComponent(r.id), { method: 'PATCH', body: { status: e.target.value } }); toast('تم التحديث'); await load(); }
          catch (err) { if (err.status !== 401) toast(errText(err), true); }
        } }, Object.entries(REG_STATUS).map(([k, v]) => h('option', { value: k }, v)));
        sel.value = r.status;
        return h('tr', {},
          h('td', {}, h('b', { dir: 'ltr' }, r.id), h('span', { class: 'sub' }, fmtDate(r.createdAt))),
          h('td', {}, h('b', {}, r.name), contact(r.phone), r.email ? h('span', { class: 'sub', dir: 'ltr' }, r.email) : null, r.studentType ? h('span', { class: 'sub' }, r.studentType) : null),
          h('td', {}, r.courseTitle, h('span', { class: 'sub' }, r.mode)),
          h('td', { style: 'max-width:240px;white-space:pre-wrap' }, r.notes || '—'),
          h('td', {}, sel),
          h('td', {}, actions(
            btn('إضافة كطالب', () => studentForm({ name: r.name, phone: r.phone, notes: `من طلب التسجيل ${r.id} — ${r.courseTitle}`, status: 'active', classIds: [] }), 'btn btn-outline btn-sm'),
            btn('حذف', async () => {
              if (!confirm(`حذف طلب ${r.name}؟`)) return;
              try { await api('/api/admin/registrations/' + encodeURIComponent(r.id), { method: 'DELETE' }); toast('تم الحذف'); await load(); }
              catch (err) { if (err.status !== 401) toast(errText(err), true); }
            }, 'btn btn-danger btn-sm'))));
      }), S.registrations.length ? 'لا توجد نتائج.' : 'لا توجد طلبات تسجيل من الموقع بعد.'));
    };
    wrap.append(
      head('طلبات التسجيل', 'الطلبات القادمة من نموذج التسجيل في الموقع', h('a', { class: 'btn btn-outline btn-sm', href: '/api/admin/export.csv' }, 'تصدير Excel')),
      toolbar('regs', [
        { type: 'search', name: 'q', placeholder: 'بحث بالاسم أو الجوال أو رقم الطلب' },
        { name: 'status', label: 'الحالة', options: [['', 'كل الحالات'], ...Object.entries(REG_STATUS)] },
      ], draw), body);
    draw();
    return wrap;
  }

  function messages() {
    return h('div', {},
      head('الرسائل', 'رسائل نموذج "تواصل معنا"'),
      table(['التاريخ', 'المرسل', 'الموضوع', 'الرسالة', ''], S.messages.map((m) => h('tr', { class: m.read ? null : 'unread' },
        h('td', {}, fmtDate(m.createdAt)),
        h('td', {}, h('b', {}, m.name), h('span', { class: 'sub', dir: 'ltr' }, m.contact)),
        h('td', {}, m.subject || '—'),
        h('td', { style: 'max-width:380px;white-space:pre-wrap' }, m.message),
        h('td', {}, actions(
          m.read ? null : btn('تمّت القراءة', async () => { try { await api('/api/admin/messages/' + encodeURIComponent(m.id), { method: 'PATCH' }); await load(); } catch (e) { if (e.status !== 401) toast(errText(e), true); } }, 'btn btn-outline btn-sm'),
          btn('حذف', async () => {
            if (!confirm('حذف الرسالة؟')) return;
            try { await api('/api/admin/messages/' + encodeURIComponent(m.id), { method: 'DELETE' }); await load(); } catch (e) { if (e.status !== 401) toast(errText(e), true); }
          }, 'btn btn-danger btn-sm'))))), 'لا توجد رسائل.'));
  }

  // ---------- events ----------
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = $('.form-alert', e.target);
    const b = $('button[type=submit]', e.target);
    b.disabled = true;
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
      if (r.ok) { $('#password').value = ''; alertEl.className = 'form-alert hidden'; await load().catch((err) => { alertEl.textContent = errText(err); alertEl.className = 'form-alert alert alert-error'; showLogin(); }); return; }
      alertEl.textContent = r.status === 429 ? 'محاولات كثيرة. انتظر 15 دقيقة.' : 'كلمة المرور غير صحيحة.';
      alertEl.className = 'form-alert alert alert-error';
    } catch {
      alertEl.textContent = 'تعذّر الاتصال بالخادم.';
      alertEl.className = 'form-alert alert alert-error';
    } finally { b.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { await fetch('/api/admin/logout', { method: 'POST' }); showLogin(); });
  $$('.office-nav [data-view]').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));

  fetch('/api/office/me').then((r) => r.json().then((me) => ({ ok: r.ok, me }))).then(({ ok, me }) => {
    if (ok && me.role === 'admin') return load().catch((e) => { if (e.status !== 401) { showLogin(); const a = $('#login-form .form-alert'); a.textContent = errText(e); a.className = 'form-alert alert alert-error'; } });
    showLogin();
  }).catch(showLogin);
})();
