// js/pages/eventos/hub.js
// ─────────────────────────────────────────────────────────────────────────────
// Unified public events hub — three views in one page (Church Center style):
//   • Lista   — mini month calendar + Featured + Upcoming list
//   • Mes     — full month grid (shared CalendarGrid)
//   • Galería — image cards
// Plus a category filter. Merges three sources:
//   calendar_events (recurring activities) · events (special) · special_events
//   (registration events — shown with a "Inscripciones disponibles" badge).
// This replaces the old /eventos list AND folds in /calendario (Month view).
// ─────────────────────────────────────────────────────────────────────────────

import { sb }           from '/js/lib/supabase.js';
import { CalendarGrid } from '/js/components/CalendarGrid.js';
import { esc }          from '/js/utils/escape.js';
import { renderRichText, htmlIsEmpty } from '/js/lib/sanitize-html.js';

const DAYS_S = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_L = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CATS = {
  servicio:       'Servicio',
  estudio:        'Estudio Bíblico',
  oracion:        'Oración',
  evangelizacion: 'Evangelización',
  especial:       'Especial',
  registro:       'Con inscripción',
  otro:           'Otro',
};

const pad      = n => String(n).padStart(2, '0');
const ymd      = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayYMD = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); };
const $ = (id) => document.getElementById(id);

// ─── State ──────────────────────────────────────────────────────────────────
let view      = 'list';
let category  = '';
let allEvents = [];
let viewYear  = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let miniYear  = viewYear;
let miniMonth = viewMonth;

const grid = new CalendarGrid({
  weekdaysEl: 'calWeekdays', daysEl: 'calDays', labelEl: 'calNavLabel',
  mode: 'public', onEventClick: ev => openModal(ev),
});

// ─── Data ─────────────────────────────────────────────────────────────────────
async function load() {
  const [cal, evt, reg] = await Promise.all([
    sb.from('calendar_events').select('id, title, date, time, location, description, category, cancelled').order('date'),
    sb.from('events').select('id, title, starts_at, location, description, image_url, tag').order('starts_at'),
    sb.from('special_events').select('id, title, slug, image_url, description, event_at, location, registration_open').order('event_at'),
  ]);

  const regular = (cal.data || []).map(r => ({
    id: r.id, title: r.title, date: r.date, time: r.time || '', location: r.location || '',
    description: r.description || '', category: r.category || 'otro', cancelled: !!r.cancelled,
    image_url: '', _source: 'cal', url: null, signup: false,
  }));

  const special = (evt.data || []).filter(r => r.starts_at).map(r => {
    const d = new Date(r.starts_at);
    return {
      id: `evt-${r.id}`, title: r.title || 'Evento', date: ymd(d.getFullYear(), d.getMonth(), d.getDate()),
      time: `${(d.getHours() % 12) || 12}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`,
      location: r.location || '', description: r.description || '', category: 'especial', cancelled: false,
      image_url: r.image_url || '', _source: 'evt',
      url: `/eventos/evento.html?id=${encodeURIComponent(r.id)}`, signup: false,
    };
  });

  const registration = (reg.data || []).filter(r => r.event_at).map(r => {
    const d = new Date(r.event_at);
    return {
      id: `reg-${r.id}`, title: r.title || 'Evento', date: ymd(d.getFullYear(), d.getMonth(), d.getDate()),
      time: `${(d.getHours() % 12) || 12}:${pad(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`,
      location: r.location || '', description: r.description || '', category: 'registro', cancelled: false,
      image_url: r.image_url || '', _source: 'reg',
      url: `/eventos/evento-especial.html?e=${encodeURIComponent(r.slug)}`, signup: !!r.registration_open,
    };
  });

  // Exclude the routine recurring services (Sunday service, Bible study, prayer
  // service) — they're predictable weekly rhythm, not "events", and listing them
  // just buries the special ones.
  const HIDE = new Set(['servicio', 'estudio', 'oracion']);
  allEvents = [...regular, ...special, ...registration]
    .filter(e => !HIDE.has(e.category))
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  buildCategoryOptions();
}

function buildCategoryOptions() {
  const sel = $('evhubCategory');
  if (!sel) return;
  const present = [...new Set(allEvents.map(e => e.category))];
  const order = Object.keys(CATS).filter(k => present.includes(k));
  sel.innerHTML = `<option value="">Todas las categorías</option>` +
    order.map(k => `<option value="${k}">${esc(CATS[k])}</option>`).join('');
  sel.value = category;
}

// ─── Filtering ────────────────────────────────────────────────────────────────
const filtered    = () => category ? allEvents.filter(e => e.category === category) : allEvents;
const upcoming     = (list) => { const t = todayYMD(); return list.filter(e => e.date >= t); };

