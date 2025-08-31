// /js/events.js — dual-mode renderer (main grid OR month accordion)
(() => {
  'use strict';

  /* ---------------------------------------------
   * Small utils
   * ------------------------------------------- */
  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  /* ---------------------------------------------
   * Inline icons (SVGs)
   * ------------------------------------------- */
  const ICON_CAL = `
    <svg aria-hidden="true" viewBox="0 0 448 512">
      <path fill="currentColor" d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24v40H64c-35.3 0-64 28.7-64 64v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64h-40V24c0-13.3-10.7-24-24-24s-24 10.7-24 24v40H152V24zM48 192h352v256c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/>
    </svg>`;
  const ICON_CLOCK = `
    <svg aria-hidden="true" viewBox="0 0 512 512">
      <path fill="currentColor" d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm12-328h-24c-6.6 0-12 5.4-12 12v116c0 4.2 2.2 8.1 5.8 10.3l88 52c5.7 3.4 13.1 1.6 16.5-4.1l12-20c3.4-5.7 1.6-13.1-4.1-16.5l-82.2-48.6V140c0-6.6-5.4-12-12-12z"/>
    </svg>`;
  const ICON_LOC = `
    <svg aria-hidden="true" viewBox="0 0 384 512">
      <path fill="currentColor" d="M168 0C75.1 0 0 75.1 0 168c0 87.7 141.7 293.9 160.8 321.2c3 4.3 8 6.8 13.2 6.8s10.2-2.5 13.2-6.8C182.3 461.9 324 255.7 324 168C324 75.1 248.9 0 156 0h12zM168 256a88 88 0 1 1 0-176 88 88 0 1 1 0 176z"/>
    </svg>`;

  /* ---------------------------------------------
   * Date helpers
   * ------------------------------------------- */
  const pad = (n) => String(n).padStart(2, '0');

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  };

  const isUpcoming = (ev) => (ev?.date || '') >= todayKey();
  const byDateAsc = (a, b) => (a.date > b.date) - (a.date < b.date);

  const monthKey = (dateStr = '') => {
    const [y, m] = dateStr.split('-');
    return y && m ? `${y}-${m}` : '';
  };

  // ES uppercase month for accordion headers
  const monthLabel = (key) => {
    const [y, m] = key.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, 1);
    return dt.toLocaleDateString('es', { month: 'long' }).toUpperCase();
  };

  // "September 6, 2025"
  const fmtDate = (dateStr) => {
    try {
      const [y, m, d] = (dateStr || '').split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      });
    } catch { return dateStr || ''; }
  };

  /* ---------------------------------------------
   * Time parsing + calendar URL fallback (Google)
   * ------------------------------------------- */
  function toLocalDate(dateStr, timeStr) {
    if (!timeStr) return new Date(`${dateStr} 09:00`);
    const clean = String(timeStr).replace(/\s+/g, ' ').trim();
    // Accepts "7pm", "7 PM", "7:00 PM", "19:00"
    return new Date(`${dateStr} ${clean}`);
  }

  // ev.time: "7:00 PM – 8:30 PM" | "19:00-20:30" | omit => all-day
  function parseCardTimes(ev) {
    const base = ev.date || '';
    if (!base) return { allDay: true, start: null, end: null };

    if (!ev.time) {
      const start = new Date(`${base}T00:00:00`);
      const end = new Date(start.getTime() + 24*60*60*1000);
      return { allDay: true, start, end };
    }
    const parts = ev.time.split(/–|—|-|to/i).map(s => s.trim());
    const t1 = parts[0];
    const t2 = parts[1];
    const start = toLocalDate(base, t1);
    const end = t2 ? toLocalDate(base, t2) : new Date(start.getTime() + 60*60*1000);
    return { allDay: false, start, end };
  }

  const fmtUTC = (d) => (
    d.getUTCFullYear() + pad(d.getUTCMonth()+1) + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z'
  );

  const fmtDateCompact = (d) => (
    d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate())
  );

  // Minimal Google Calendar link (used as no-JS fallback)
  function buildGoogleCalUrl(ev) {
    const { allDay, start, end } = parseCardTimes(ev);
    const dates = allDay
      ? `${fmtDateCompact(start)}/${fmtDateCompact(end)}`
      : `${fmtUTC(start)}/${fmtUTC(end)}`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.title || 'Evento',
      dates,
      details: ev.description || '',
      location: ev.location || ''
      // we could add ctz here if you set ev.tz
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  /* ---------------------------------------------
   * Card factory
   * ------------------------------------------- */
  function makeCard(ev) {
    const title = ev.title || 'Evento';
    const article = el('article', 'event');
    article.setAttribute('role', 'listitem');

    const detailsHref = ev.url
      ? ev.url
      : (ev.id ? `/evento.html?id=${encodeURIComponent(ev.id)}` : null);

    // Build no-JS fallback Google link
    const fallbackHref = buildGoogleCalUrl(ev);

    article.innerHTML = `
      <a class="event__linkwrap" ${detailsHref ? `href="${detailsHref}"` : ''} aria-label="${title}">
        <div class="event__media">
          <img src="${ev.image || ''}" alt="${title}">
        </div>
        <div class="event__body">
          <h3 class="event__title">${title}</h3>
          <div class="event__row">${ICON_CAL}<span>${fmtDate(ev.date)}</span></div>
          ${ev.time ? `<div class="event__row">${ICON_CLOCK}<span>${ev.time}</span></div>` : ''}
          ${ev.location ? `<div class="event__row">${ICON_LOC}<span>${ev.location}</span></div>` : ''}
          <div class="event__actions">
            <a class="event__addcal"
               href="${fallbackHref}"
               rel="noopener noreferrer">
              Agregar al calendario
            </a>
          </div>
        </div>
      </a>
    `;

    // Make entire card clickable (don’t hijack the calendar button)
    if (detailsHref) {
      article.tabIndex = 0;

      article.addEventListener('click', (e) => {
        if (e.target.closest('.event__addcal')) return;
        const a = article.querySelector('.event__linkwrap[href]');
        if (a) a.click();
      });

      article.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const a = article.querySelector('.event__linkwrap[href]');
          if (a) a.click();
        }
      });
    } else {
      article.style.cursor = 'default';
    }

    // Intercept calendar click: iOS -> .ics (CalendarUtils), others -> Google
    const addBtn = article.querySelector('.event__addcal');
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const CU = window.CalendarUtils;
      if (CU && typeof CU.handleCalendarClick === 'function') {
        CU.handleCalendarClick({
          id: ev.id,
          title: ev.title,
          date: ev.date,
          time: ev.time,
          location: ev.location,
          description: ev.description,
          url: ev.url,
          tz: ev.tz
        });
      } else {
        // Fallback if utils missing: navigate to Google in same tab
        window.location.href = fallbackHref;
      }
    });

    return article;
  }

  /* ---------------------------------------------
   * Accordion (month buckets)
   * ------------------------------------------- */
  function makeMonthAccordionItem(key, events, isFirst) {
    const item = el('div', 'accordion-faq__item');

    const btn = el('button', 'accordion-faq__question');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', String(!!isFirst));
    btn.innerHTML = `
      <span>${monthLabel(key)}</span>
      <span class="accordion-faq__icon" aria-hidden="true">
        <svg class="accordion-faq__chevron" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg class="accordion-faq__x" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    `;

    const panel = el('div', 'accordion-faq__answer');
    if (isFirst) panel.classList.add('open');

    const grid = el('div', 'events__grid events__grid--accordion');
    grid.setAttribute('role', 'list');

    const frag = document.createDocumentFragment();
    events.forEach((ev) => frag.appendChild(makeCard(ev)));
    grid.appendChild(frag);
    panel.appendChild(grid);

    if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());

    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      panel.classList.toggle('open', !expanded);
      if (!expanded && window.initAnimations) {
        requestAnimationFrame(() => window.initAnimations());
      }
    });

    item.appendChild(btn);
    item.appendChild(panel);
    return item;
  }

  /* ---------------------------------------------
   * Renderers
   * ------------------------------------------- */
  function renderSimpleGrid(container, list) {
    if (!container) return;
    container.hidden = false;
    container.innerHTML = '';

    const frag = document.createDocumentFragment();
    list.forEach((ev) => frag.appendChild(makeCard(ev)));
    container.appendChild(frag);

    if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
  }

  function renderMonthAccordion(section, list) {
    // Hide placeholder grid if present
    const placeholder = section.querySelector('.events__grid, #events-grid');
    if (placeholder) placeholder.hidden = true;

    // Find/create host
    let hostWrapper = section.querySelector('[data-months] .accordion-faq__wrapper');
    if (!hostWrapper) {
      const shell = el('section', 'section--accordion-faq');
      shell.setAttribute('data-months', '');
      hostWrapper = el('div', 'accordion-faq__wrapper');
      shell.appendChild(hostWrapper);

      const header = section.querySelector('.events__header');
      if (header && header.nextSibling) section.insertBefore(shell, header.nextSibling);
      else section.appendChild(shell);
    }

    // Clear previous
    hostWrapper.innerHTML = '';

    // Group by YYYY-MM
    const buckets = new Map();
    for (const ev of list) {
      const k = monthKey(ev.date || '');
      if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(ev);
    }

    // Render months in ascending order
    const frag = document.createDocumentFragment();
    [...buckets.keys()].sort().forEach((k, i) => {
      frag.appendChild(makeMonthAccordionItem(k, buckets.get(k), i === 0));
    });
    hostWrapper.appendChild(frag);
  }

  function renderInto(section, allEvents) {
    const monthMode = section.hasAttribute('data-month-accordion');
    const grid = section.querySelector('.events__grid, #events-grid');
    const empty = section.querySelector('.events__empty');

    const limitAttr = section.getAttribute('data-limit');
    const limit = limitAttr ? Math.max(0, parseInt(limitAttr, 10) || 0) : 0;

    let list = (allEvents || []).filter(isUpcoming).sort(byDateAsc);
    if (limit > 0) list = list.slice(0, limit);

    if (!list.length) {
      if (empty) empty.hidden = false;
      if (grid) {
        grid.hidden = false;
        grid.innerHTML = '';
      }
      const hostWrapper = section.querySelector('[data-months] .accordion-faq__wrapper');
      if (hostWrapper) hostWrapper.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;

    if (monthMode) renderMonthAccordion(section, list);
    else renderSimpleGrid(grid, list);
  }

  /* ---------------------------------------------
   * Public API
   * ------------------------------------------- */
  function getSections() { return $all('[data-events]'); }

  window.Rail = Object.assign(window.Rail || {}, {
    setEvents(allEvents = []) {
      getSections().forEach((sec) => renderInto(sec, allEvents));
    },
    init() {
      // no-op hook for symmetry if you need to do one-time wiring later
    }
  });
})();
