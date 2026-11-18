// Tickmarkin — public site script
(() => {
  'use strict';

  // ---------- utilities ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtPrice = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
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

  const priceHTML = (c, big) => c.price == null ? `<span class="price ask">${big ? 'تواصل معنا للسعر' : 'اسأل عن السعر'}</span>` : `<span class="price">${fmtPrice(c.price)} <small>د.ك</small></span>`;
  const priceText = (c) => c.price == null ? 'تواصل معنا' : `${fmtPrice(c.price)} د.ك`;
  const startText = (c) => c.start ? `يبدأ ${fmtDate(c.start)}` : 'التسجيل مستمر';
  const durText = (c) => c.options ? c.options.join(' / ') : c.weeks % 4 === 0 && c.weeks >= 4 ? `${c.weeks / 4 === 1 ? 'شهر' : c.weeks / 4 + ' شهور'}` : `${c.weeks} أسابيع`;
  const kidImg = (c, cls) => c.kid ? `<img class="${cls}" src="/img/kids/${encodeURIComponent(c.kid)}.svg" alt="" loading="lazy">` : '';
  const badges = (c) => (c.trial ? '<span class="badge trial">🎁 يوم تجربة مجاني</span>' : '') + (c.certificate ? '<span class="badge cert">🏅 شهادة معتمدة</span>' : '');
  const deptName = (cat, id) => cat.departments.find((d) => d.id === id)?.name || '';
  const instructor = (cat, id) => cat.instructors.find((i) => i.id === id);

  function courseCard(cat, c) {
    return `
    <article class="card course-card glow reveal" data-dept="${esc(c.dept)}">
      <div class="course-top">
        ${c.kid ? kidImg(c, 'kid') : `<span class="wm" aria-hidden="true">${ICONS[cat.departments.find((d) => d.id === c.dept)?.icon] || ''}</span>`}
        <span class="chip">${esc(deptName(cat, c.dept))}</span>
        <h3><a href="/course?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a></h3>
        ${badges(c) ? `<div class="badges">${badges(c)}</div>` : ''}
      </div>
      <div class="course-body">
        <p>${esc(c.summary)}</p>
        <div class="meta">
          <span>${ICONS.clock}${esc(c.schedule || (c.options ? 'مدد مرنة' : `${c.hours} ساعة · ${durText(c)}`))}</span>
          <span>${ICONS.level}${esc(c.level)}</span>
          <span>${ICONS.calendar}${esc(c.options ? durText(c) : startText(c))}</span>
          <span>${ICONS.pin}${esc(c.mode)}</span>
        </div>
        <div class="course-foot">
          ${priceHTML(c)}
          <a class="btn btn-primary btn-sm" href="/register?course=${encodeURIComponent(c.id)}">سجّل</a>
        </div>
      </div>
    </article>`;
  }

  function deptCard(d, count) {
    return `
    <a class="card dept-card glow reveal" data-dept="${esc(d.id)}" href="/courses?dept=${encodeURIComponent(d.id)}">
      <span class="dept-icon">${ICONS[d.icon] || ''}</span>
      <h3>${esc(d.name)}</h3>
      <p>${esc(d.desc)}</p>
      <span class="more">${count} دورات <span aria-hidden="true">←</span></span>
    </a>`;
  }

  function personCard(cat, p) {
    const initial = p.name.replace(/^(أ\.|م\.|Mr\.|د\.)\s*/, '').trim().charAt(0);
    return `
    <div class="card person glow reveal" data-dept="${esc(p.dept)}">
      <div class="avatar" aria-hidden="true">${esc(initial)}</div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.title)}</p>
      <span class="chip" style="margin-top:10px">${esc(deptName(cat, p.dept))}</span>
    </div>`;
  }

  const showError = (el) => { if (el) el.innerHTML = '<div class="empty">تعذّر تحميل البيانات. حدّث الصفحة وحاول مرة أخرى.</div>'; };


  // ---------- visual effects ----------
  const FX = (() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;
    const root = document.documentElement;

    // theme toggle
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-toggle')) return;
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('tm-theme', next); } catch {}
    });

    // header state, progress bar, back-to-top
    const header = $('.site-header');
    const bar = $('.progress span');
    const toTop = $('.to-top');
    toTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      const y = window.scrollY;
      header?.classList.toggle('scrolled', y > 24);
      toTop?.classList.toggle('show', y > 700);
      const max = document.documentElement.scrollHeight - innerHeight;
      bar?.style.setProperty('--p', max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();

    // counters
    const fmt = (el, v) => (el.dataset.prefix || '') + Math.round(v).toLocaleString('en-US') + (el.dataset.suffix || '');
    function runCount(el) {
      const to = Number(el.dataset.count);
      if (reduce || !to) { el.textContent = fmt(el, to); return; }
      const start = performance.now();
      const dur = 1600;
      const step = (t) => {
        const k = Math.min(1, (t - start) / dur);
        el.textContent = fmt(el, to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    function setCount(el, n) {
      if (!el) return;
      el.dataset.count = n;
      if (el.dataset.counted) el.textContent = fmt(el, n);
    }

    // reveal on scroll (also for content rendered later)
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('in');
        en.target.querySelectorAll('[data-count]').forEach((c) => { if (!c.dataset.counted) { c.dataset.counted = '1'; runCount(c); } });
        io.unobserve(en.target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
    function scan(rootEl = document) {
      rootEl.querySelectorAll('.reveal:not(.in)').forEach((el) => {
        if (!io) { el.classList.add('in'); return; }
        // stagger siblings rendered together
        if (!el.style.getPropertyValue('--d') && el.parentElement?.classList.contains('grid')) {
          const i = [...el.parentElement.children].indexOf(el);
          el.style.setProperty('--d', Math.min(i, 6) * 0.07 + 's');
        }
        io.observe(el);
      });
    }
    new MutationObserver((muts) => { for (const m of muts) if (m.addedNodes.length) { scan(m.target); } })
      .observe(document.body, { childList: true, subtree: true });

    // rotating word in hero
    const rot = $('.rotator');
    if (rot && !reduce) {
      const words = rot.dataset.words.split('|');
      let i = 0;
      setInterval(() => {
        rot.classList.add('out');
        setTimeout(() => { i = (i + 1) % words.length; rot.textContent = words[i]; rot.classList.remove('out'); }, 350);
      }, 2600);
    }

    // pointer effects (desktop only)
    if (finePointer && !reduce) {
      document.addEventListener('pointermove', (e) => {
        const card = e.target.closest?.('.glow');
        if (card) {
          const r = card.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          card.style.setProperty('--mx', x + 'px');
          card.style.setProperty('--my', y + 'px');
          // 3D tilt toward the pointer
          card.classList.add('tilting');
          card.style.setProperty('--tx', ((y / r.height) - 0.5) * -10 + 'deg');
          card.style.setProperty('--ty', ((x / r.width) - 0.5) * 12 + 'deg');
        }
      }, { passive: true });
      document.addEventListener('pointerout', (e) => {
        const card = e.target.closest?.('.glow');
        if (card && !card.contains(e.relatedTarget)) {
          card.classList.remove('tilting');
          card.style.removeProperty('--tx');
          card.style.removeProperty('--ty');
        }
      });
      const hero = $('.hero');
      const stage = $('.hero-stage');
      const spot = $('.spotlight');
      hero?.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        spot?.style.setProperty('--sx', x * 100 + '%');
        spot?.style.setProperty('--sy', y * 100 + '%');
        stage?.style.setProperty('--ry', (x - 0.5) * 10 + 'deg');
        stage?.style.setProperty('--rx', (0.5 - y) * 8 + 'deg');
      });
      hero?.addEventListener('pointerleave', () => { stage?.style.setProperty('--ry', '0deg'); stage?.style.setProperty('--rx', '0deg'); });
    }

    return { scan, setCount };
  })();

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
      const stages = ['primary', 'middle-bag', 'secondary-all'].map((id) => cat.courses.find((c) => c.id === id)).filter(Boolean);
      $('#stage-cards').innerHTML = stages.map((c, i) => `
        <a class="stage-card reveal" data-stage="${i}" href="/course?id=${encodeURIComponent(c.id)}">
          <div class="stage-art">${kidImg(c, 'stage-kid')}${c.trial ? '<span class="stage-ribbon">🎁 يوم تجربة مجاني</span>' : ''}</div>
          <div class="stage-body">
            <h3>${esc(c.title.split(' — ')[0])}</h3>
            ${c.title.includes(' — ') ? `<p class="stage-sub">${esc(c.title.split(' — ')[1])}</p>` : ''}
            <ul>${c.outcomes.slice(0, 4).map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
            <div class="stage-foot">${c.price == null ? '<span class="stage-price ask">اسأل عن السعر</span>' : `<span class="stage-price"><b>${fmtPrice(c.price)}</b> د.ك <small>/ شهرياً</small></span>`}<span class="stage-go">التفاصيل ←</span></div>
          </div>
        </a>`).join('');
      const featuredIds = ['secondary-all', 'middle-bag', 'primary', 'english-cambridge', 'general-management', 'ielts'];
      $('#home-courses').innerHTML = featuredIds.map((id) => cat.courses.find((c) => c.id === id)).filter(Boolean).map((c) => courseCard(cat, c)).join('');
      $('#home-people').innerHTML = cat.instructors.slice(0, 4).map((p) => personCard(cat, p)).join('');
      const upcoming = cat.courses.filter((c) => c.start).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
      $('#hero-upcoming').innerHTML = upcoming.map((c) => `
        <li><a href="/course?id=${encodeURIComponent(c.id)}"><span><b>${esc(c.title)}</b><small>${esc(deptName(cat, c.dept))} · يبدأ ${esc(fmtDate(c.start))}</small></span><span aria-hidden="true">←</span></a></li>`).join('');
      FX.setCount($('#stat-courses'), cat.courses.length);
      FX.setCount($('#stat-trainers'), cat.instructors.length);
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
            <p class="muted">يُقدَّم البرنامج لمدة ${esc(durText(c))}${c.schedule ? ` (${esc(c.schedule)})` : ''}، بأسلوب تطبيقي يجمع بين الشرح والتمارين العملية والمشاريع. يحصل المتدرب عند إتمام 80% من الحضور واجتياز التقييم على شهادة إتمام موثّقة من المعهد.</p>
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
          ${c.kid ? kidImg(c, 'kid-aside') : ''}
          <p style="font-size:2rem;margin:12px 0">${priceHTML(c, true)}</p>
          ${badges(c) ? `<div class="badges" style="margin-bottom:14px">${badges(c)}</div>` : ''}
          <ul class="info-list">
            <li><span>تاريخ البدء</span><span>${esc(c.start ? fmtDate(c.start) : 'التسجيل مستمر')}</span></li>
            ${c.schedule ? `<li><span>الدوام</span><span>${esc(c.schedule)}</span></li>` : ''}
            ${c.certificate ? `<li><span>الشهادة</span><span>${esc(c.certificate)}</span></li>` : ''}
            <li><span>المدة</span><span>${esc(durText(c))}</span></li>
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
            <li><span>تاريخ البدء</span><span>${esc(c.start ? fmtDate(c.start) : 'التسجيل مستمر')}</span></li>
            <li><span>المدة</span><span>${esc(c.schedule ? durText(c) + ' · ' + c.schedule : durText(c))}</span></li>
            <li><span>المستوى</span><span>${esc(c.level)}</span></li>
            <li><span>طريقة الحضور</span><span>${esc(c.mode)}</span></li>
            <li><span>الرسوم</span><span>${esc(priceText(c))}</span></li>
            ${c.trial ? '<li><span>تجربة</span><span>🎁 يوم تجربة مجاني</span></li>' : ''}
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
      if (params.get('trial') === '1') { const t = form.querySelector('input[name=requestType][value="حصة تجريبية"]'); if (t) t.checked = true; }
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
            <h2>${data.requestType === 'حصة تجريبية' ? 'تم حجز حصتك التجريبية المجانية 🎁' : 'تم استلام طلب تسجيلك بنجاح'}</h2>
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
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  initHeader();
  document.querySelectorAll('.page-hero').forEach((h) => {
    const f = document.createElement('div');
    f.className = 'hero-floats';
    f.setAttribute('aria-hidden', 'true');
    for (const ch of ['أ', '✓', 'π', 'A']) { const s = document.createElement('span'); s.textContent = ch; f.append(s); }
    h.prepend(f);
  });
  FX.scan();
  const pages = { home: pageHome, courses: pageCourses, course: pageCourse, departments: pageDepartments, about: pageAbout, register: pageRegister, contact: pageContact };
  pages[document.body.dataset.page]?.();
})();