// ─── Render dispatch ───────────────────────────────────────────────────────────
function render() {
  ['list', 'month', 'gallery'].forEach(v => { const p = $(`evhub-${v}`); if (p) p.hidden = v !== view; });
  document.querySelectorAll('.evhub__view').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'list')    renderList();
  if (view === 'month')   renderMonth();
  if (view === 'gallery') renderGallery();
}

// ─── List view ──────────────────────────────────────────────────────────────
function renderList() {
  renderMini();
  renderFeatured();
  renderUpcoming();
}

function renderMini() {
  $('evhubMiniLabel').textContent = `${MONTHS[miniMonth]} ${miniYear}`;
  const today  = todayYMD();
  const first  = new Date(miniYear, miniMonth, 1).getDay();
  const days   = new Date(miniYear, miniMonth + 1, 0).getDate();
  const byDate = new Map();
  filtered().forEach(e => { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); });

  let html = DAYS_S.map(d => `<span class="evhub-mini__wd">${d}</span>`).join('');
  for (let i = 0; i < first; i++) html += `<span class="evhub-mini__cell evhub-mini__cell--empty"></span>`;
  for (let d = 1; d <= days; d++) {
    const ds = ymd(miniYear, miniMonth, d);
    const has = byDate.has(ds);
    const cls = ['evhub-mini__cell', ds === today ? 'is-today' : '', has ? 'has-events' : ''].filter(Boolean).join(' ');
    html += `<span class="${cls}">${d}${has ? '<span class="evhub-mini__dot"></span>' : ''}</span>`;
  }
  $('evhubMiniGrid').innerHTML = html;
}

