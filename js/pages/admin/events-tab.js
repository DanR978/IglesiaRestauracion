// js/pages/admin/events-tab.js
// Upcoming and Past event lists (table view).

import {
  sb, todayISO, pad2, MONTHS, isAdmin, currentProfile,
  normalizeEventsRow, filterEventsByMinistry,
  setUpcoming, setPast,
  _upcomingSpecial, _upcomingRegular, _pastSpecial, _pastRegular,
} from './state.js';
import { toast, confirm, openModal, closeModal } from './ui.js';
import { esc } from '/js/utils/escape.js';
import { showView } from './ui.js';
import { onFilterChange } from './filters.js';
import { showActionSheet } from '/js/components/action-sheet.js';

// Re-render when filter changes
onFilterChange(() => {
  renderUpcomingFiltered();
  renderPastFiltered();
});

// ─── Load ─────────────────────────────────────────────────────────────────────
export async function loadUpcoming() {
  const el = document.getElementById('upcomingList');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  try {
    const today = todayISO();
    let specialData = [];
    if (isAdmin()) {
      const { data: evRows } = await sb
        .from('events')
        .select('id,title,starts_at,location,description,tag,image_url,ministry_id')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true });
      specialData = (evRows || []).map(normalizeEventsRow).filter(Boolean);
    }
    let calQ = sb.from('calendar_events')
      .select('*,ministries(name,color)')
      .gte('date', today)
      .order('date', { ascending: true });
    if (!isAdmin() && currentProfile?.ministry_id)
      calQ = calQ.eq('ministry_id', currentProfile.ministry_id);
    const { data: calData, error } = await calQ;
    if (error) throw error;
    setUpcoming(specialData, calData || []);
    renderUpcomingFiltered();
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error: ${e.message}</p></div>`;
  }
}

export async function loadPast() {
  const el = document.getElementById('pastList');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  try {
    const today = todayISO();
    let specialData = [];
    if (isAdmin()) {
      const { data: evRows } = await sb
        .from('events')
        .select('id,title,starts_at,location,description,tag,image_url,ministry_id')
        .lt('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: false });
      specialData = (evRows || []).map(normalizeEventsRow).filter(Boolean);
    }
    let calQ = sb.from('calendar_events')
      .select('*,ministries(name,color)')
      .lt('date', today)
      .order('date', { ascending: false });
    if (!isAdmin() && currentProfile?.ministry_id)
      calQ = calQ.eq('ministry_id', currentProfile.ministry_id);
    const { data: calData, error } = await calQ;
    if (error) throw error;
    setPast(specialData, calData || []);
    renderPastFiltered();
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Error: ${e.message}</p></div>`;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
export function renderUpcomingFiltered() {
  const el = document.getElementById('upcomingList');
  if (!el) return;
  // Regular weekly activities live in the Calendario tab — Próximos only shows
  // the special events.
  const sp = filterEventsByMinistry(_upcomingSpecial);
  if (!sp.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No hay eventos con estos filtros.</p></div>';
    return;
  }
  el.innerHTML = buildEventsTableHtml(sp, false);
}

export function renderPastFiltered() {
  const el = document.getElementById('pastList');
  if (!el) return;
  const sp = filterEventsByMinistry(_pastSpecial);
  const rg = filterEventsByMinistry(_pastRegular);
  if (!sp.length && !rg.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No hay eventos con estos filtros.</p></div>';
    return;
  }
  let html = '';
  if (sp.length) html += '<div class="section-divider"><i class="fas fa-star"></i> Eventos Especiales</div>'   + buildEventsTableHtml(sp, true);
  if (rg.length) html += '<div class="section-divider"><i class="fas fa-calendar-check"></i> Actividades Regulares</div>' + buildEventsTableHtml(rg, true);
  el.innerHTML = html;
}

// ─── Table HTML ───────────────────────────────────────────────────────────────
const CAT_LABELS = {
  servicio: 'Servicio', estudio: 'Estudio Bíblico', oracion: 'Oración',
  evangelizacion: 'Evangelización', especial: 'Especial', otro: 'Otro',
};

