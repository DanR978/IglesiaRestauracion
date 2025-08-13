// /js/components/rail.js
(() => {
  'use strict';

  // =========================
  // Utilities
  // =========================
  function $(sel, root = document)  { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function parseISO(s) {
    return new Date(s + (s && s.length === 10 ? 'T00:00:00' : ''));
  }
  function startOfToday() { return new Date(new Date().toDateString()); }
  function isPast(d)      { return d < startOfToday(); }
  function fmtDate(iso)   { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parseISO(iso)); }
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  const ADMIN_KEY = 'ird:isAdmin';
  function isAdmin() {
    return document.body.classList.contains('is-admin') || localStorage.getItem(ADMIN_KEY) === '1';
  }

  // Root the rail was initialized against (needed for partial mounts)
  let ROOT = document;

  // =========================
  // In-memory data store
  // =========================
  function getEvents() {
    return Array.isArray(window.RAIL_EVENTS) ? window.RAIL_EVENTS : [];
  }
  function setEvents(events) {
    window.RAIL_EVENTS = events;
  }
  function ensureIds(events) {
    for (const ev of events) {
      if (!ev.id) ev.id = (crypto?.randomUUID?.() ?? ('e_' + Math.random().toString(36).slice(2)));
    }
    return events;
  }

  // =========================
  // Smooth programmatic scroll (arrows + snap)
  // =========================
  function animateScrollLeft(el, to, { duration = 520, easing = easeOutCubic } = {}) {
    if (el._anim) cancelAnimationFrame(el._anim.rid);
    const start  = el.scrollLeft;
    const change = to - start;
    const t0     = performance.now();
    let active   = true;

    function step(now) {
      if (!active) return;
      const t = Math.min(1, (now - t0) / duration);
      el.scrollLeft = start + change * easing(t);
      updateScales(el); el._updateEnds?.();
      if (t < 1) el._anim.rid = requestAnimationFrame(step);
    }
    el._anim = { rid: requestAnimationFrame(step), cancel: () => { active = false; } };
  }

  // =========================
  // Center helpers
  // =========================
  function nearestIndex(track) {
    const cards = $$('.c-rail__card', track);
    if (!cards.length) return 0;
    const centers = cards.map(c => c.offsetLeft + c.offsetWidth / 2);
    const viewCenter = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    centers.forEach((cx, i) => {
      const d = Math.abs(cx - viewCenter);
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }
  function centerIndex(track, idx) {
    const cards = $$('.c-rail__card', track);
    if (!cards.length) return 0;
    idx = Math.max(0, Math.min(cards.length - 1, idx));
    const cx = cards[idx].offsetLeft + cards[idx].offsetWidth / 2;
    const max = Math.max(0, track.scrollWidth - track.clientWidth);
    return Math.max(0, Math.min(max, cx - track.clientWidth / 2));
  }
  function queueSnap(track) {
    clearTimeout(track._snapT);
    track._snapT = setTimeout(() => snapToNearest(track), 110);
  }
  function snapToNearest(track) {
    const idx = nearestIndex(track);
    const target = centerIndex(track, idx);
    animateScrollLeft(track, target, { duration: 520 });
  }

  // =========================
  // Render
  // =========================
  function renderCard(ev) {
    const img = ev.image ? `<div class="c-rail__media"><img src="${ev.image}" alt=""></div>` : '';
    const tag = ev.tag   ? `<span class="c-rail__tag">${ev.tag}</span>` : '';
    const adminRemove = isAdmin()
      ? `<button class="c-rail__remove" type="button" aria-label="Eliminar" title="Eliminar" data-id="${ev.id}">−</button>`
      : '';
    const cta = ev.cta ? `<a class="c-rail__cta" href="${ev.cta.url}">${ev.cta.label}</a>` : '';

    return `
      <article class="c-rail__card" role="listitem" aria-label="${ev.title}" data-id="${ev.id}">
        ${adminRemove}
        ${img}
        <div class="c-rail__body">
          ${tag}
          <h3 class="c-rail__title-sm">${ev.title}</h3>
          <p class="c-rail__meta">
            <span>${fmtDate(ev.date)}</span><br>
            ${ev.time ? ` <span>${ev.time}</span><br>` : '' }
            ${ev.location ? ` <span>${ev.location}</span>` : '' }
          </p>
          ${cta}
        </div>
      </article>`;
  }
  function emptyState(kind) {
    const msg = kind === 'upcoming' ? 'Sin eventos programados' : 'No hay eventos pasados';
    return `
      <article class="c-rail__card c-rail__card--empty" role="status" aria-live="polite">
        <div class="c-rail__body" style="align-items:center">
          <h3 class="c-rail__title-sm">${msg}</h3>
          <p class="c-rail__meta">Vuelve pronto.</p>
        </div>
      </article>`;
  }

  // =========================
  // Focus scaling + fades
  // =========================
  function updateScales(track) {
    const cards = $$('.c-rail__card', track);
    if (!cards.length) return;
    const rect = track.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    let bestIdx = 0, bestScore = -Infinity;

    for (let i = 0; i < cards.length; i++) {
      const c  = cards[i];
      const cr = c.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const dist = Math.abs(cx - centerX);
      const norm = Math.max(0, 1 - dist / (rect.width * 0.45));
      const styles = getComputedStyle(document.documentElement);
      const sMin = parseFloat(styles.getPropertyValue('--scale-min')) || .92;
      const sMax = parseFloat(styles.getPropertyValue('--scale-max')) || 1.18;
      const scale = sMin + (sMax - sMin) * norm;
      c.style.setProperty('--s', scale.toFixed(4));
      if (norm > bestScore) { bestScore = norm; bestIdx = i; }
    }
    cards.forEach((c, idx) => c.classList.toggle('is-center', idx === bestIdx));
  }

  function updateEnds(railEl, track) {
    const prev = railEl.querySelector('.js-rail-prev');
    const next = railEl.querySelector('.js-rail-next');
    const max  = Math.max(0, track.scrollWidth - track.clientWidth - 2);
    const atStart = track.scrollLeft <= 0;
    const atEnd   = track.scrollLeft >= max;
    prev?.classList.toggle('is-disabled', atStart);
    next?.classList.toggle('is-disabled', atEnd);

    // edge fades only when a card crosses the edge line
    const viewport = track.getBoundingClientRect();
    const y = viewport.top + viewport.height / 2;
    const leftX  = viewport.left  + 0.5;
    const rightX = viewport.right - 0.5;
    let crossLeft = false, crossRight = false;

    for (const card of track.querySelectorAll('.c-rail__card')) {
      const r = card.getBoundingClientRect();
      const yHits = r.top <= y && r.bottom >= y;
      if (!yHits) continue;
      if (r.left < leftX  && r.right > leftX)  crossLeft  = true;
      if (r.left < rightX && r.right > rightX) crossRight = true;
      if (crossLeft && crossRight) break;
    }
    railEl.classList.toggle('has-left',  crossLeft);
    railEl.classList.toggle('has-right', crossRight);
  }

  function setEdgePadding(track) {
    const first = track.firstElementChild;
    const last  = track.lastElementChild;
    if (!first || !last) return;
    const wFirst = first.getBoundingClientRect().width || 0;
    const wLast  = last.getBoundingClientRect().width  || 0;
    const leftPad  = Math.max(0, (track.clientWidth - wFirst) / 2);
    const rightPad = Math.max(0, (track.clientWidth - wLast ) / 2);
    track.style.setProperty('--edge-pad-left',  leftPad  + 'px');
    track.style.setProperty('--edge-pad-right', rightPad + 'px');
  }

  // =========================
  // Scroll behaviors (wheel/drag/touch)
  // =========================
  function makeScrollable(railEl, track) {
    track._updateEnds = () => updateEnds(railEl, track);

    // wheel → horizontal
    track.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        e.preventDefault();
        track._anim?.cancel?.();
        track.scrollLeft += e.deltaY;
        updateScales(track); updateEnds(railEl, track);
        queueSnap(track);
      }
    }, { passive: false });

    // drag to scroll
    let dragging = false, startX = 0, startLeft = 0, pid = null;
    track.addEventListener('pointerdown', (e) => {
      pid = e.pointerId; dragging = true;
      startX = e.clientX; startLeft = track.scrollLeft;
      track.setPointerCapture(pid); track.classList.add('is-dragging');
      track._anim?.cancel?.();
      clearTimeout(track._snapT);
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      track.scrollLeft = startLeft - dx;
      updateScales(track); updateEnds(railEl, track);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      try { track.releasePointerCapture(pid); } catch {}
      track.classList.remove('is-dragging');
      snapToNearest(track);
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', endDrag);

    // native scroll/touch
    track.addEventListener('scroll', () => {
      updateScales(track); updateEnds(railEl, track);
      queueSnap(track);
    }, { passive: true });

    // resize
    const ro = new ResizeObserver(() => {
      setEdgePadding(track); updateScales(track); updateEnds(railEl, track);
      queueSnap(track);
    });
    ro.observe(track);

    // initial
    requestAnimationFrame(() => {
      setEdgePadding(track); updateScales(track); updateEnds(railEl, track);
      snapToNearest(track);
    });
  }

  // =========================
  // Admin: add/delete UI
  // =========================
  function wireAddButton(scope = ROOT) {
    const btn = scope.querySelector('.js-rail-add');
    if (!btn) return;
    btn.hidden = !isAdmin();
    btn.onclick = openEventModal;
  }

  function attachDeleteHandlers(track){
    if (track._wiredDelete) return;            // avoid double-binding
    track._wiredDelete = true;

    track.addEventListener('click', (e)=>{
      const btn = e.target.closest('.c-rail__remove');
      if (!btn) return;
      if (!isAdmin()) return;

      const id = (btn.getAttribute('data-id') || '').trim();
      if (!id) return;

      if (confirm('¿Eliminar este evento?')) {
        const arr = getEvents();
        const idx = arr.findIndex(ev => String(ev.id) === id);
        if (idx > -1) {
          arr.splice(idx, 1);
          setEvents(arr);
          rerenderAll();
          window.showToast?.('Evento eliminado.', { ok:true });
        }
      }
    });
  }


  // Add event modal (with image upload & preview)
  function openEventModal() {
    const toast = (msg, opts) =>
      (window.showToast ? window.showToast(msg, opts) : alert(msg));

    // ensure CSS loaded once
    if (!document.querySelector('link[data-ev-modal-css]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = '/css/event-modal.css';
      l.setAttribute('data-ev-modal-css', '1');
      document.head.appendChild(l);
    }

    // helpers
    const lettersCount = (s='') => (s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
    const isMinLetters = (s, n) => lettersCount(s.trim()) >= n;

    const isValidTime = (v='') => {
      const s = v.trim();
      const re12 = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([AaPp][Mm])$/;      // 7:05 PM
      const re24 = /^([01]\d|2[0-3]):([0-5]\d)$/;                      // 07:05 or 19:30
      return re12.test(s) || re24.test(s);
    };

    const isValidISODate = (v='') => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(v + 'T00:00:00');
      return !isNaN(d.getTime());
    };

    // backdrop + modal
    const bd = document.createElement('div');
    bd.className = 'ev-backdrop';

    const md = document.createElement('div');
    md.className = 'ev-modal';
    md.innerHTML = `
      <h3 class="ev-modal__title">Añadir evento</h3>
      <form class="ev-form" novalidate>
        <div class="form-group">
          <label for="ev-title">Título</label>
          <input id="ev-title" class="login-input" type="text" placeholder="Noche de Caballeros" required />
        </div>
        <div class="form-group">
          <label for="ev-date">Fecha</label>
          <input id="ev-date" class="login-input" type="date" required />
        </div>
        <div class="form-group">
          <label for="ev-time">Hora</label>
          <input id="ev-time" class="login-input" type="text" placeholder="7:00 PM" required />
        </div>
        <div class="form-group">
          <label for="ev-location">Lugar</label>
          <input id="ev-location" class="login-input" type="text" placeholder="2601 Clays Mill Rd" required />
        </div>
        <div class="form-group form-group--full">
          <label for="ev-tag">Etiqueta</label>
          <input id="ev-tag" class="login-input" type="text" placeholder="Culto, Reunión, etc." required />
        </div>

        <div class="form-group form-group--full">
          <label>Imagen</label>
          <div class="ev-dropzone" tabindex="0">
            <input id="ev-imageFile" type="file" accept="image/*" hidden>
            <div class="ev-dropzone__icon" aria-hidden="true">📷</div>
            <div class="ev-dropzone__text">Arrastra una imagen aquí o <button type="button" class="ev-browse" data-browse>explora</button></div>
          </div>
          <div class="ev-preview">
            <img id="ev-imagePreview" class="ev-preview__img" alt="Vista previa">
            <button type="button" class="ird-btn ev-preview__remove" data-remove>Quitar</button>
          </div>
        </div>

        <div class="ev-actions">
          <button type="button" class="ird-btn" data-cancel>Cancelar</button>
          <button type="submit" class="ird-btn ird-btn--teal" formnovalidate>Guardar</button>
        </div>
      </form>
    `;

    bd.appendChild(md);
    document.body.appendChild(bd);

    // lock scroll
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    document.body.dataset.scrollY = String(scrollY);
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollY}px`;
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    requestAnimationFrame(() => bd.classList.add('show'));

    // close helpers
    const close = () => {
      document.removeEventListener('keydown', onKey);
      bd.classList.remove('show');
      setTimeout(() => {
        bd.remove();
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        document.body.style.position = '';
        document.body.style.width = '';
        window.scrollTo(0, parseInt(document.body.dataset.scrollY || '0', 10));
      }, 180);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') trapTab(e, md);
    };
    bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
    md.querySelector('[data-cancel]').addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    // image wiring
    const fileInput = md.querySelector('#ev-imageFile');
    const dropzone  = md.querySelector('.ev-dropzone');
    const browseBtn = md.querySelector('[data-browse]');
    const previewEl = md.querySelector('#ev-imagePreview');
    const previewWr = md.querySelector('.ev-preview');
    const removeBtn = md.querySelector('[data-remove]');
    let imageDataURL = '';

    const showPreview = (src) => {
      imageDataURL = src || '';
      previewEl.src = imageDataURL || '';
      previewWr.classList.toggle('is-visible', !!imageDataURL);
      dropzone.classList.toggle('is-dim', !!imageDataURL);
      dropzone.classList.toggle('is-invalid', !imageDataURL); // required image UI
    };
    const readFileAsDataURL = (file) => new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file);
    });
    async function useFile(file){
      if (!file) return;
      if (!file.type.startsWith('image/')) { toast('Por favor sube una imagen.', { ok:false }); return; }
      try { showPreview(await readFileAsDataURL(file)); }
      catch { toast('No se pudo leer la imagen.', { ok:false }); }
    }

    browseBtn.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click',   () => fileInput.click());
    fileInput.addEventListener('change', () => useFile(fileInput.files?.[0]));
    dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('is-hovered'); });
    dropzone.addEventListener('dragleave',()=> dropzone.classList.remove('is-hovered'));
    dropzone.addEventListener('drop', async (e)=>{ e.preventDefault(); dropzone.classList.remove('is-hovered'); await useFile(e.dataTransfer.files?.[0]); });
    removeBtn.addEventListener('click', ()=>{ fileInput.value=''; showPreview(''); });

    // custom validation
    const form = md.querySelector('form');
    form.addEventListener('invalid', (ev) => ev.preventDefault(), true); // kill native popups

    const F = {
      title: md.querySelector('#ev-title'),
      date:  md.querySelector('#ev-date'),
      time:  md.querySelector('#ev-time'),
      loc:   md.querySelector('#ev-location'),
      tag:   md.querySelector('#ev-tag'),
    };

    // clear invalid on input
    Object.values(F).forEach(el => {
      el.addEventListener('input', () => {
        el.classList.remove('is-invalid');
        el.removeAttribute('aria-invalid');
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // validate in order; first failure gets focus + toast
      if (!isMinLetters(F.title.value, 4)) {
        F.title.classList.add('is-invalid'); F.title.setAttribute('aria-invalid', 'true');
        toast('El título debe tener al menos 4 letras.', { ok:false, ms:3000 });
        F.title.focus({ preventScroll: true }); F.title.scrollIntoView({ block:'center', behavior:'smooth' }); return;
      }
      if (!isValidISODate(F.date.value)) {
        F.date.classList.add('is-invalid'); F.date.setAttribute('aria-invalid', 'true');
        toast('Fecha inválida (usa el selector o YYYY-MM-DD).', { ok:false, ms:3000 });
        F.date.focus({ preventScroll: true }); F.date.scrollIntoView({ block:'center', behavior:'smooth' }); return;
      }
      if (!isValidTime(F.time.value)) {
        F.time.classList.add('is-invalid'); F.time.setAttribute('aria-invalid', 'true');
        toast('Hora inválida. Ejemplos: 7:00 PM o 19:00', { ok:false, ms:3000 });
        F.time.focus({ preventScroll: true }); F.time.scrollIntoView({ block:'center', behavior:'smooth' }); return;
      }
      if ((F.loc.value || '').trim().length < 4) {
        F.loc.classList.add('is-invalid'); F.loc.setAttribute('aria-invalid', 'true');
        toast('Lugar debe tener al menos 4 caracteres.', { ok:false, ms:3000 });
        F.loc.focus({ preventScroll: true }); F.loc.scrollIntoView({ block:'center', behavior:'smooth' }); return;
      }
      if (!isMinLetters(F.tag.value, 4)) {
        F.tag.classList.add('is-invalid'); F.tag.setAttribute('aria-invalid', 'true');
        toast('La etiqueta debe tener al menos 4 letras.', { ok:false, ms:3000 });
        F.tag.focus({ preventScroll: true }); F.tag.scrollIntoView({ block:'center', behavior:'smooth' }); return;
      }
      if (!imageDataURL) {
        dropzone.classList.add('is-invalid');
        toast('Debes añadir una imagen.', { ok:false, ms:3000 });
        dropzone.focus(); dropzone.scrollIntoView({ block:'center', behavior:'smooth' });
        return;
      }

      // commit
      const newEvent = {
        id: crypto?.randomUUID?.() ?? ('e_' + Math.random().toString(36).slice(2)),
        title:    F.title.value.trim(),
        date:     F.date.value.trim(),
        time:     F.time.value.trim(),
        location: F.loc.value.trim(),
        tag:      F.tag.value.trim(),
        image:    imageDataURL
      };

      const arr = getEvents(); arr.push(newEvent);
      setEvents(arr); rerenderAll();
      toast('Evento añadido.', { ok:true });
      close();
    });

    // focus first field
    md.querySelector('#ev-title').focus();

    // simple focus trap
    function trapTab(e, scope){
      const f = scope.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }


  // =========================
  // Rerender all rails in scope
  // =========================
  function rerenderAll(root = ROOT) {
    const data = getEvents();
    document.querySelectorAll('[data-rail="events"]').forEach(rail => populateRail(rail, data));
    wireAddButton(root);
  }

  // =========================
  // Build one rail
  // =========================
  function populateRail(railEl, events) {
    const kind = railEl.dataset.filter; // 'upcoming' | 'past'
    let list = events.slice().sort((a, b) => parseISO(a.date) - parseISO(b.date));
    list = (kind === 'upcoming')
      ? list.filter(e => !isPast(parseISO(e.date)))
      : list.filter(e =>  isPast(parseISO(e.date))).reverse();

    const track = railEl.querySelector('.js-rail-track');
    track.innerHTML = list.length ? list.map(renderCard).join('') : emptyState(kind);

    const prev = railEl.querySelector('.js-rail-prev');
    const next = railEl.querySelector('.js-rail-next');

    prev.onclick = () => animateScrollLeft(track, centerIndex(track, nearestIndex(track) - 1));
    next.onclick = () => animateScrollLeft(track, centerIndex(track, nearestIndex(track) + 1));

    makeScrollable(railEl, track);
    attachDeleteHandlers(track); // delegated, once
  }

  // =========================
  // Tabs
  // =========================
  function wireTabs(root = document) {
    $$('.js-rail-tab', root).forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.c-rail__tab', root).forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');

        const target = btn.dataset.target;
        $$('.c-rail', root).forEach(r => r.classList.remove('is-active'));
        const active = $(target, root);
        active?.classList.add('is-active');

        const t = $('.js-rail-track', active);
        if (t) { setEdgePadding(t); updateScales(t); t._updateEnds?.(); snapToNearest(t); }
      });
    });
  }

  // =========================
  // Load events (inline JSON or /events.json)
  // =========================
  async function loadEvents(root = document) {
    if (Array.isArray(window.RAIL_EVENTS)) return window.RAIL_EVENTS;

    const inline = $('#events-data', root);
    if (inline) {
      try   { return JSON.parse(inline.textContent.trim()); }
      catch (e) { console.error('[rail] Invalid JSON in #events-data:', e); return []; }
    }

    try {
      const res = await fetch('/events.json', { cache: 'no-store' });
      if (!res.ok) return [];
      return await res.json();
    } catch {
      return [];
    }
  }

  // =========================
  // Admin badge (optional)
  // =========================
  function mountAdminBadge() {
    const id = 'ird-admin-badge';
    let badge = document.getElementById(id);

    if (!isAdmin()) { badge?.remove(); return; }

    if (!badge) {
      badge = document.createElement('div');
      badge.id = id;
      badge.innerHTML = `
        <div class="badge-inner">
          <strong>Admin</strong>
          <button type="button" data-logout>Cerrar sesión</button>
        </div>`;
      Object.assign(badge.style, {
        position:'fixed', bottom:'16px', right:'16px', zIndex:'999999',
        font:'600 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      });
      const inner = badge.querySelector('.badge-inner');
      Object.assign(inner.style, {
        display:'flex', gap:'8px', alignItems:'center',
        padding:'8px 10px', borderRadius:'999px',
        background:'rgba(0,0,0,.7)', color:'#fff',
        boxShadow:'0 8px 24px rgba(0,0,0,.25)'
      });
      const btn = badge.querySelector('[data-logout]');
      Object.assign(btn.style, {
        border:'0', borderRadius:'999px', padding:'6px 10px',
        fontWeight:'700', cursor:'pointer', background:'#ef4444', color:'#fff'
      });
      btn.addEventListener('mouseenter', () => btn.style.filter = 'brightness(1.1)');
      btn.addEventListener('mouseleave', () => btn.style.filter = '');
      btn.onclick = () => window.Auth.logout();
      document.body.appendChild(badge);
    }
  }

  // =========================
  // Public API
  // =========================
  window.Rail = {
    async init(root = document) {
      ROOT = root;
      wireTabs(root);

      const events = ensureIds(await loadEvents(root));
      setEvents(events);

      wireAddButton(root);
      document.querySelectorAll('[data-rail="events"]').forEach(rail => populateRail(rail, events));
    },
    setEvents(events) {
      setEvents(ensureIds(events));
      rerenderAll();
    },
    adminEnable() {
      document.body.classList.add('is-admin');
      localStorage.setItem(ADMIN_KEY, '1');
      rerenderAll();
      mountAdminBadge();
    },
    adminDisable() {
      document.body.classList.remove('is-admin');
      localStorage.removeItem(ADMIN_KEY);
      rerenderAll();
      mountAdminBadge(); // removes if not admin
    }
  };

  // Tiny global auth helpers you can call from anywhere
  window.Auth = {
    login()  { window.Rail.adminEnable();  window.showToast?.('Sesión iniciada (admin).', { ok: true }); },
    logout() { window.Rail.adminDisable(); window.showToast?.('Sesión cerrada.',         { ok: true }); }
  };

  // Restore admin state on reload
  if (localStorage.getItem(ADMIN_KEY) === '1') {
    document.body.classList.add('is-admin');
    mountAdminBadge();
  }

  // (Optional) Dev toggle: Alt+Shift+A
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'a') {
      isAdmin() ? window.Auth.logout() : window.Auth.login();
    }
  });

  // Also listen for external auth events if you dispatch them
  document.addEventListener('auth:login',  (e) => { if (e?.detail?.admin) window.Auth.login();  });
  document.addEventListener('auth:logout', () => { window.Auth.logout(); });
})();
