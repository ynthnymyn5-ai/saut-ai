// Tickmarkin — printable payment receipt and account statement (admin only).
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v; else el.setAttribute(k, v);
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false && c !== '') el.append(c instanceof Node ? c : String(c));
    return el;
  }
  // static brand mark (constant markup, no user data)
  const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="pg" x1="6" y1="4" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4466ff"/><stop offset=".55" stop-color="#5a3df0"/><stop offset="1" stop-color="#7c2fe0"/></linearGradient><linearGradient id="pd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd25e"/><stop offset="1" stop-color="#ff8a2a"/></linearGradient></defs><rect x="1" y="1" width="46" height="46" rx="14" fill="url(#pg)"/><path d="M9 32.6c4.8-2.7 9.8-2.7 15 .7 5.2-3.4 10.2-3.4 15-.7v4.2c-4.8-2.5-9.8-2.5-15 .9-5.2-3.4-10.2-3.4-15-.9z" fill="#fff" opacity=".62"/><path d="M14.8 20.6l6.1 6.2 12.9-14" fill="none" stroke="#fff" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="37.4" cy="9.6" r="3" fill="url(#pd)"/></svg>';
  const logo = () => { const s = h('span'); s.innerHTML = LOGO; return s.firstChild; };

  const params = new URLSearchParams(location.search);
  const type = params.get('type');
  const id = params.get('id') || '';
  let CUR = 'د.ك';
  const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' ' + CUR;
  const fmtDate = (iso) => iso ? new Date((iso.length === 10 ? iso + 'T00:00:00' : iso)).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  function header(inst, titleAr, titleEn, metaRows) {
    return [
      h('div', { class: 'doc-head' },
        h('div', { class: 'brand' }, logo(), h('div', {}, h('strong', {}, inst.name), h('small', {}, inst.nameEn))),
        h('div', { class: 'contact' }, inst.phone ? h('span', { dir: 'ltr' }, inst.phone) : null, inst.email ? h('span', { dir: 'ltr' }, inst.email) : null, inst.address ? h('span', {}, inst.address) : null)),
      h('div', { class: 'doc-title' },
        h('h1', {}, titleAr, h('small', {}, titleEn)),
        h('div', { class: 'meta' }, metaRows.map(([k, v]) => [h('span', {}, k), h('b', {}, v)]))),
    ];
  }
  const studentBox = (s) => h('div', { class: 'box grid2' },
    h('div', { class: 'kv' }, h('span', {}, 'الطالب'), h('b', {}, s.name)),
    h('div', { class: 'kv' }, h('span', {}, 'المرحلة'), h('b', {}, s.grade || '—')),
    h('div', { class: 'kv' }, h('span', {}, 'ولي الأمر'), h('b', {}, s.guardianName || '—')),
    h('div', { class: 'kv' }, h('span', {}, 'جوال ولي الأمر'), h('b', { dir: 'ltr' }, s.guardianPhone || s.phone || '—')),
    s.classes.length ? h('div', { class: 'kv', style: 'grid-column:1/-1' }, h('span', {}, 'الصفوف'), h('b', {}, s.classes.join('، '))) : null);
  const footer = (inst, extra) => h('div', { class: 'foot' }, h('span', {}, inst.receiptFooter || ''), h('span', {}, extra));
  const watermark = () => h('div', { class: 'watermark', 'aria-hidden': 'true' }, logo());

  function receipt(d) {
    const p = d.payment, t = d.totals;
    document.title = `إيصال ${p.id} | ${d.student.name}`;
    return [
      watermark(),
      ...header(d.institute, 'إيصال استلام', 'PAYMENT RECEIPT', [['رقم الإيصال', p.id], ['التاريخ', fmtDate(p.paidAt)]]),
      h('div', { class: 'box' }, h('div', { class: 'kv' }, h('span', {}, 'استلمنا من'), h('b', {}, (d.student.guardianName ? d.student.guardianName + ' — ولي أمر الطالب/ة ' : 'الطالب/ة ') + d.student.name))),
      h('div', { class: 'amount' },
        h('div', { class: 'num' }, h('span', {}, 'المبلغ'), h('b', {}, money(p.amount))),
        h('div', { class: 'words' }, h('span', {}, 'المبلغ كتابةً'), h('b', {}, window.kwdInWords(p.amount)))),
      h('div', { class: 'box grid2' },
        h('div', { class: 'kv' }, h('span', {}, 'طريقة الدفع'), h('b', {}, p.method)),
        h('div', { class: 'kv' }, h('span', {}, 'ملاحظة / رقم مرجعي'), h('b', {}, p.note || '—')),
        h('div', { class: 'kv' }, h('span', {}, 'وذلك عن'), h('b', {}, 'رسوم دراسية' + (d.student.classes.length ? ' — ' + d.student.classes.join('، ') : ''))),
        h('div', { class: 'kv' }, h('span', {}, 'المرحلة'), h('b', {}, d.student.grade || '—'))),
      h('div', { class: 'summary' },
        h('div', {}, h('span', {}, 'إجمالي المستحقات'), h('b', {}, money(t.charged))),
        h('div', {}, h('span', {}, 'إجمالي المدفوع حتى هذا الإيصال'), h('b', { class: 'ok' }, money(t.paidToDate))),
        h('div', {}, h('span', {}, 'المتبقي بعد هذه الدفعة'), h('b', { class: t.balanceAfter > 0 ? 'due' : 'ok' }, t.balanceAfter > 0 ? money(t.balanceAfter) : 'مسدّد بالكامل'))),
      h('div', { class: 'signs' }, h('div', {}, 'توقيع المستلم'), h('div', { class: 'stamp' }, 'الختم'), h('div', {}, 'توقيع المحاسب')),
      footer(d.institute, 'نسخة العميل'),
    ];
  }

  function statement(d) {
    const t = d.totals;
    document.title = `كشف حساب | ${d.student.name}`;
    const rows = d.entries.map((e) => h('tr', { class: e.kind === 'payment' ? 'pay' : null },
      h('td', {}, fmtDate(e.date)),
      h('td', {}, e.description, e.kind === 'fee' && e.className && !e.description.includes(e.className) ? h('span', { class: 'sub' }, e.className) : null, e.kind === 'fee' && e.dueDate ? h('span', { class: 'sub' }, 'يستحق في ' + fmtDate(e.dueDate)) : null),
      h('td', { class: 'n' }, e.kind === 'fee' ? money(e.amount) : ''),
      h('td', { class: 'n' }, e.kind === 'payment' ? money(e.amount) : ''),
      h('td', { class: 'n' }, e.balance < 0 ? h('span', { class: 'ok' }, money(-e.balance) + ' دائن') : money(e.balance))));
    return [
      watermark(),
      ...header(d.institute, 'كشف حساب', 'ACCOUNT STATEMENT', [['رقم الطالب', d.student.id], ['تاريخ الإصدار', fmtDate(d.generatedAt)]]),
      studentBox(d.student),
      h('div', { class: 'summary' },
        h('div', {}, h('span', {}, 'إجمالي المستحقات'), h('b', {}, money(t.charged))),
        h('div', {}, h('span', {}, 'إجمالي المدفوع'), h('b', { class: 'ok' }, money(t.paid))),
        h('div', {}, h('span', {}, t.balance >= 0 ? 'الرصيد المستحق' : 'رصيد دائن للطالب'), h('b', { class: t.balance > 0 ? 'due' : 'ok' }, t.balance === 0 ? 'مسدّد بالكامل' : money(Math.abs(t.balance))))),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'التاريخ'), h('th', {}, 'البيان'), h('th', { class: 'n' }, 'مدين (مستحق)'), h('th', { class: 'n' }, 'دائن (مدفوع)'), h('th', { class: 'n' }, 'الرصيد'))),
        h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: 5, style: 'text-align:center;color:#5d6685;padding:24px' }, 'لا توجد حركات مالية'))),
        h('tfoot', {}, h('tr', {}, h('td', { colspan: 2 }, 'الإجمالي'), h('td', { class: 'n' }, money(t.charged)), h('td', { class: 'n' }, money(t.paid)), h('td', { class: 'n' }, t.balance < 0 ? money(-t.balance) + ' دائن' : money(t.balance))))),
      t.balance > 0 ? h('p', { style: 'margin-top:12px' }, 'المبلغ المتبقي كتابةً: ', h('b', {}, window.kwdInWords(t.balance))) : null,
      h('div', { class: 'signs' }, h('div', {}, 'المحاسب'), h('div', { class: 'stamp' }, 'الختم'), h('div', {}, 'ولي الأمر')),
      footer(d.institute, 'صفحة 1'),
    ];
  }

  async function load() {
    const doc = $('#doc');
    if (!['receipt', 'statement'].includes(type) || !id) { doc.replaceChildren(h('p', { class: 'error' }, 'رابط غير صحيح.')); return; }
    const r = await fetch(`/api/office/print?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
    if (r.status === 401) { doc.replaceChildren(h('p', { class: 'error' }, 'يجب تسجيل الدخول للوحة الإدارة أولاً. ', h('a', { href: '/admin' }, 'دخول الإدارة'))); return; }
    if (!r.ok) { doc.replaceChildren(h('p', { class: 'error' }, r.status === 404 ? 'المستند غير موجود (ربما حُذفت الدفعة أو الطالب).' : 'تعذّر تحميل المستند.')); return; }
    const d = await r.json();
    CUR = d.institute.currency || CUR;
    doc.replaceChildren(...(type === 'receipt' ? receipt(d) : statement(d)));
    if (params.get('print') === '1') setTimeout(() => window.print(), 400);
  }

  $('#btn-print').addEventListener('click', () => window.print());
  $('#btn-close').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));
  load().catch(() => $('#doc').replaceChildren(h('p', { class: 'error' }, 'تعذّر الاتصال بالخادم.')));
})();
