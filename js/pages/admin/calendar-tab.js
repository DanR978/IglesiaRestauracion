// js/pages/admin/calendar-tab.js
// Admin calendar tab — uses the shared CalendarGrid component.

import { CalendarGrid } from '/js/components/CalendarGrid.js';
import {
  sb, pad2, todayISO, MONTHS, DAY_NAMES, CAT_COLORS,
  calEventsList, admCalYear, admCalMonth,
  setCalEvents, setCalView,
  filterEventsByMinistry, normalizeEventsRow, ministries,
} from './state.js';
import { toast, confirm, openModal } from './ui.js';
import { onFilterChange } from './filters.js';
import { loadUpcoming } from './events-tab.js';

// Re-render grid when ministry filter changes
onFilterChange(() => {
  if (document.getElementById('tab-calendario')?.classList.contains('active')) {
    _renderGrid();
    _renderUpcomingTabs();
  }
});

// ─── Shared CalendarGrid instance ────────────────────────────────────────────
const grid = new CalendarGrid({
  weekdaysEl:   'admCalWeekdays',
  daysEl:       'admCalDays',
  labelEl:      'admCalLabel',
  mode:         'admin',
  onEventClick: ev => _openEventModal(ev),
  onEventEdit:  ev => calEdit(ev?.id),
  onEventCancel:(ev, wasCancelled) => calToggle(ev?.id, wasCancelled),
  onEventDelete:(ev, title) => calDelete(ev?.id, title || ev?.title),
});

// ─── Load data ────────────────────────────────────────────────────────────────
export async function loadCalendario() {
  const { data: calData, error: calErr } = await sb
    .from('calendar_events').select('*,ministries(name,color)').order('date', { ascending: true });
  if (calErr) { toast('Error cargando calendario: ' + calErr.message, 'error'); return; }

  const { data: evRows, error: evErr } = await sb
    .from('events').select('id,title,starts_at,location,description,tag,image_url,ministry_id')
    .order('starts_at', { ascending: true });
  if (evErr) console.warn('[cal] events:', evErr.message);

  function resolveMinistry(mid) {
    if (!mid) return null;
    const m = ministries.find(x => x.id === mid);
    return m ? { name: m.name, color: m.color } : null;
  }

  const evMapped = (evRows || []).map(row => {
    if (!row?.starts_at) return null;
    const d = new Date(row.starts_at);
    const lp = n => String(n).padStart(2, '0');
    return {
      id: `evt-${row.id}`,
      title: row.title || 'Evento',
      date: `${d.getFullYear()}-${lp(d.getMonth()+1)}-${lp(d.getDate())}`,
      time: `${(d.getHours()%12)||12}:${lp(d.getMinutes())} ${d.getHours()>=12?'PM':'AM'}`,
      location: row.location||'', description: row.description||'',
      category: 'especial', cancelled: false,
      ministry_id: row.ministry_id||null,
      ministries: resolveMinistry(row.ministry_id),
      image_url: row.image_url||null,
      fromEventsTable: true, _source: 'evt',
    };
  }).filter(Boolean);

  const calMapped = (calData||[]).map(row => ({
    ...row,
    ministries: row.ministries || resolveMinistry(row.ministry_id),
    _source: 'cal',
  }));

  setCalEvents([...calMapped, ...evMapped].sort((a,b) => a.date > b.date ? 1 : -1));
  _renderGrid();
  _renderUpcomingTabs();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function _renderGrid() {
  const filtered = filterEventsByMinistry(calEventsList);
  grid.render(admCalYear, admCalMonth, filtered);
}

function _renderUpcomingTabs() {
  // Wire tab buttons once
  document.querySelectorAll('[data-adm-target]').forEach(btn => {
    if (btn.dataset.admWired) return;
    btn.dataset.admWired = '1';
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-adm-target]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#admCalUpcoming [id^="admTab"]').forEach(p => p.hidden = true);
      btn.classList.add('active');
      const t = document.getElementById(btn.dataset.admTarget);
      if (t) t.hidden = false;
    });
  });

  const today      = todayISO();
  const lp         = n => String(n).padStart(2, '0');
  const monthStart = `${admCalYear}-${lp(admCalMonth+1)}-01`;
  const lastDay    = new Date(admCalYear, admCalMonth+1, 0).getDate();
  const monthEnd   = `${admCalYear}-${lp(admCalMonth+1)}-${lp(lastDay)}`;

  const allFiltered = filterEventsByMinistry(calEventsList)
    .filter(ev => ev.date >= monthStart && ev.date <= monthEnd);

  _renderTab(
    document.getElementById('admTabSpecial'),
    allFiltered.filter(ev =>  ev.fromEventsTable && ev.date >= today),
    true
  );
  _renderTab(
    document.getElementById('admTabRegular'),
    allFiltered.filter(ev => !ev.fromEventsTable && ev.date >= today),
    false
  );
}

