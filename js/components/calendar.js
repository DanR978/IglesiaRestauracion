// /js/components/calendar.js
// Public calendar page — grid + two tabs: Especiales (→ detail page) + Actividades Regulares

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { setupStickyNav, setupBurgerMenu } from '/js/app/ui.js';

// ─── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://snqwxgyhfiinouewxgiy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNucXd4Z3loZmlpbm91ZXd4Z2l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MjMxNzAsImV4cCI6MjA3MTM5OTE3MH0.LgxKa56FGiHRZB24s8ikfg5epV5QXdG3aVkgPIRMneo';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Config ──────────────────────────────────────────────────────────────────
const CATS = {
  servicio:       { label: 'Servicio',        pill: 'cat--servicio',       dot: 'dot--servicio'       },
  estudio:        { label: 'Estudio Bíblico',  pill: 'cat--estudio',        dot: 'dot--estudio'        },
  oracion:        { label: 'Oración',          pill: 'cat--oracion',        dot: 'dot--oracion'        },
  evangelizacion: { label: 'Evangelización',   pill: 'cat--evangelizacion', dot: 'dot--evangelizacion' },
  especial:       { label: 'Especial',         pill: 'cat--especial',       dot: 'dot--especial'       },
  otro:           { label: 'Otro',             pill: 'cat--otro',           dot: 'dot--otro'           },
};
const getCat = c => CATS[c] || CATS.otro;

// Category dot colors — match admin
const CAT_COLORS = {
  servicio:       '#1e6b61',
  estudio:        '#2a4a9e',
  oracion:        '#5c3d9c',
  evangelizacion: '#a05a10',
  especial:       '#b02030',
  otro:           '#888',
};


const DAYS_S = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DAYS_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const pad      = n => String(n).padStart(2, '0');
const ymd      = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayYMD = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };

// ─── State ───────────────────────────────────────────────────────────────────
let viewYear    = new Date().getFullYear();
let viewMonth   = new Date().getMonth();
let regularEvs  = [];   // from calendar_events (recurring weekly activities)
let specialEvs  = [];   // from events table (Vigilias, Noches de Caballeros, etc.)
let allEvents   = [];   // merged for grid index + modal lookup

// ─── Data loading ────────────────────────────────────────────────────────────
async function loadFromSupabase() {
  // 1. Recurring activities (calendar_events)
  const { data: calData, error: calErr } = await sb
    .from('calendar_events')
    .select('id, title, date, time, location, description, category, cancelled')
    .order('date');
  if (calErr) console.warn('[calendar] calendar_events:', calErr.message);
  regularEvs = (calData || []).map(r => ({ ...r, _source: 'cal' }));

  // 2. Special events (events table) — only upcoming, with image
  const { data: evData, error: evErr } = await sb
    .from('events')
    .select('id, title, starts_at, location, description, image_url, tag')
    .order('starts_at');
  if (evErr) console.warn('[calendar] events:', evErr.message);

  specialEvs = (evData || []).map(row => {
    if (!row.starts_at) return null;
    const d = new Date(row.starts_at);
    return {
      id:          row.id,           // keep real UUID for detail page link
      _id_cal:     `evt-${row.id}`,  // for grid index
      title:       row.title || 'Evento',
      date:        ymd(d.getFullYear(), d.getMonth(), d.getDate()),
      time:        `${(d.getHours() % 12) || 12}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`,
      location:    row.location || '',
      description: row.description || '',
      image_url:   row.image_url || '',
      tag:         row.tag || '',
      category:    'especial',
      cancelled:   false,
      _source:     'evt',
    };
  }).filter(Boolean);

  // Merged list for grid: use _id_cal as id so grid index works
  allEvents = [
    ...regularEvs,
    ...specialEvs.map(e => ({ ...e, id: e._id_cal })),
  ].sort((a, b) => (a.date > b.date ? 1 : -1));
}

// ─── Build grid index ────────────────────────────────────────────────────────
function buildIndex() {
  const idx = {};
  for (const ev of allEvents) {
    if (!ev.date) continue;
    (idx[ev.date] = idx[ev.date] || []).push(ev);
  }
  return idx;
}

// ─── Legend + Weekdays ───────────────────────────────────────────────────────
function renderLegend() {
  const el = document.getElementById('calLegend');
  if (!el) return;
  el.innerHTML = Object.entries(CATS).map(([, m]) => `
    <div class="cal-legend__item">
      <span class="cal-legend__dot ${m.dot}"></span>
      <span>${m.label}</span>
    </div>`).join('');
}

function renderWeekdays() {
  const el = document.getElementById('calWeekdays');
  if (!el) return;
  el.innerHTML = DAYS_S.map(d => `<div class="cal-grid__weekday">${d}</div>`).join('');
}

