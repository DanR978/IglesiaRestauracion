// js/pages/admin/calendar-tab.js
// Admin calendar tab — uses the shared CalendarGrid component.

import { CalendarGrid } from '/js/components/CalendarGrid.js';
import {
  sb, pad2, todayISO, MONTHS, DAY_NAMES, CAT_COLORS,
  calEventsList, admCalYear, admCalMonth,
  setCalEvents, setCalView,
  filterEventsByMinistry, normalizeEventsRow, ministries,
  isAdmin, currentProfile,
} from './state.js';
import { toast, confirm, openModal } from './ui.js';
import { onFilterChange } from './filters.js';
import { loadUpcoming } from './events-tab.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { esc } from '/js/utils/escape.js';

// Delegated kebab handler for calendar list items (attached once)
if (!window.__irdCalKebabBound) {
  window.__irdCalKebabBound = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.kebab-btn[data-cal-menu]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const id        = btn.dataset.calMenu;
    const title     = btn.dataset.calTitle || 'Evento';
    const cancelled = btn.dataset.calCancelled === '1';
    const canCancel = btn.dataset.calCancancel === '1';
    const special   = btn.dataset.calSpecial === '1';
    const when      = btn.dataset.calWhen || '';

    const actions = [
      {
        label: 'Editar evento',
        icon: 'fa-pen',
        onClick: () => special
          ? window.__adminEditSpecial?.(id.replace('evt-', ''))
          : calEdit(id),
      },
    ];
    if (canCancel) {
      actions.push({
        label: cancelled ? 'Reactivar evento' : 'Cancelar evento',
        icon: cancelled ? 'fa-rotate-left' : 'fa-ban',
        variant: 'warn',
        onClick: () => special
          ? window.__adminToggleCancel?.(id, cancelled)
          : calToggle(id, cancelled),
      });
    }
    actions.push({
      label: 'Eliminar evento',
      icon: 'fa-trash',
      variant: 'danger',
      onClick: () => special
        ? window.__adminDeleteEvent?.(id, title, true)
        : calDelete(id, title),
    });

    showActionSheet({ trigger: btn, title, subtitle: when, actions });
  });
}

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
  // Ministry leaders see only their own ministry's calendar events.
  let calQ = sb.from('calendar_events')
    .select('*,ministries(name,color)').order('date', { ascending: true });
  if (!isAdmin() && currentProfile?.ministry_id)
    calQ = calQ.eq('ministry_id', currentProfile.ministry_id);
  const { data: calData, error: calErr } = await calQ;
  if (calErr) { toast('Error cargando calendario: ' + calErr.message, 'error'); return; }

  // Special events (events table) are admin-only.
  let evRows = [];
  if (isAdmin()) {
    const { data, error: evErr } = await sb
      .from('events').select('id,title,starts_at,location,description,tag,image_url,ministry_id')
      .order('starts_at', { ascending: true });
    if (evErr) console.warn('[cal] events:', evErr.message);
    else evRows = data || [];
  }

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

      // Only repetitive categories (servicio/estudio/oracion) can be cancelled
      const REPETITIVE = ['servicio', 'estudio', 'oracion'];
      const canCancel = REPETITIVE.includes(ev.category);

      const imgHtml = isSpecial && ev.image_url
        ? `<img class="adm-list__thumb" src="${esc(ev.image_url)}" alt="" loading="lazy">`
        : `<span class="adm-list__dot" style="background:${color}"></span>`;

      html += `
        <div class="adm-list__item${isCancelled?' cancelled':''}">
          ${imgHtml}
          <div class="adm-list__info">
            <div class="adm-list__name">
              ${esc(ev.title)}
              ${isCancelled ? '<span class="adm-list__cancelled-badge">Cancelado</span>' : ''}
            </div>
            <div class="adm-list__meta">
              ${ev.time   ? `<span><i class="far fa-clock" style="margin-right:3px;opacity:.6"></i>${esc(ev.time)}</span>` : ''}
              ${minName   ? `<span>· ${esc(minName)}</span>` : ''}
            </div>
          </div>
          <div class="adm-list__actions">
            <button class="kebab-btn" title="Opciones" aria-label="Más opciones"
              onclick="event.stopPropagation()"
              data-cal-menu="${esc(ev.id)}"
              data-cal-title="${esc(ev.title)}"
              data-cal-cancelled="${isCancelled ? '1' : '0'}"
              data-cal-cancancel="${canCancel ? '1' : '0'}"
              data-cal-special="${isSpecial ? '1' : '0'}"
              data-cal-when="${esc(ev.time || '')}">
              <i class="fas fa-ellipsis-vertical"></i>
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
  // Special events (from events table) use the full form editor
  if (typeof id === 'string' && id.startsWith('evt-')) {
    const { openEditSpecial } = await import('./event-form.js');
    openEditSpecial(id.replace('evt-', ''));
    return;
  }
  // Regular calendar events use the modal
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
  const ok = await c('¿Eliminar?', `"${title}" se eliminará permanentemente.`);
  if (!ok) return;
  let error;
  if (typeof id === 'string' && id.startsWith('evt-')) {
    ({ error } = await sb.from('events').delete().eq('id', id.replace('evt-', '')));
  } else {
    ({ error } = await sb.from('calendar_events').delete().eq('id', id));
  }
  if (error) { toast(error.message, 'error'); return; }
  toast('Eliminado', 'success');
  loadCalendario();
  loadUpcoming();
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
  // Note: calAddBtn is now handled by wizard.js
}