function _renderTab(container, evs, isSpecial) {
  if (!container) return;
  if (!evs.length) {
    container.innerHTML = `<p class="adm-list__empty">${isSpecial ? 'No hay eventos especiales este mes.' : 'Sin actividades este mes.'}</p>`;
    return;
  }

  const groups = new Map();
  for (const ev of evs) {
    if (!groups.has(ev.date)) groups.set(ev.date, []);
    groups.get(ev.date).push(ev);
  }

  let html = '';
  for (const [date, dayEvs] of groups) {
    const [y, mo, d] = date.split('-').map(Number);
    const label = `${DAY_NAMES[new Date(y, mo-1, d).getDay()]}, ${d} de ${MONTHS[mo-1]}`;
    html += `<div class="adm-list__day-group"><div class="adm-list__day-label">${label}</div>`;
    for (const ev of dayEvs) {
      const color       = CAT_COLORS[ev.category||'otro'] || '#888';
      const isCancelled = ev.cancelled;
      const minName     = ev.ministries?.name || '';
      const safeTitle   = (ev.title||'').replace(/'/g, "\\'");

      const imgHtml = isSpecial && ev.image_url
        ? `<img class="adm-list__thumb" src="${ev.image_url}" alt="" loading="lazy">`
        : `<span class="adm-list__dot" style="background:${color}"></span>`;

      const editAction   = isSpecial ? `window.__adminEditSpecial('${ev.id.replace('evt-','')}')`  : `calEdit('${ev.id}')`;
      const cancelAction = isSpecial ? `window.__adminToggleCancel('${ev.id}',${isCancelled})`     : `calToggle('${ev.id}',${isCancelled})`;
      const deleteAction = isSpecial ? `window.__adminDeleteEvent('${ev.id}','${safeTitle}',true)` : `calDelete('${ev.id}','${safeTitle}')`;

      html += `
        <div class="adm-list__item${isCancelled?' cancelled':''}">
          ${imgHtml}
          <div class="adm-list__info">
            <div class="adm-list__name">
              ${ev.title}
              ${isCancelled ? '<span class="adm-list__cancelled-badge">Cancelado</span>' : ''}
            </div>
            <div class="adm-list__meta">
              ${ev.time   ? `<span><i class="far fa-clock" style="margin-right:3px;opacity:.6"></i>${ev.time}</span>` : ''}
              ${minName   ? `<span>· ${minName}</span>` : ''}
            </div>
          </div>
          <div class="adm-list__actions">
            <button class="icon-btn__admin" onclick="event.stopPropagation();${editAction}"><i class="fas fa-pen"></i></button>
            <button class="icon-btn__admin ${isCancelled?'success':'warn'}" onclick="event.stopPropagation();${cancelAction}">
              <i class="fas fa-${isCancelled?'undo':'ban'}"></i>
            </button>
            <button class="icon-btn__admin danger" onclick="event.stopPropagation();${deleteAction}">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

// ─── Event modal (calendar_events) ───────────────────────────────────────────
function _openEventModal(ev) {
  // Populated externally via the event-form module; just open the backdrop
  openModal('eventModal');
}

export async function calEdit(id) {
  // Delegate to event-form module
  const { openEditRegular } = await import('./event-form.js');
  openEditRegular(id);
}

export async function calToggle(id, wasCancelled) {
  const { confirm: c } = await import('./ui.js');
  const ok = await c(wasCancelled ? '¿Reactivar?' : '¿Cancelar evento?',
    `El evento aparecerá como ${wasCancelled ? 'activo' : 'cancelado'}.`);
  if (!ok) return;
  const { error } = await sb.from('calendar_events').update({ cancelled: !wasCancelled }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast(wasCancelled ? 'Reactivado' : 'Cancelado', 'success');
  loadCalendario();
}

export async function calDelete(id, title) {
  const { confirm: c } = await import('./ui.js');
  const ok = await c('¿Eliminar actividad?', `"${title}" se eliminará permanentemente.`);
  if (!ok) return;
  const { error } = await sb.from('calendar_events').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Eliminado', 'success');
  loadCalendario();
}

// Expose for HTML onclick attributes
window.calEdit   = id => calEdit(id);
window.calToggle = (id, c) => calToggle(id, c);
window.calDelete = (id, t) => calDelete(id, t);

// ─── Nav buttons ─────────────────────────────────────────────────────────────
export function initCalendarNav() {
  document.getElementById('admCalPrev')?.addEventListener('click', () => {
    let y = admCalYear, m = admCalMonth;
    if (--m < 0) { m = 11; y--; }
    setCalView(y, m);
    loadCalendario();
  });
  document.getElementById('admCalNext')?.addEventListener('click', () => {
    let y = admCalYear, m = admCalMonth;
    if (++m > 11) { m = 0; y++; }
    setCalView(y, m);
    loadCalendario();
  });

  document.getElementById('calAddBtn')?.addEventListener('click', () => {
    import('./event-form.js').then(({ openNewRegular }) => openNewRegular());
  });
}