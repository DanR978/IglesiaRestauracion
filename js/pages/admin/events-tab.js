// js/pages/admin/events-tab.js
// Upcoming and Past event lists (table view).

import {
  sb, todayISO, pad2, MONTHS, isAdmin, currentProfile,
  normalizeEventsRow, filterEventsByMinistry,
  setUpcoming, setPast,
  _upcomingSpecial, _upcomingRegular, _pastSpecial, _pastRegular,
} from './state.js';
import { toast, confirm, openModal, closeModal } from './ui.js';
import { showView } from './ui.js';
import { onFilterChange } from './filters.js';

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
  const sp = filterEventsByMinistry(_upcomingSpecial);
  const rg = filterEventsByMinistry(_upcomingRegular);
  if (!sp.length && !rg.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>No hay eventos con estos filtros.</p></div>';
    return;
  }
  let html = '';
  if (sp.length) html += '<div class="section-divider"><i class="fas fa-star"></i> Eventos Especiales</div>'   + buildEventsTableHtml(sp, false);
  if (rg.length) html += '<div class="section-divider"><i class="fas fa-calendar-check"></i> Actividades Regulares</div>' + buildEventsTableHtml(rg, false);
  el.innerHTML = html;
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
        ? `<img src="${ev.image_url}" alt="" style="width:44px;height:32px;object-fit:cover;border-radius:4px;display:block">`
        : `<div style="width:44px;height:32px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#aaa">—</div>`;
      const editBtn  = ev.fromEventsTable
        ? `<button class="icon-btn__admin" title="Editar" onclick="window.__adminEditSpecial('${ev.id.replace('evt-', '')}')"><i class="fas fa-pen"></i></button>`
        : `<button class="icon-btn__admin" title="Editar" onclick="window.__adminEditRegular('${ev.id}')"><i class="fas fa-pen"></i></button>`;

      const [, mo, d] = ev.date.split('-').map(Number);
      const dateStr = `${mo}/${d}/${String(y).slice(-2)}${ev.time ? ' ' + ev.time : ''}`;

      return `
        <tr class="${rowClass}">
          <td>${imgCell}</td>
          <td><div class="event-title">${ev.title}</div></td>
          <td style="white-space:nowrap">${dateStr}</td>
          <td><span class="cat-badge cat--${ev.category || 'otro'}">${CAT_LABELS[ev.category] || ev.category}</span></td>
          <td>${minDot}${minName}</td>
          <td>
            <div class="row-actions">
              ${!isPastTab ? `
                ${editBtn}
                <button class="icon-btn__admin ${ev.cancelled ? 'success' : 'warn'}"
                  title="${ev.cancelled ? 'Reactivar' : 'Cancelar'}"
                  onclick="window.__adminToggleCancel('${ev.id}', ${ev.cancelled})">
                  <i class="fas fa-${ev.cancelled ? 'undo' : 'ban'}"></i>
                </button>` : ''}
              <button class="icon-btn__admin danger" title="Eliminar"
                onclick="window.__adminDeleteEvent('${ev.id}', '${(ev.title || '').replace(/'/g, "\\'")}', ${!!ev.fromEventsTable})">
                <i class="fas fa-trash"></i>
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