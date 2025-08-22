// /js/components/rail.js
(() => {
  'use strict';

  // =========================
  // Tiny utils
  // =========================
  const $  = (sel, root = document)  => root.querySelector(sel);
  const $$ = (sel, root = document)  => Array.from(root.querySelectorAll(sel));

  const parseISO = (s) => new Date(s + (s && s.length === 10 ? 'T00:00:00' : ''));
  const startOfToday = () => new Date(new Date().toDateString());
  const isPast = (d) => d < startOfToday();
  const fmtDate = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parseISO(iso));
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  // Root (for partial mounts)
  let ROOT = document;

  // =========================
  // In-memory (ephemeral) events ONLY
  // (Populated from rail-supabase-bridge via Rail.setEvents)
  // =========================
  let EVENTS = [];
  const getEvents = () => EVENTS || [];
  const setLocalEvents = (arr) => { EVENTS = Array.isArray(arr) ? arr : []; };

  // =========================
  // Programmatic smooth scroll
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
    const cta = ev.cta && ev.cta.url && ev.cta.label ? `<a class="c-rail__cta" href="${ev.cta.url}" target="_blank" rel="noopener">${ev.cta.label}</a>` : '';

    return `
      <article class="c-rail__card" role="listitem" aria-label="${ev.title || 'Evento'}" data-id="${ev.id || ''}">
        ${img}
        <div class="c-rail__body">
          ${tag}
          <h3 class="c-rail__title-sm">${ev.title || 'Evento'}</h3>
          <p class="c-rail__meta">
            ${ev.date ? `<span>${fmtDate(ev.date)}</span><br>` : ''}
            ${ev.time ? `<span>${ev.time}</span><br>` : '' }
            ${ev.location ? `<span>${ev.location}</span>` : '' }
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
  // Focus scaling + edge fades
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
  // Scroll behaviors (wheel/drag/pointer)
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

    // pointer drag
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
  // Build one rail from EVENTS
  // =========================
  function populateRail(railEl, events) {
    const kind = railEl.dataset.filter; // 'upcoming' | 'past'
    let list = (events || []).slice().sort((a, b) => parseISO(a.date) - parseISO(b.date));
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
  // Rerender all rails in scope
  // =========================
  function rerenderAll(root = ROOT) {
    const data = getEvents();
    root.querySelectorAll('[data-rail="events"]').forEach(rail => populateRail(rail, data));
  }

  // =========================
  // Public API (minimal)
  // =========================
  window.Rail = {
    async init(root = document) {
      ROOT = root;
      wireTabs(root);

      // Start empty; Supabase bridge will call setEvents(...)
      setLocalEvents([]);
      rerenderAll(root);

      // Let the bridge know the rails are mounted
      document.dispatchEvent(new CustomEvent('rail:ready', { detail: { root } }));
    },

    setEvents(events) {
      setLocalEvents(events);
      rerenderAll(ROOT);
    }
  };
})();
