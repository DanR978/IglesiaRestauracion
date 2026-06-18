// js/components/calendar.js
// Public calendar page — uses the shared CalendarGrid component.

import { sb }            from '/js/lib/supabase.js';
import { CalendarGrid }  from '/js/components/CalendarGrid.js';
import { setupStickyNav, setupBurgerMenu } from '/js/app/ui.js';
import { esc }           from '/js/utils/escape.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATS = {
  servicio:       { label: 'Servicio',       dot: 'dot--servicio'       },
  estudio:        { label: 'Estudio Bíblico', dot: 'dot--estudio'        },
  oracion:        { label: 'Oración',         dot: 'dot--oracion'        },
  evangelizacion: { label: 'Evangelización',  dot: 'dot--evangelizacion' },
  especial:       { label: 'Especial',        dot: 'dot--especial'       },
  otro:           { label: 'Otro',            dot: 'dot--otro'           },
};

const DAYS_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const pad      = n => String(n).padStart(2, '0');
const ymd      = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayYMD = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };

// ─── State ────────────────────────────────────────────────────────────────────
let viewYear   = new Date().getFullYear();
let viewMonth  = new Date().getMonth();
let regularEvs = [];   // from calendar_events
let specialEvs = [];   // from events table
let allEvents  = [];   // merged for CalendarGrid