// ─── Grid ────────────────────────────────────────────────────────────────────
function renderGrid(year, month, idx) {
  const labelEl = document.getElementById('calNavLabel');
  if (labelEl) labelEl.textContent = `${MONTHS[month]} ${year}`;

  const today       = todayYMD();
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let html = '';

  for (let i = 0; i < firstDow; i++) html += `<div class="cal-day cal-day--empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = ymd(year, month, d);
    const evs = idx[ds] || [];
    const cls = ['cal-day',
      ds === today ? 'cal-day--today' : '',
      ds < today   ? 'cal-day--past'  : '',
      evs.length   ? 'cal-day--has-events' : '',
    ].filter(Boolean).join(' ');

    const pills = evs.slice(0, 2).map(ev =>
      `<div class="cal-event-pill ${getCat(ev.category).pill}${ev.cancelled ? ' cal-event-pill--cancelled' : ''}" data-id="${ev.id}">${ev.title}</div>`
    ).join('');
    const more = evs.length > 2 ? `<div class="cal-day__more">+${evs.length - 2} más</div>` : '';
    const dots = evs.slice(0, 4).map(ev =>
      `<span class="cal-day__dot-single ${getCat(ev.category).dot}${ev.cancelled ? ' cal-day__dot-single--cancelled' : ''}"></span>`
    ).join('');

    html += `
      <div class="${cls}" data-date="${ds}">
        <div class="cal-day__num">${d}</div>
        <div class="cal-day__events">${pills}${more}</div>
        <div class="cal-day__dot-row">${dots}</div>
      </div>`;
  }

  const daysEl = document.getElementById('calDays');
  if (!daysEl) return;
  daysEl.innerHTML = html;

  daysEl.querySelectorAll('.cal-day--has-events').forEach(cell => {
    cell.addEventListener('click', e => {
      const evs  = idx[cell.dataset.date] || [];
      const pill = e.target.closest('[data-id]');
      const ev   = pill ? allEvents.find(x => x.id === pill.dataset.id) : evs[0];
      if (!ev) return;
      // Special events → detail page; regular events → modal
      if (ev._source === 'evt') {
        window.location.href = `/eventos/evento.html?id=${ev.id.replace('evt-', '')}`;
      } else {
        openModal(ev);
      }
    });
  });
}

// ─── Tab: Special Events ─────────────────────────────────────────────────────
function renderSpecialTab(container, year, month) {
  const today      = todayYMD();
  const monthStart = ymd(year, month, 1);
  const monthEnd   = ymd(year, month, new Date(year, month + 1, 0).getDate());
  const list = specialEvs.filter(e =>
    e.date >= monthStart && e.date <= monthEnd && e.date >= today
  );

  if (!list.length) {
    container.innerHTML = `<p class="cal-list__empty">No hay eventos especiales este mes.</p>`;
    return;
  }

  // Group by date
  const groups = new Map();
  for (const ev of list) {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  }

  let html = '';
  for (const [date, evs] of groups) {
    const [y, m, d] = date.split('-').map(Number);
    const dow   = DAYS_L[new Date(y, m - 1, d).getDay()];
    const label = `${dow}, ${d} de ${MONTHS[m - 1]}`;
    html += `<div class="cal-up-group"><div class="cal-up-day-label">${label}</div>`;
    for (const ev of evs) {
      const color = CAT_COLORS[ev.category || 'otro'] || '#888';
      const imgHtml = ev.image_url
        ? `<img class="cal-up-thumb" src="${ev.image_url}" alt="" loading="lazy">`
        : `<span class="cal-up-dot" style="background:${color}"></span>`;
      html += `
        <a class="cal-up-item cal-up-item--link" href="/eventos/evento.html?id=${ev.id}">
          ${imgHtml}
          <div class="cal-up-info">
            <div class="cal-up-name">${ev.title}</div>
            <div class="cal-up-meta">
              ${ev.time     ? `<span>${ev.time}</span>` : ''}
              ${ev.location ? `<span>· ${ev.location.split(',')[0]}</span>` : ''}
            </div>
          </div>
          <i class="fas fa-chevron-right cal-up-chevron"></i>
        </a>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

// ─── Tab: Regular Activities ──────────────────────────────────────────────────
function renderRegularTab(container, year, month) {
  const today = todayYMD();
  const days  = new Date(year, month + 1, 0).getDate();
  const list  = [];

  for (let d = 1; d <= days; d++) {
    const ds  = ymd(year, month, d);
    const evs = regularEvs.filter(ev => ev.date === ds && ds >= today);
    evs.forEach(ev => list.push(ev));
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="cal-list__title">${MONTHS[month]} ${year}</div>
      <p class="cal-list__empty">Sin actividades próximas este mes.</p>`;
    return;
  }

  // Group by date
  const groups = new Map();
  for (const ev of list) {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  }

  let html = `<div class="cal-list__title">${MONTHS[month]} ${year}</div>`;
  for (const [date, evs] of groups) {
    const [y, m, d] = date.split('-').map(Number);
    const dow   = DAYS_L[new Date(y, m - 1, d).getDay()];
    const label = `${dow}, ${d} de ${MONTHS[m - 1]}`;
    html += `<div class="cal-up-group"><div class="cal-up-day-label">${label}</div>`;
    for (const ev of evs) {
      const color       = CAT_COLORS[ev.category || 'otro'] || '#888';
      const isCancelled = ev.cancelled;
      html += `
        <div class="cal-up-item${isCancelled ? ' cancelled' : ''}" data-id="${ev.id}" style="cursor:pointer">
          <span class="cal-up-dot" style="background:${color}"></span>
          <div class="cal-up-info">
            <div class="cal-up-name">
              ${ev.title}
              ${isCancelled ? '<span class="cal-up-badge cal-up-badge--cancelled">Cancelado</span>' : ''}
            </div>
            <div class="cal-up-meta">
              ${ev.time     ? `<span>${ev.time}</span>` : ''}
              ${ev.location ? `<span>· ${ev.location.split(',')[0]}</span>` : ''}
            </div>
          </div>
          <i class="fas fa-chevron-right cal-up-chevron${isCancelled ? ' hidden' : ''}"></i>
        </div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;

  container.querySelectorAll('.cal-up-item[data-id]').forEach(item => {
    item.addEventListener('click', () => {
      const ev = regularEvs.find(x => x.id === item.dataset.id);
      if (ev) openModal(ev);
    });
  });
}

// ─── Render everything ────────────────────────────────────────────────────────
function render(year, month) {
  const idx = buildIndex();
  renderGrid(year, month, idx);

  const specialContainer  = document.getElementById('calTabSpecial');
  const regularContainer  = document.getElementById('calTabRegular');
  if (specialContainer) renderSpecialTab(specialContainer, year, month);
  if (regularContainer)  renderRegularTab(regularContainer, year, month);
}

// ─── Modal (for regular events only) ────────────────────────────────────────
function openModal(ev) {
  const content = document.getElementById('calModalContent');
  if (!content) return;

  const meta   = getCat(ev.category);
  const today  = todayYMD();
  const isPast = ev.date && ev.date < today;

  let dateLabel = '';
  if (ev.date) {
    const [y, m, d] = ev.date.split('-').map(Number);
    dateLabel = `${DAYS_L[new Date(y, m - 1, d).getDay()]}, ${d} de ${MONTHS[m - 1]} ${y}`;
  }

  const SVG = {
    cal:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    time: `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    loc:  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  };

  content.innerHTML = `
    ${ev.cancelled ? `<div class="cal-modal__cancelled-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2" style="width:16px;height:16px;stroke:currentColor;flex-shrink:0">
        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg> Este evento ha sido cancelado
    </div>` : ''}
    <div class="cal-modal__badge ${meta.pill}">
      <span class="cal-modal__badge-dot ${meta.dot}"></span> ${meta.label}
    </div>
    <div class="cal-modal__title${ev.cancelled || isPast ? ' cal-modal__title--crossed' : ''}" id="calModalTitle">${ev.title}</div>
    <div class="cal-modal__rows">
      ${dateLabel   ? `<div class="cal-modal__row"><div class="cal-modal__row-icon">${SVG.cal}</div><div class="cal-modal__row-text">${dateLabel}</div></div>`  : ''}
      ${ev.time     ? `<div class="cal-modal__row"><div class="cal-modal__row-icon">${SVG.time}</div><div class="cal-modal__row-text">${ev.time}</div></div>`    : ''}
      ${ev.location ? `<div class="cal-modal__row"><div class="cal-modal__row-icon">${SVG.loc}</div><div class="cal-modal__row-text">${ev.location}</div></div>` : ''}
    </div>
    ${ev.description ? `<div class="cal-modal__description">${ev.description}</div>` : ''}`;

  document.getElementById('calModalBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('calModalBackdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.cal-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cal-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.cal-tab-panel').forEach(p => p.hidden = true);
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.target);
      if (target) target.hidden = false;
    });
  });
}

// ─── Sticky nav + burger ─────────────────────────────────────────────────────
document.addEventListener('header:ready', () => {
  setupStickyNav();
  setupBurgerMenu();
});

// ─── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderLegend();
  renderWeekdays();
  initTabs();
  render(viewYear, viewMonth);  // empty grid first

  await loadFromSupabase();
  render(viewYear, viewMonth);  // real data

  document.getElementById('calPrev')?.addEventListener('click', () => {
    if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
    render(viewYear, viewMonth);
  });
  document.getElementById('calNext')?.addEventListener('click', () => {
    if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
    render(viewYear, viewMonth);
  });

  document.getElementById('calModalClose')?.addEventListener('click', closeModal);
  document.getElementById('calModalBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
});