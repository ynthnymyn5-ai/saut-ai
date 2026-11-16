// Tickmarkin — public site script
(() => {
  'use strict';

  // ---------- utilities ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtPrice = (n) => Number(n).toLocaleString('ar-SA');
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('ar-SA-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
  const params = new URLSearchParams(location.search);

  const ICONS = {
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
    code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    level: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20v-4M10 20v-9M16 20V8M22 20V4"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  };

  let catalogPromise;
  const getCatalog = () => (catalogPromise ||= fetch('/api/catalog').then((r) => {
    if (!r.ok) throw new Error('catalog');
    return r.json();
  }));

  const deptName = (cat, id) => cat.departments.find((d) => d.id === id)?.name || '';
  const instructor = (cat, id) => cat.instructors.find((i) => i.id === id);

  function courseCard(cat, c) {
    return `
    <article class="card course-card" data-dept="${esc(c.dept)}">
      <div class="course-top">
        <span class="chip">${esc(deptName(cat, c.dept))}</span>
        <h3><a href="/course?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a></h3>
      </div>
      <div class="course-body">
        <p>${esc(c.summary)}</p>
        <div class="meta">
          <span>${ICONS.clock}${esc(c.hours)} ساعة · ${esc(c.weeks)} أسابيع</span>
          <span>${ICONS.level}${esc(c.level)}</span>
          <span>${ICONS.calendar}يبدأ ${esc(fmtDate(c.start))}</span>
          <span>${ICONS.pin}${esc(c.mode)}</span>
        </div>
        <div class="course-foot">
          <span class="price">${fmtPrice(c.price)} <small>ر.س</small></span>
          <a class="btn btn-primary btn-sm" href="/register?course=${encodeURIComponent(c.id)}">سجّل</a>
        </div>
      </div>
    </article>`;
  }

  function deptCard(d, count) {
    return `
    <a class="card dept-card" data-dept="${esc(d.id)}" href="/courses?dept=${encodeURIComponent(d.id)}">
      <span class="dept-icon">${ICONS[d.icon] || ''}</span>
      <h3>${esc(d.name)}</h3>
      <p>${esc(d.desc)}</p>
      <span class="more">${count} دورات ←</span>
    </a>`;
  }

  function personCard(cat, p) {
    const initial = p.name.replace(/^(أ\.|م\.|Mr\.|د\.)\s*/, '').trim().charAt(0);
    return `
    <div class="card person" data-dept="${esc(p.dept)}">
      <div class="avatar" aria-hidden="true">${esc(initial)}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.title)}</p>
      <span class="chip" style="margin-top:10px">${esc(deptName(cat, p.dept))}</span>
    </div>`;
  }

  const showError = (el) => { if (el) el.innerHTML = '<div class="empty">تعذّر تحميل البيانات. حدّث الصفحة وحاول مرة أخرى.</div>'; };

  // ---------- header ----------
  function initHeader() {
    const toggle = $('.nav-toggle');
    const nav = $('#site-nav');
    toggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    const here = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
    const map = { '/course': '/courses' };
    $$('[data-nav]').forEach((a) => { if (a.dataset.nav === (map[here] || here)) a.classList.add('active'); });
  }

  // ---------- pages ----------
  async function pageHome() {
    try {
      const cat = await getCatalog();
      const deptEl = $('#home-depts');
      deptEl.innerHTML = cat.departments.map((d) => deptCard(d, cat.courses.filter((c) => c.dept === d.id).length)).join('');
      const featuredIds = ['web-dev', 'ielts', 'hr-pro', 'qudrat', 'data', 'eng-general'];
      $('#home-courses').innerHTML = featuredIds.map((id) => cat.courses.find((c) => c.id === id)).filter(Boolean).map((c) => courseCard(cat, c)).join('');
      $('#home-people').innerHTML = cat.instructors.slice(0, 4).map((p) => personCard(cat, p)).join('');
      const upcoming = [...cat.courses].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
      $('#hero-upcoming').innerHTML = upcoming.map((c) => `
        <li><a href="/course?id=${encodeURIComponent(c.id)}"><span><b>${esc(c.title)}</b><small>${esc(deptName(cat, c.dept))} · يبدأ ${esc(fmtDate(c.start))}</small></span><span aria-hidden="true">←</span></a></li>`).join('');
      $('#stat-courses').textContent = cat.courses.length + '+';
      $('#stat-trainers').textContent = cat.instructors.length + '+';
    } catch { showError($('#home-courses')); }
  }

  async function pageCourses() {
    const list = $('#course-list');
    try {
      const cat = await getCatalog();
      const state = { dept: params.get('dept') || 'all', q: params.get('q') || '' };
      const pills = $('#dept-pills');
      pills.innerHTML = [{ id: 'all', name: 'الكل' }, ...cat.departments]
        .map((d) => `<button type="button" class="pill" data-id="${esc(d.id)}">${esc(d.name)}</button>`).join('');
      const search = $('#course-search');
      search.value = state.q;

      const render = () => {
        $$('.pill', pills).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === state.dept)));
        const q = state.q.trim().toLowerCase();
        const items = cat.courses.filter((c) =>
          (state.dept === 'all' || c.dept === state.dept) &&
          (!q || (c.title + ' ' + c.summary + ' ' + c.level).toLowerCase().includes(q)));
        $('#course-count').textContent = `${items.length} دورة`;
        list.innerHTML = items.length ? items.map((c) => courseCard(cat, c)).join('') : '<div class="empty" style="grid-column:1/-1">لا توجد دورات مطابقة لبحثك.</div>';
        const u = new URL(location.href);
        state.dept === 'all' ? u.searchParams.delete('dept') : u.searchParams.set('dept', state.dept);
        state.q ? u.searchParams.set('q', state.q) : u.searchParams.delete('q');
        history.replaceState(null, '', u);
      };
      pills.addEventListener('click', (e) => {
        const b = e.target.closest('.pill');
        if (b) { state.dept = b.dataset.id; render(); }
      });
      search.addEventListener('input', () => { state.q = search.value; render(); });
      render();
    } catch { showError(list); }
  }

  async function pageCourse() {
    const root = $('#course-detail');
    try {
      const cat = await getCatalog();
      const c = cat.courses.find((x) => x.id === params.get('id'));
      if (!c) {
        root.innerHTML = '<div class="empty">لم يتم العثور على الدورة. <a href="/courses">تصفّح جميع الدورات</a></div>';
        return;
      }
      document.title = `${c.title} | معهد تيك ماركن`;
      const t = instructor(cat, c.instructor);
      $('#course-title').textContent = c.title;
      $('#course-summary').textContent = c.summary;
      $('#course-crumb').textContent = c.title;
      root.dataset.dept = c.dept;
      const related = cat.courses.filter((x) => x.dept === c.dept && x.id !== c.id).slice(0, 3);
      root.innerHTML = `
      <div class="layout-side">
        <div>
          <div class="card">
            <h2 style="font-size:1.4rem">ماذا ستتعلم؟</h2>
            <ul class="check-list">${c.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
          </div>
          <div class="card" style="margin-top:20px">
            <h2 style="font-size:1.4rem">تفاصيل البرنامج</h2>
            <p class="muted">يُقدَّم البرنامج على مدى ${esc(c.weeks)} أسابيع بإجمالي ${esc(c.hours)} ساعة تدريبية، بأسلوب تطبيقي يجمع بين الشرح والتمارين العملية والمشاريع. يحصل المتدرب عند إتمام 80% من الحضور واجتياز التقييم على شهادة إتمام موثّقة من المعهد.</p>
            <ul class="check-list">
              <li>مواد تدريبية ومراجع رقمية طوال فترة الدورة</li>
              <li>مجموعات صغيرة لضمان متابعة كل متدرب</li>
              <li>تسجيل المحاضرات للحضور عن بُعد</li>
              <li>شهادة إتمام قابلة للتحقق</li>
            </ul>
          </div>
          ${t ? `<div class="card" style="margin-top:20px;display:flex;gap:16px;align-items:center">
            <div class="avatar" style="margin:0;width:64px;height:64px;font-size:1.4rem" aria-hidden="true">${esc(t.name.replace(/^(أ\.|م\.|Mr\.)\s*/, '').charAt(0))}</div>
            <div><span class="muted" style="font-size:.9rem">المدرب</span><h3 style="margin:0">${esc(t.name)}</h3><p class="muted" style="margin:0">${esc(t.title)}</p></div>
          </div>` : ''}
        </div>
        <aside class="card side-card">
          <span class="chip">${esc(deptName(cat, c.dept))}</span>
          <p class="price" style="font-size:2rem;margin:12px 0">${fmtPrice(c.price)} <small>ر.س</small></p>
          <ul class="info-list">
            <li><span>تاريخ البدء</span><span>${esc(fmtDate(c.start))}</span></li>
            <li><span>المدة</span><span>${esc(c.weeks)} أسابيع</span></li>
            <li><span>عدد الساعات</span><span>${esc(c.hours)} ساعة</span></li>
            <li><span>المستوى</span><span>${esc(c.level)}</span></li>
            <li><span>طريقة الحضور</span><span>${esc(c.mode)}</span></li>
            <li><span>المقاعد</span><span>${esc(c.seats)} مقعداً</span></li>
          </ul>
          <a class="btn btn-primary" style="width:100%;margin-top:18px" href="/register?course=${encodeURIComponent(c.id)}">سجّل في هذه الدورة</a>
          <a class="btn btn-outline" style="width:100%;margin-top:10px" href="https://wa.me/966500000000?text=${encodeURIComponent('استفسار عن دورة: ' + c.title)}" target="_blank" rel="noopener">استفسر عبر واتساب</a>
        </aside>
      </div>
      ${related.length ? `<h2 style="margin-top:48px">دورات ذات صلة</h2><div class="grid grid-3">${related.map((r) => courseCard(cat, r)).join('')}</div>` : ''}`;
    } catch { showError(root); }
  }

  async function pageDepartments() {
    const root = $('#dept-sections');
    try {
      const cat = await getCatalog();
      root.innerHTML = cat.departments.map((d, i) => {
        const cs = cat.courses.filter((c) => c.dept === d.id);
        return `
        <section class="block ${i % 2 ? 'alt' : ''}" id="${esc(d.id)}" data-dept="${esc(d.id)}">
          <div class="container">
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px">
              <span class="dept-icon">${ICONS[d.icon] || ''}</span>
              <h2 style="margin:0">${esc(d.name)}</h2>
            </div>
            <p class="muted" style="max-width:720px">${esc(d.desc)}</p>
            <div class="grid grid-3" style="margin-top:24px">${cs.map((c) => courseCard(cat, c)).join('')}</div>
          </div>
        </section>`;
      }).join('');
      if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    } catch { showError(root); }
  }

  async function pageAbout() {
    try {
      const cat = await getCatalog();
      $('#about-people').innerHTML = cat.instructors.map((p) => personCard(cat, p)).join('');
    } catch { showError($('#about-people')); }
  }

  // ---------- forms ----------
  function setFieldErrors(form, fields = {}) {
    $$('.field', form).forEach((f) => {
      const name = f.dataset.field;
      const msg = fields[name] || '';
      f.classList.toggle('invalid', !!msg);
      const err = $('.err', f);
      if (err) err.textContent = msg;
    });
    const first = Object.keys(fields)[0];
    if (first) form.querySelector(`[name="${first}"]`)?.focus();
  }

  async function submitJson(form, url, data, onOk) {
    const btn = $('button[type=submit]', form);
    const alertEl = $('.form-alert', form);
    alertEl.className = 'form-alert hidden';
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'جارٍ الإرسال…';
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const body = await r.json().catch(() => ({}));
      if (r.ok) { setFieldErrors(form, {}); onOk(body); return; }
      if (r.status === 422) {
        setFieldErrors(form, body.fields);
        alertEl.textContent = 'يرجى تصحيح الحقول المحددة.';
      } else if (r.status === 429) {
        alertEl.textContent = 'محاولات كثيرة. انتظر بضع دقائق ثم حاول مجدداً.';
      } else {
        alertEl.textContent = 'حدث خطأ غير متوقع. حاول مرة أخرى أو تواصل معنا عبر واتساب.';
      }
      alertEl.className = 'form-alert alert alert-error';
    } catch {
      alertEl.textContent = 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.';
      alertEl.className = 'form-alert alert alert-error';
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function pageRegister() {
    const form = $('#register-form');
    const select = $('#courseId');
    const summary = $('#selected-course');
    try {
      const cat = await getCatalog();
      select.innerHTML = '<option value="">— اختر الدورة —</option>' + cat.departments.map((d) =>
        `<optgroup label="${esc(d.name)}">${cat.courses.filter((c) => c.dept === d.id).map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</optgroup>`).join('');
      const showSummary = () => {
        const c = cat.courses.find((x) => x.id === select.value);
        if (!c) { summary.innerHTML = '<p class="muted" style="margin:0">اختر دورة لعرض تفاصيلها هنا.</p>'; return; }
        summary.dataset.dept = c.dept;
        summary.innerHTML = `
          <span class="chip">${esc(deptName(cat, c.dept))}</span>
          <h3 style="margin:10px 0 6px">${esc(c.title)}</h3>
          <ul class="info-list">
            <li><span>تاريخ البدء</span><span>${esc(fmtDate(c.start))}</span></li>
            <li><span>المدة</span><span>${esc(c.weeks)} أسابيع · ${esc(c.hours)} ساعة</span></li>
            <li><span>المستوى</span><span>${esc(c.level)}</span></li>
            <li><span>طريقة الحضور</span><span>${esc(c.mode)}</span></li>
            <li><span>الرسوم</span><span>${fmtPrice(c.price)} ر.س</span></li>
          </ul>`;
        const remoteOk = c.mode.includes('عن بُعد');
        const inPersonOk = c.mode.includes('حضوري');
        $$('input[name=mode]', form).forEach((r) => {
          const ok = r.value === 'عن بُعد' ? remoteOk : inPersonOk;
          r.disabled = !ok;
          r.closest('label').style.opacity = ok ? '' : '.45';
          if (!ok && r.checked) r.checked = false;
        });
        if (!$('input[name=mode]:checked', form)) $('input[name=mode]:not(:disabled)', form).checked = true;
      };
      select.value = params.get('course') || '';
      select.addEventListener('change', showSummary);
      showSummary();
    } catch { showError(summary); }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      data.agree = fd.get('agree') === 'on';
      submitJson(form, '/api/register', data, (res) => {
        $('#register-wrap').innerHTML = `
          <div class="form-card success-box">
            <div class="ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg></div>
            <h2>تم استلام طلب تسجيلك بنجاح</h2>
            <p class="muted">سجّلنا طلبك في <b>${esc(res.course)}</b>. سيتواصل معك فريق القبول خلال يوم عمل واحد لتأكيد المقعد وإرسال تفاصيل الدفع.</p>
            <p>رقم الطلب: <span class="ref">${esc(res.id)}</span></p>
            <div class="hero-actions" style="justify-content:center"><a class="btn btn-primary" href="/courses">تصفح دورات أخرى</a><a class="btn btn-outline" href="/">العودة للرئيسية</a></div>
          </div>`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function pageContact() {
    const form = $('#contact-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      submitJson(form, '/api/contact', data, () => {
        form.reset();
        const a = $('.form-alert', form);
        a.textContent = 'شكراً لتواصلك! وصلتنا رسالتك وسنرد عليك قريباً.';
        a.className = 'form-alert alert alert-success';
      });
    });
  }

  // ---------- boot ----------
  initHeader();
  const pages = { home: pageHome, courses: pageCourses, course: pageCourse, departments: pageDepartments, about: pageAbout, register: pageRegister, contact: pageContact };
  pages[document.body.dataset.page]?.();
})();
