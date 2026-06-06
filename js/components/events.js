import { esc } from '/js/utils/escape.js';
// /js/events.js — dual-mode renderer (simple grid OR month accordion)
// Usage: window.Rail.setEvents([{ id, title, date:'YYYY-MM-DD', time?, location?, image?, url?, description?, starts_at? }])
(() => {
  'use strict';

  const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const pad = (n) => String(n).padStart(2, '0');

  const TZ = 'America/New_York';

  const ICON_CAL = `
    <svg aria-hidden="true" viewBox="0 0 448 512"><path fill="currentColor"
    d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24v40H64c-35.3 0-64 28.7-64 64v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V128c0-35.3-28.7-64-64-64h-40V24c0-13.3-10.7-24-24-24s-24 10.7-24 24v40H152V24zM48 192h352v256c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192z"/></svg>`;
  const ICON_CLOCK = `
    <svg aria-hidden="true" viewBox="0 0 512 512"><path fill="currentColor"
    d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200zm12-328h-24c-6.6 0-12 5.4-12 12v116c0 4.2 2.2 8.1 5.8 10.3l88 52c5.7 3.4 13.1 1.6 16.5-4.1l12-20c3.4-5.7 1.6-13.1-4.1-16.5l-82.2-48.6V140c0-6.6-5.4-12-12-12z"/></svg>`;
  const ICON_LOC = `
    <svg aria-hidden="true" viewBox="0 0 384 512"><path fill="currentColor"
    d="M168 0C75.1 0 0 75.1 0 168c0 87.7 141.7 293.9 160.8 321.2c3 4.3 8 6.8 13.2 6.8s10.2-2.5 13.2-6.8C182.3 461.9 324 255.7 324 168C324 75.1 248.9 0 156 0h12zM168 256a88 88 0 1 1 0-176 88 88 0 1 1 0 176z"/></svg>`;

  /* ========== date helpers ========== */
  const todayKey = () => {
    // YYYY-MM-DD in Lexington timezone, stable for all viewers
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const get = (t) => parts.find(p => p.type === t)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };

  const isUpcoming = (ev) => (ev?.date || '') >= todayKey();
  const byDateAsc = (a, b) => (a.date > b.date) - (a.date < b.date);
  const monthKey = (dateStr = '') => { const [y, m] = dateStr.split('-'); return (y && m) ? `${y}-${m}` : ''; };
  const monthLabel = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString('es', { month: 'long' }).toUpperCase();
  };

  const fmtDate = (dateStr) => {
    try {
      const [y, m, d] = (dateStr || '').split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch { return dateStr || ''; }
  };

  /* ========== time parsing & calendar link (Google) ========== */
  const fmtUTC = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  const fmtDateCompact = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());

  function zonedLocalToDate(dateStr, timeStr, timeZone = TZ) {
    const [Y, M, D] = (dateStr || '').split('-').map(Number);
    if (!Y || !M || !D) return new Date(NaN);

    let hh = 9, mm = 0; // default 09:00 if missing
    if (timeStr) {
      const clean = String(timeStr).replace(/\s+/g, ' ').trim().toUpperCase();
      // Accept: "7pm", "7:00 PM", "19:00", "07:00PM"
      const m12 = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
      const m24 = clean.match(/^(\d{1,2})(?::(\d{2}))$/);

      if (m12) {
        hh = Number(m12[1]); mm = Number(m12[2] || '0');
        const ap = m12[3];
        if (ap === 'PM' && hh !== 12) hh += 12;
        if (ap === 'AM' && hh === 12) hh = 0;
      } else if (m24) {
        hh = Number(m24[1]); mm = Number(m24[2] || '0');
      }
    }

    let guess = new Date(Date.UTC(Y, M - 1, D, hh, mm, 0));

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(guess);

    const get = (t) => Number(parts.find(p => p.type === t)?.value);
    const y2 = get('year'), mo2 = get('month'), d2 = get('day'), h2 = get('hour'), mi2 = get('minute');

    const desiredMinutes = (((Y * 13 + M) * 32 + D) * 24 + hh) * 60 + mm;
    const gotMinutes = (((y2 * 13 + mo2) * 32 + d2) * 24 + h2) * 60 + mi2;
    const diffMin = desiredMinutes - gotMinutes;

    guess = new Date(guess.getTime() + diffMin * 60000);
    return guess;
  }

  function parseCardTimes(ev) {
    if (ev?.starts_at) {
      const start = new Date(ev.starts_at);
      if (!isFinite(start)) return { allDay: true, start: null, end: null };

      if (!ev.time) {
        const base = ev.date || '';
        if (base) {
          const s = zonedLocalToDate(base, '12:00 AM', TZ);
          const e = new Date(s.getTime() + 86400000);
          return { allDay: true, start: s, end: e };
        }
        const end = new Date(start.getTime() + 86400000);
        return { allDay: true, start, end };
      }

      const [t1, t2] = ev.time.split(/–|—|-|to/i).map(s => s.trim());
      const base = ev.date || '';
      const start2 = base ? zonedLocalToDate(base, t1, TZ) : start;
      const end2 = (base && t2) ? zonedLocalToDate(base, t2, TZ) : new Date(start2.getTime() + 3600000);
      return { allDay: false, start: start2, end: end2 };
    }

    const base = ev.date || '';
    if (!base) return { allDay: true, start: null, end: null };

    if (!ev.time) {
      const start = zonedLocalToDate(base, '12:00 AM', TZ);
      const end = new Date(start.getTime() + 86400000);
      return { allDay: true, start, end };
    }

    const [t1, t2] = ev.time.split(/–|—|-|to/i).map(s => s.trim());
    const start = zonedLocalToDate(base, t1, TZ);
    const end = t2 ? zonedLocalToDate(base, t2, TZ) : new Date(start.getTime() + 3600000);
    return { allDay: false, start, end };
  }

  function buildGoogleCalUrl(ev) {
    const { allDay, start, end } = parseCardTimes(ev);
    if (!start || !end) return '#';
    const dates = allDay ? `${fmtDateCompact(start)}/${fmtDateCompact(end)}` : `${fmtUTC(start)}/${fmtUTC(end)}`;
    const qs = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.title || 'Evento',
      dates,
      details: ev.description || '',
      location: ev.location || ''
    });
    return `https://calendar.google.com/calendar/render?${qs.toString()}`;
  }

  function makeCard(ev) {
    const title = ev.title || 'Evento';
    const article = el('article', 'event');
    article.setAttribute('role', 'listitem');

    // Link to event detail page if event has an ID
    const hasLink = !!ev.id;
    const tag = hasLink ? 'a' : 'div';
    const href = hasLink ? `/eventos/evento.html?id=${encodeURIComponent(ev.id)}` : '';
    const hrefAttr = hasLink ? `href="${href}"` : '';

    article.innerHTML = `
      <${tag} class="event__linkwrap" ${hrefAttr} aria-label="${esc(title)}">
        <div class="event__media">
          <img src="${esc(ev.image || '')}" alt="${esc(title)}" loading="lazy" decoding="async">
        </div>

        <div class="event__body">
          <h3 class="event__title">${esc(title)}</h3>

          <div class="event__row">${ICON_CAL}<span>${esc(fmtDate(ev.date))}</span></div>
          ${ev.time ? `<div class="event__row">${ICON_CLOCK}<span>${esc(ev.time)}</span></div>` : ''}
          ${ev.location ? `<div class="event__row">${ICON_LOC}<span>${esc(ev.location)}</span></div>` : ''}
        </div>
      </${tag}>
    `;

    article.style.cursor = hasLink ? 'pointer' : 'default';

    return article;
  }

  function makeMonthAccordionItem(ymKey, events, startOpen = false) {
    const item = el('div', 'accordion-faq__item');

    const btn = el('button', 'accordion-faq__question');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', String(!!startOpen));
    btn.innerHTML = `
      <span>${monthLabel(ymKey)}</span>
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
    if (startOpen) panel.classList.add('open');

    const grid = el('div', 'events__grid events__grid--accordion');
    grid.setAttribute('role', 'list');
    grid.style.justifyContent = 'start';
    grid.style.alignContent = 'start';

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

  function renderSimpleGrid(container, list) {
    if (!container) return;
    container.hidden = false;
    container.innerHTML = '';

    container.style.justifyContent = 'start';
    container.style.alignContent = 'start';

    const frag = document.createDocumentFragment();
    list.forEach(ev => frag.appendChild(makeCard(ev)));
    container.appendChild(frag);

    if (window.initAnimations) requestAnimationFrame(() => window.initAnimations());
  }

  function renderMonthAccordion(section, list) {
    const placeholder = section.querySelector('.events__grid, #events-grid');
    if (placeholder) placeholder.hidden = true;


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

    hostWrapper.style.display = 'flex';
    hostWrapper.style.flexDirection = 'column';
    hostWrapper.style.alignItems = 'center';
    if (!hostWrapper.style.gap) hostWrapper.style.gap = '1.25rem';

    hostWrapper.innerHTML = '';

    const buckets = new Map();
    for (const ev of list) {
      const k = monthKey(ev.date || '');
      if (!k) continue;
      (buckets.get(k) || buckets.set(k, []).get(k)).push(ev);
    }

    const frag = document.createDocumentFragment();
    [...buckets.keys()].sort().forEach(k => {
      frag.appendChild(makeMonthAccordionItem(k, buckets.get(k), false));
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
      if (grid) { grid.hidden = false; grid.innerHTML = ''; }
      const hostWrapper = section.querySelector('[data-months] .accordion-faq__wrapper');
      if (hostWrapper) hostWrapper.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;

    if (monthMode) renderMonthAccordion(section, list);
    else renderSimpleGrid(grid, list);
  }

  const getSections = () => $all('[data-events]');

  window.Rail = Object.assign(window.Rail || {}, {
    setEvents(allEvents = []) {
      getSections().forEach(sec => renderInto(sec, allEvents));
    },
    init(section) {
      if (section) renderInto(section, []);
    },
    buildGoogleCalUrl
  });
})();