function renderFeatured() {
  const host = $('evhubFeatured');
  // Destacado = only the truly special, sign-up events (registration events like
  // EVB). The monthly scheduled "special" events (Caballeros, Damas, Vigilia… in
  // the events table) are predictable rhythm — they stay in the list below, not
  // here. Registration events are their own thing, so they're the right tag.
  const feat = upcoming(filtered())
    .filter(e => e._source === 'reg')
    .slice(0, 3);
  if (!feat.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<h2 class="evhub__h">Destacado</h2>` + feat.map(e => `
    <a class="evhub-feat" href="${e.url || '#'}">
      ${e.image_url ? `<img class="evhub-feat__img" src="${esc(e.image_url)}" alt="" loading="lazy">`
                    : `<span class="evhub-feat__img evhub-feat__img--ph"><i class="fas fa-calendar-star"></i></span>`}
      <div class="evhub-feat__body">
        <div class="evhub-feat__title">${esc(e.title)}</div>
        <div class="evhub-feat__date">${esc(longDate(e.date))}${e.time ? ' · ' + esc(e.time) : ''}</div>
        ${e.signup ? `<span class="evhub-badge evhub-badge--signup">Inscripciones disponibles</span>` : ''}
      </div>
    </a>`).join('');
}

function renderUpcoming() {
  const host = $('evhubUpcoming');
  const list = upcoming(filtered());
  if (!list.length) { host.innerHTML = `<p class="evhub__empty">No hay eventos próximos.</p>`; return; }

  // Group by month, then by day
  let html = '', curMonth = '', curDay = '';
  for (const e of list) {
    const [y, m, d] = e.date.split('-').map(Number);
    const monthKey = `${MONTHS[m - 1]} ${y}`;
    if (monthKey !== curMonth) { curMonth = monthKey; curDay = ''; html += `<div class="evhub-up__month">${monthKey}</div>`; }
    const dayKey = e.date;
    if (dayKey !== curDay) {
      curDay = dayKey;
      html += `<div class="evhub-up__day">${DAYS_L[new Date(y, m - 1, d).getDay()].toUpperCase()}, ${d} ${MONTHS[m - 1].slice(0, 3).toUpperCase()}</div>`;
    }
    html += rowHtml(e);
  }
  host.innerHTML = html;
  wireRows(host);
}

function rowHtml(e) {
  const tag   = e.url ? 'a' : 'button';
  const attrs = e.url ? `href="${e.url}"` : `type="button" data-id="${esc(e.id)}"`;
  const meta  = [e.time, e.location ? e.location.split(',')[0] : ''].filter(Boolean).join(' · ');
  return `
    <${tag} class="evhub-up__item${e.cancelled ? ' is-cancelled' : ''}" ${attrs}>
      <span class="evhub-up__dot cat--${esc(e.category)}"></span>
      <span class="evhub-up__info">
        <span class="evhub-up__name">${esc(e.title)}${e.cancelled ? ' <span class="evhub-up__cx">Cancelado</span>' : ''}</span>
        ${meta ? `<span class="evhub-up__meta">${esc(meta)}</span>` : ''}
        ${e.signup ? `<span class="evhub-badge evhub-badge--signup">Inscripciones disponibles</span>` : ''}
      </span>
      <i class="fas fa-chevron-right evhub-up__chev"></i>
    </${tag}>`;
}

function wireRows(host) {
  host.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => {
    const ev = allEvents.find(x => x.id === b.dataset.id);
    if (ev) openModal(ev);
  }));
}

// ─── Month view ─────────────────────────────────────────────────────────────
function renderMonth() {
  $('calNavLabel') && grid.render(viewYear, viewMonth, filtered());
}

// ─── Gallery view ───────────────────────────────────────────────────────────
function renderGallery() {
  const host = $('evhubGallery');
  const list = upcoming(filtered());
  if (!list.length) { host.innerHTML = `<p class="evhub__empty">No hay eventos próximos.</p>`; return; }
  host.innerHTML = list.map(e => `
    <a class="evhub-card" ${e.url ? `href="${e.url}"` : `href="#" data-id="${esc(e.id)}"`}>
      <div class="evhub-card__media">
        ${e.image_url ? `<img src="${esc(e.image_url)}" alt="" loading="lazy">`
                      : `<span class="evhub-card__ph cat--${esc(e.category)}"><i class="fas fa-calendar-day"></i></span>`}
      </div>
      <div class="evhub-card__body">
        <div class="evhub-card__title">${esc(e.title)}</div>
        <div class="evhub-card__date">${esc(longDate(e.date))}${e.time ? ' · ' + esc(e.time) : ''}</div>
        ${e.signup ? `<span class="evhub-badge evhub-badge--signup">Inscripciones disponibles</span>` : ''}
      </div>
    </a>`).join('');
  host.querySelectorAll('a[data-id]').forEach(a => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    const e = allEvents.find(x => x.id === a.dataset.id);
    if (e) openModal(e);
  }));
}

// ─── Modal (regular events only) ────────────────────────────────────────────
function openModal(ev) {
  const c = $('evhubModalContent');
  if (!c) return;
  c.innerHTML = `
    ${ev.cancelled ? `<div class="evhub-modal__cx">Este evento ha sido cancelado</div>` : ''}
    <span class="evhub-up__dot cat--${esc(ev.category)}" style="width:12px;height:12px"></span>
    <h2 class="evhub-modal__title">${esc(ev.title)}</h2>
    <div class="evhub-modal__rows">
      <div><i class="fas fa-calendar"></i> ${esc(longDate(ev.date))}</div>
      ${ev.time ? `<div><i class="fas fa-clock"></i> ${esc(ev.time)}</div>` : ''}
      ${ev.location ? `<div><i class="fas fa-location-dot"></i> ${esc(ev.location)}</div>` : ''}
    </div>
    ${ev.description && !htmlIsEmpty(ev.description) ? `<div class="evhub-modal__desc rich-content">${renderRichText(ev.description)}</div>` : ''}`;
  $('evhubModalBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('evhubModalBackdrop')?.classList.remove('open'); document.body.style.overflow = ''; }

// ─── Helpers ────────────────────────────────────────────────────────────────
function longDate(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return `${DAYS_L[new Date(y, m - 1, d).getDay()]}, ${d} de ${MONTHS[m - 1]} ${y}`;
}

// ─── Boot ───────────────────────────────────────────────────────────────────
function init() {
  if (init._done) return; init._done = true;

  // Deep-link a starting view, e.g. /eventos?view=month (used by the nav's
  // "Calendario" entry now that the calendar is folded in here).
  const urlView = new URLSearchParams(location.search).get('view');
  if (['list', 'month', 'gallery'].includes(urlView)) view = urlView;

  document.querySelectorAll('.evhub__view').forEach(b =>
    b.addEventListener('click', () => { view = b.dataset.view; render(); }));
  $('evhubCategory')?.addEventListener('change', (e) => { category = e.target.value; render(); });

  $('evhubMiniPrev')?.addEventListener('click', () => { if (--miniMonth < 0) { miniMonth = 11; miniYear--; } renderMini(); });
  $('evhubMiniNext')?.addEventListener('click', () => { if (++miniMonth > 11) { miniMonth = 0; miniYear++; } renderMini(); });
  $('calPrev')?.addEventListener('click', () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } renderMonth(); });
  $('calNext')?.addEventListener('click', () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } renderMonth(); });

  $('evhubModalClose')?.addEventListener('click', closeModal);
  $('evhubModalBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  render();   // empty shell first (instant)
  load().then(render).catch(err => {
    console.warn('[events-hub] load failed:', err);
    const u = $('evhubUpcoming'); if (u) u.innerHTML = `<p class="evhub__empty">No pudimos cargar los eventos. Intenta más tarde.</p>`;
  });
}

document.addEventListener('includes:ready', init);
if (document.documentElement.classList.contains('ready')) init();