// ─── CalendarGrid instance ────────────────────────────────────────────────────
const grid = new CalendarGrid({
  weekdaysEl:  'calWeekdays',
  daysEl:      'calDays',
  labelEl:     'calNavLabel',
  mode:        'public',
  onEventClick: ev => openModal(ev),
});

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadFromSupabase() {
  // Recurring activities (calendar_events)
  const { data: calData, error: calErr } = await sb
    .from('calendar_events')
    .select('id, title, date, time, location, description, category, cancelled')
    .order('date');
  if (calErr) console.warn('[calendar] calendar_events:', calErr.message);
  regularEvs = (calData || []).map(r => ({ ...r, _source: 'cal' }));

  // Special events (events table)
  const { data: evData, error: evErr } = await sb
    .from('events')
    .select('id, title, starts_at, location, description, image_url, tag')
    .order('starts_at');
  if (evErr) console.warn('[calendar] events:', evErr.message);

  specialEvs = (evData || []).map(row => {
    if (!row.starts_at) return null;
    const d = new Date(row.starts_at);
    return {
      id:          row.id,
      _id_cal:     `evt-${row.id}`,
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

  // Merged list: use _id_cal as the id that CalendarGrid stores in data-id
  allEvents = [
    ...regularEvs,
    ...specialEvs.map(e => ({ ...e, id: e._id_cal })),
  ].sort((a, b) => (a.date > b.date ? 1 : -1));
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function renderLegend() {
  const el = document.getElementById('calLegend');
  if (!el) return;
  el.innerHTML = Object.entries(CATS).map(([, m]) => `
    <div class="cal-legend__item">
      <span class="cal-legend__dot ${m.dot}"></span>
      <span>${m.label}</span>
    </div>`).join('');
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render(year, month) {
  grid.render(year, month, allEvents);
  renderSpecialTab(document.getElementById('calTabSpecial'),  year, month);
  renderRegularTab(document.getElementById('calTabRegular'),  year, month);
}

// ─── Special events tab ───────────────────────────────────────────────────────
function renderSpecialTab(container, year, month) {
  if (!container) return;
  const today      = todayYMD();
  const monthStart = ymd(year, month, 1);
  const monthEnd   = ymd(year, month, new Date(year, month + 1, 0).getDate());
  const list       = specialEvs.filter(e =>
    e.date >= monthStart && e.date <= monthEnd && e.date >= today
  );

  if (!list.length) {
    container.innerHTML = `<p class="cal-list__empty">No hay eventos especiales este mes.</p>`;
    return;
  }

  const groups = new Map();
  for (const ev of list) {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  }

  let html = '';
  for (const [date, evs] of groups) {
    const [y, m, d] = date.split('-').map(Number);
    const label = `${DAYS_L[new Date(y, m - 1, d).getDay()]}, ${d} de ${MONTHS[m - 1]}`;
    html += `<div class="cal-up-group"><div class="cal-up-day-label">${label}</div>`;
    for (const ev of evs) {
      const imgHtml = ev.image_url
        ? `<img class="cal-up-thumb" src="${esc(ev.image_url)}" alt="" loading="lazy">`
        : `<span class="cal-up-dot dot--especial"></span>`;
      html += `
        <a class="cal-up-item cal-up-item--link" href="/eventos/evento.html?id=${encodeURIComponent(ev.id)}">
          ${imgHtml}
          <div class="cal-up-info">
            <div class="cal-up-name">${esc(ev.title)}</div>
            <div class="cal-up-meta">
              ${ev.time     ? `<span>${esc(ev.time)}</span>` : ''}
              ${ev.location ? `<span>· ${esc(ev.location.split(',')[0])}</span>` : ''}
            </div>
          </div>
          <i class="fas fa-chevron-right cal-up-chevron"></i>
        </a>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

// ─── Regular activities tab ───────────────────────────────────────────────────
function renderRegularTab(container, year, month) {
  if (!container) return;
  const today = todayYMD();
  const days  = new Date(year, month + 1, 0).getDate();

  const list = [];
  for (let d = 1; d <= days; d++) {
    const ds  = ymd(year, month, d);
    if (ds < today) continue;
    regularEvs.filter(ev => ev.date === ds).forEach(ev => list.push(ev));
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="cal-list__title">${MONTHS[month]} ${year}</div>
      <p class="cal-list__empty">Sin actividades próximas este mes.</p>`;
    return;
  }

  const groups = new Map();
  for (const ev of list) {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  }

  let html = `<div class="cal-list__title">${MONTHS[month]} ${year}</div>`;
  for (const [date, evs] of groups) {
    const [y, m, d] = date.split('-').map(Number);
    const label = `${DAYS_L[new Date(y, m - 1, d).getDay()]}, ${d} de ${MONTHS[m - 1]}`;
    html += `<div class="cal-up-group"><div class="cal-up-day-label">${label}</div>`;
    for (const ev of evs) {
      const isCancelled = ev.cancelled;
      const cat = CATS[ev.category] || CATS.otro;
      html += `
        <div class="cal-up-item${isCancelled ? ' cancelled' : ''}" data-id="${esc(ev.id)}" style="cursor:pointer">
          <span class="cal-up-dot ${cat.dot}${isCancelled ? ' cal-up-dot--cancelled' : ''}"></span>
          <div class="cal-up-info">
            <div class="cal-up-name">
              ${esc(ev.title)}
              ${isCancelled ? '<span class="cal-up-badge cal-up-badge--cancelled">Cancelado</span>' : ''}
            </div>
            <div class="cal-up-meta">
              ${ev.time     ? `<span>${esc(ev.time)}</span>` : ''}
              ${ev.location ? `<span>· ${esc(ev.location.split(',')[0])}</span>` : ''}
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

// ─── Modal (regular events only) ─────────────────────────────────────────────
function openModal(ev) {
  const content = document.getElementById('calModalContent');
  if (!content) return;

  const cat    = CATS[ev.category] || CATS.otro;
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
    <div class="cal-modal__badge cat--${esc(ev.category || 'otro')}">
      <span class="cal-modal__badge-dot ${cat.dot}"></span> ${cat.label}
    </div>
    <div class="cal-modal__title${ev.cancelled || isPast ? ' cal-modal__title--crossed' : ''}" id="calModalTitle">${esc(ev.title)}</div>
    <div class="cal-modal__rows">
      ${dateLabel   ? `<div class="cal-modal__row"><div class="cal-modal__row-icon">${SVG.cal}</div><div class="cal-modal__row-text">${esc(dateLabel)}</div></div>`  : ''}
      ${ev.time     ? `<div class="cal-modal__row"><div class="cal-modal__row-icon">${SVG.time}</div><div class="cal-modal__row-text">${esc(ev.time)}</div></div>`    : ''}
      ${ev.location ? `<div class="cal-modal__row"><div class="cal-modal__row-icon">${SVG.loc}</div><div class="cal-modal__row-text">${esc(ev.location)}</div></div>` : ''}
    </div>
    ${ev.description ? `<div class="cal-modal__description">${esc(ev.description)}</div>` : ''}`;

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

// ─── Sticky nav ───────────────────────────────────────────────────────────────
document.addEventListener('header:ready', () => {
  setupStickyNav();
  setupBurgerMenu();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  renderLegend();
  initTabs();
  render(viewYear, viewMonth);       // empty grid first

  // Wire navigation BEFORE the network call so the calendar is always
  // interactive even if Supabase is slow or unreachable.
  document.getElementById('calPrev')?.addEventListener('click', () => {
    if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
    render(viewYear, viewMonth);
  });
  document.getElementById('calNext')?.addEventListener('click', () => {
    if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
    render(viewYear, viewMonth);
  });

  try {
    await loadFromSupabase();
    render(viewYear, viewMonth);       // real data
  } catch (err) {
    console.warn('[calendar] load failed:', err);
    // Grid still works (empty); surface a quiet note in the special-events tab.
    const special = document.getElementById('calTabSpecial');
    if (special) special.innerHTML = `<p class="cal-list__empty">No pudimos cargar los eventos en este momento. Vuelve a intentarlo más tarde.</p>`;
  }

  document.getElementById('calModalClose')?.addEventListener('click', closeModal);
  document.getElementById('calModalBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
});