// /js/events.js — dual-mode renderer (main grid OR month accordion)
(() => {
  const getSections = () => Array.from(document.querySelectorAll('[data-events]'));

  // Inline icons (for cards)
  const ICON_CAL = `<svg aria-hidden="true" viewBox="0 0 448 512"><path fill="currentColor" d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24v40H64c-35.3 0-64 28.7-64 64v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64h-40V24c0-13.3-10.7-24-24-24s-24 10.7-24 24v40H152V24zM48 192h352v256c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>`;
  const ICON_CLOCK = `<svg aria-hidden="true" viewBox="0 0 512 512"><path fill="currentColor" d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm12-328h-24c-6.6 0-12 5.4-12 12v116c0 4.2 2.2 8.1 5.8 10.3l88 52c5.7 3.4 13.1 1.6 16.5-4.1l12-20c3.4-5.7 1.6-13.1-4.1-16.5l-82.2-48.6V140c0-6.6-5.4-12-12-12z"/></svg>`;
  const ICON_LOC = `<svg aria-hidden="true" viewBox="0 0 384 512"><path fill="currentColor" d="M168 0C75.1 0 0 75.1 0 168c0 87.7 141.7 293.9 160.8 321.2c3 4.3 8 6.8 13.2 6.8s10.2-2.5 13.2-6.8C182.3 461.9 324 255.7 324 168C324 75.1 248.9 0 156 0h12zM168 256a88 88 0 1 1 0-176 88 88 0 1 1 0 176z"/></svg>`;

  // Date helpers
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const isUpcoming = ev => (ev?.date || '') >= todayKey();
  const byDateAsc  = (a,b) => (a.date > b.date) - (a.date < b.date);

  // Month helpers
  const monthKey = (dateStr) => {
    const [y,m] = (dateStr || '').split('-');
    return (y && m) ? `${y}-${m}` : '';
  };
  // UPPERCASE Spanish month name only (used in accordion headers)
  const monthLabel = (key) => {
    const [y,m] = key.split('-').map(Number);
    const dt = new Date(y, (m||1)-1, 1);
    return dt.toLocaleDateString('es', { month: 'long' }).toUpperCase();
  };

  // Single, shared date formatter everywhere → "September 6, 2025"
  const fmtDate = (dateStr) => {
    try {
      const [y,m,d] = (dateStr || '').split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr || '';
    }
  };

  // Card
  function makeCard(ev) {
    const title = ev.title || 'Evento';
    const el = document.createElement('article');
    el.className = 'event animate-fade-in';
    el.setAttribute('data-threshold', '1');
    el.setAttribute('role','listitem');
    el.innerHTML = `
      <div class="event__media">
        <img src="${ev.image || ''}" alt="${title}">
      </div>
      <div class="event__body">
        <h3 class="event__title">${title}</h3>
        <div class="event__row">${ICON_CAL}<span>${fmtDate(ev.date)}</span></div>
        ${ev.time ? `<div class="event__row">${ICON_CLOCK}<span>${ev.time}</span></div>` : ''}
        ${ev.location ? `<div class="event__row">${ICON_LOC}<span>${ev.location}</span></div>` : ''}
      </div>
      ${ev.url ? `<a class="event__link" href="${ev.url}" target="_blank" rel="noopener noreferrer">Leer más</a>` : ''}
    `;
    return el;
  }

  // Accordion item (re-uses your section--accordion-faq.css). Only first starts open.
  function makeMonthAccordionItem(key, events, isFirst) {
    const item  = document.createElement('div');
    item.className = 'accordion-faq__item';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'accordion-faq__question';
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

    const panel = document.createElement('div');
    panel.className = 'accordion-faq__answer';
    if (isFirst) panel.classList.add('open');

    const grid = document.createElement('div');
    // Extra class makes accordion grids left-aligned without touching main grid
    grid.className = 'events__grid events__grid--accordion';
    grid.setAttribute('role', 'list');

    const frag = document.createDocumentFragment();
    events.forEach(ev => frag.appendChild(makeCard(ev)));
    grid.appendChild(frag);
    panel.appendChild(grid);
    if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());

    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      panel.classList.toggle('open', !expanded);
      if (!expanded && window.initAnimations) requestAnimationFrame(() => window.initAnimations());
    });

    item.appendChild(btn);
    item.appendChild(panel);
    return item;
  }

  // Simple grid (main page)
  function renderSimpleGrid(container, list) {
    if (!container) return;
    container.hidden = false;
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(ev => frag.appendChild(makeCard(ev)));
    container.appendChild(frag);
    if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
  }

  // Month accordion (full events)
  function renderMonthAccordion(section, list) {
    // Hide placeholder grid if present
    const placeholder = section.querySelector('.events__grid, #events-grid');
    if (placeholder) placeholder.hidden = true;

    // Find or create host for accordion
    let hostWrapper = section.querySelector('[data-months] .accordion-faq__wrapper');
    if (!hostWrapper) {
      const shell = document.createElement('section');
      shell.className = 'section--accordion-faq';
      shell.setAttribute('data-months','');
      hostWrapper = document.createElement('div');
      hostWrapper.className = 'accordion-faq__wrapper';
      shell.appendChild(hostWrapper);

      const header = section.querySelector('.events__header');
      if (header && header.nextSibling) section.insertBefore(shell, header.nextSibling);
      else section.appendChild(shell);
    }

    // Clear previous render (idempotent)
    hostWrapper.innerHTML = '';

    // Group by month, render items
    const buckets = new Map();
    for (const ev of list) {
      const k = monthKey(ev.date || '');
      if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(ev);
    }

    const frag = document.createDocumentFragment();
    [...buckets.keys()].sort().forEach((k, i) => {
      frag.appendChild(makeMonthAccordionItem(k, buckets.get(k), i === 0));
    });
    hostWrapper.appendChild(frag);
  }

  function renderInto(section, allEvents){
    const monthMode = section.hasAttribute('data-month-accordion');
    const grid = section.querySelector('.events__grid, #events-grid');
    const empty = section.querySelector('.events__empty');

    const limitAttr = section.getAttribute('data-limit');
    const limit = limitAttr ? Math.max(0, parseInt(limitAttr, 10) || 0) : 0;

    let list = (allEvents || []).filter(isUpcoming).sort(byDateAsc);
    if (limit > 0) list = list.slice(0, limit);

    if (!list.length) {
      if (empty) empty.hidden = false;
      if (grid) { grid.hidden = false; grid.innerHTML = ''; }
      const hostWrapper = section.querySelector('[data-months] .accordion-faq__wrapper');
      if (hostWrapper) hostWrapper.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;

    if (monthMode) renderMonthAccordion(section, list);
    else renderSimpleGrid(grid, list);
  }

  // Public API (called by your Supabase bridges)
  window.Rail = Object.assign(window.Rail || {}, {
    setEvents(allEvents = []) { getSections().forEach(sec => renderInto(sec, allEvents)); },
    init() {}
  });
})();