function buildEventsTableHtml(events, isPastTab) {
  if (!events.length) return '';
  const today = todayISO();

  const groups = new Map();
  for (const ev of events) {
    if (!ev.date) continue;
    const [y, m] = ev.date.split('-').map(Number);
    const k = `${y}-${String(m).padStart(2, '0')}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(ev);
  }

  let html = '';
  for (const [k, evs] of groups) {
    const [y, m] = k.split('-').map(Number);
    const rows = evs.map(ev => {
      const isPast   = ev.date < today;
      const rowClass = ev.cancelled ? 'row--cancelled' : isPast ? 'row--past' : '';
      const minName  = ev.ministries?.name || '—';
      const minDot   = ev.ministries?.color
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ev.ministries.color};margin-right:5px"></span>`
        : '';
      const imgCell  = ev.image_url
        ? `<img src="${esc(ev.image_url)}" alt="" style="width:44px;height:32px;object-fit:cover;border-radius:4px;display:block">`
        : `<div style="width:44px;height:32px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#aaa">—</div>`;
      const [, mo, d] = ev.date.split('-').map(Number);
      const dateStr = `${mo}/${d}/${String(y).slice(-2)}${ev.time ? ' ' + ev.time : ''}`;

      const REPETITIVE = ['servicio', 'estudio', 'oracion'];
      const canCancel = REPETITIVE.includes(ev.category);

      return `
        <tr class="${rowClass}">
          <td>${imgCell}</td>
          <td><div class="event-title">${esc(ev.title)}</div></td>
          <td style="white-space:nowrap">${esc(dateStr)}</td>
          <td><span class="cat-badge cat--${esc(ev.category || 'otro')}">${esc(CAT_LABELS[ev.category] || ev.category)}</span></td>
          <td>${minDot}${esc(minName)}</td>
          <td>
            <div class="row-actions">
              <button class="kebab-btn" title="Opciones" aria-label="Más opciones"
                data-ev-menu="${esc(ev.id)}"
                data-ev-title="${esc(ev.title)}"
                data-ev-cancelled="${ev.cancelled ? '1' : '0'}"
                data-ev-cancancel="${canCancel ? '1' : '0'}"
                data-ev-special="${ev.fromEventsTable ? '1' : '0'}"
                data-ev-past="${isPastTab ? '1' : '0'}"
                data-ev-when="${esc(dateStr)}">
                <i class="fas fa-ellipsis-vertical"></i>
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

    html += `
      <div class="month-group-label">${MONTHS[m - 1]} ${y}</div>
      <table class="events-table" style="width:100%;margin-bottom:.75rem">
        <thead><tr>
          <th style="width:52px"></th>
          <th>Evento</th><th style="width:110px">Cuándo</th>
          <th style="width:120px">Categoría</th><th>Ministerio</th>
          <th style="width:100px">Acciones</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }
  return html;
}

// ─── Kebab menu handler (delegated, attached once) ──────────────────────────
if (!window.__irdKebabBound) {
  window.__irdKebabBound = true;
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('.kebab-btn[data-ev-menu]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const id        = btn.dataset.evMenu;
    const title     = btn.dataset.evTitle || 'Evento';
    const cancelled = btn.dataset.evCancelled === '1';
    const canCancel = btn.dataset.evCanCancel === '1' || btn.dataset.evCancancel === '1';
    const special   = btn.dataset.evSpecial === '1';
    const isPast    = btn.dataset.evPast === '1';
    const when      = btn.dataset.evWhen || '';

    const actions = [];
    if (!isPast) {
      actions.push({
        label: 'Editar evento',
        icon: 'fa-pen',
        onClick: () => special
          ? window.__adminEditSpecial?.(id.replace('evt-', ''))
          : window.__adminEditRegular?.(id),
      });
      if (canCancel) {
        actions.push({
          label: cancelled ? 'Reactivar evento' : 'Cancelar evento',
          icon: cancelled ? 'fa-rotate-left' : 'fa-ban',
          variant: 'warn',
          onClick: () => window.__adminToggleCancel?.(id, cancelled),
        });
      }
    }
    actions.push({
      label: 'Eliminar evento',
      icon: 'fa-trash',
      variant: 'danger',
      onClick: () => window.__adminDeleteEvent?.(id, title, special),
    });

    showActionSheet({ trigger: btn, title, subtitle: when, actions });
  });
}

// ─── CRUD actions (exposed as window.__ for inline onclick) ───────────────────
window.__adminToggleCancel = async (id, wasCancelled) => {
  const { toast: t, confirm: c } = await import('./ui.js');
  const ok = await c(wasCancelled ? '¿Reactivar evento?' : '¿Cancelar evento?',
    `El evento aparecerá como ${wasCancelled ? 'activo' : 'cancelado'}.`);
  if (!ok) return;
  const { error } = await sb.from('calendar_events').update({ cancelled: !wasCancelled }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast(wasCancelled ? 'Reactivado' : 'Cancelado', 'success');
  loadUpcoming();
};

window.__adminDeleteEvent = async (id, title, fromEventsTable) => {
  const ok = await (await import('./ui.js')).confirm('¿Eliminar evento?', `"${title}" se eliminará permanentemente.`);
  if (!ok) return;
  let error;
  if (fromEventsTable) {
    ({ error } = await sb.from('events').delete().eq('id', id.replace('evt-', '')));
  } else {
    ({ error } = await sb.from('calendar_events').delete().eq('id', id));
  }
  if (error) { toast(error.message, 'error'); return; }
  toast('Eliminado', 'success');
  loadUpcoming();
  loadPast();
};