// js/pages/admin/presets.js
// Smart preset panel — now DB-backed.
// Admins can create, edit, and delete presets. They persist in calendar_presets.
// Falls back to empty list if DB unavailable (shows "no presets" message).

import { sb, pad2, currentUser, MONTHS } from './state.js';
import { toast, openModal, closeModal } from './ui.js';
import { loadCalendario } from './calendar-tab.js';

// ─── State ────────────────────────────────────────────────────────────────────
let dbPresets    = [];   // loaded from calendar_presets table
let selPresetIdx = null; // index into dbPresets for current preview

const DAY_LABELS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAY_SHORT  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// ─── Load presets from DB ─────────────────────────────────────────────────────
export async function loadPresets() {
  const { data, error } = await sb
    .from('calendar_presets')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.warn('[presets] load error:', error.message);
    dbPresets = [];
  } else {
    dbPresets = data || [];
  }

  buildPresetGrid();
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
export function buildPresetGrid() {
  const g = document.getElementById('presetGrid');
  if (!g) return;

  if (!dbPresets.length) {
    g.innerHTML = `<p style="color:var(--color-muted);font-size:.85rem;grid-column:1/-1">
      No hay presets todavía.
      <button class="bulk-add-btn" onclick="window.__openPresetModal(null)" style="margin-left:.5rem">
        + Crear uno
      </button>
    </p>`;
    return;
  }

  g.innerHTML = dbPresets.map((p, i) => `
    <div class="preset-card" data-idx="${i}">
      <div class="preset-card__title">${p.name}</div>
      <div class="preset-card__sub">${_patternLabel(p)}</div>
      <div class="preset-card__actions">
        <button class="preset-card__btn preset-card__btn--edit"
          onclick="event.stopPropagation();window.__openPresetModal('${p.id}')"
          title="Editar">✏</button>
        <button class="preset-card__btn preset-card__btn--delete"
          onclick="event.stopPropagation();window.__deletePreset('${p.id}','${(p.name||'').replace(/'/g,"\\'")}');"
          title="Eliminar">✕</button>
      </div>
    </div>`).join('');

  g.querySelectorAll('.preset-card').forEach(c => {
    c.addEventListener('click', () => {
      g.querySelectorAll('.preset-card').forEach(x => x.classList.remove('selected'));
      c.classList.add('selected');
      updateSmartPreview(Number(c.dataset.idx));
    });
  });
}

function _patternLabel(p) {
  const day = DAY_SHORT[p.day_of_week] || '?';
  if (p.pattern_type === 'weekly')       return `Todos los ${DAY_LABELS[p.day_of_week]}s · ${p.time || ''}`;
  if (p.pattern_type === 'lastWeekday')  return `Último ${day} del mes · ${p.time || ''}`;
  if (p.pattern_type === 'nthWeekday')   return `${p.nth_week}° ${day} del mes · ${p.time || ''}`;
  return p.time || '';
}

// ─── Preview ──────────────────────────────────────────────────────────────────
function updateSmartPreview(idx) {
  selPresetIdx = idx;
  const p     = dbPresets[idx];
  if (!p) return;
  const month = Number(document.getElementById('smartMonth').value);
  const year  = Number(document.getElementById('smartYear').value);
  const dates = getDates(p, year, month);

  document.getElementById('smartCount').textContent = dates.length;
  document.getElementById('previewPills').innerHTML = dates.map(d => {
    const [y, m, day] = d.split('-').map(Number);
    return `<span class="preview-pill">${
      new Date(y, m - 1, day).toLocaleDateString('es', { weekday:'short', day:'numeric', month:'short' })
    }</span>`;
  }).join('');
  document.getElementById('smartPreview').style.display = dates.length ? 'block' : 'none';
}

function getDates(p, year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  const result = [];
  const ymd = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

  if (p.pattern_type === 'weekly') {
    for (let d = 1; d <= days; d++)
      if (new Date(year, month, d).getDay() === p.day_of_week)
        result.push(ymd(year, month, d));
  } else if (p.pattern_type === 'lastWeekday') {
    for (let d = days; d >= 1; d--)
      if (new Date(year, month, d).getDay() === p.day_of_week) {
        result.push(ymd(year, month, d));
        break;
      }
  } else if (p.pattern_type === 'nthWeekday') {
    let c = 0;
    for (let d = 1; d <= days; d++)
      if (new Date(year, month, d).getDay() === p.day_of_week)
        if (++c === p.nth_week) { result.push(ymd(year, month, d)); break; }
  }
  return result;
}

// ─── Create from preset ───────────────────────────────────────────────────────
async function createFromPreset() {
  if (selPresetIdx === null) return;
  const p     = dbPresets[selPresetIdx];
  const month = Number(document.getElementById('smartMonth').value);
  const year  = Number(document.getElementById('smartYear').value);
  const dates = getDates(p, year, month);
  if (!dates.length) return;

  const btn = document.getElementById('smartCreate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';

  const rows = dates.map(date => ({
    title:       p.name,
    date,
    time:        p.time        || null,
    location:    p.location    || null,
    description: p.description || null,
    category:    p.category    || 'otro',
    cancelled:   false,
    ministry_id: null,
    created_by:  currentUser?.id,
  }));

  const { error } = await sb.from('calendar_events').insert(rows);
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-check"></i> Crear todos';
  if (error) { toast(error.message, 'error'); return; }
  toast(`${rows.length} actividades creadas`, 'success');
  closeSmartPanel();
  loadCalendario();
}

// ─── Delete preset ────────────────────────────────────────────────────────────
window.__deletePreset = async (id, name) => {
  const { confirm: c } = await import('./ui.js');
  const ok = await c('¿Eliminar preset?', `"${name}" se eliminará permanentemente.`);
  if (!ok) return;
  const { error } = await sb.from('calendar_presets').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Preset eliminado', 'success');
  selPresetIdx = null;
  await loadPresets();
};

// ─── Preset modal (create / edit) ────────────────────────────────────────────
let editingPresetId = null;

window.__openPresetModal = async (id) => {
  editingPresetId = id;
  const titleEl = document.getElementById('presetModalTitle');
  const errEl   = document.getElementById('presetModalError');
  errEl.style.display = 'none';

  if (id) {
    titleEl.textContent = 'Editar Preset';
    const p = dbPresets.find(x => x.id === id);
    if (!p) return;
    document.getElementById('pmName').value        = p.name;
    document.getElementById('pmDescription').value = p.description || '';
    document.getElementById('pmCategory').value    = p.category;
    document.getElementById('pmTime').value        = p.time || '';
    document.getElementById('pmLocation').value    = p.location || '';
    document.getElementById('pmPatternType').value = p.pattern_type;
    document.getElementById('pmDayOfWeek').value   = String(p.day_of_week);
    document.getElementById('pmNthWeek').value     = p.nth_week || '';
    _toggleNthWeek();
  } else {
    titleEl.textContent = 'Nuevo Preset';
    document.getElementById('pmName').value        = '';
    document.getElementById('pmDescription').value = '';
    document.getElementById('pmCategory').value    = 'otro';
    document.getElementById('pmTime').value        = '';
    document.getElementById('pmLocation').value    = '2601 Clays Mill Rd, Lexington, KY 40503';
    document.getElementById('pmPatternType').value = 'weekly';
    document.getElementById('pmDayOfWeek').value   = '0';
    document.getElementById('pmNthWeek').value     = '';
    _toggleNthWeek();
  }

  openModal('presetModal');
};

function _toggleNthWeek() {
  const type   = document.getElementById('pmPatternType').value;
  const nthRow = document.getElementById('pmNthWeekRow');
  if (nthRow) nthRow.style.display = type === 'nthWeekday' ? '' : 'none';
}

async function _savePreset() {
  const errEl = document.getElementById('presetModalError');
  const name  = document.getElementById('pmName').value.trim();
  if (!name) { errEl.textContent = 'El nombre es obligatorio.'; errEl.style.display = ''; return; }

  const payload = {
    name,
    description:  document.getElementById('pmDescription').value.trim() || null,
    category:     document.getElementById('pmCategory').value,
    time:         document.getElementById('pmTime').value.trim() || null,
    location:     document.getElementById('pmLocation').value.trim() || null,
    pattern_type: document.getElementById('pmPatternType').value,
    day_of_week:  Number(document.getElementById('pmDayOfWeek').value),
    nth_week:     document.getElementById('pmPatternType').value === 'nthWeekday'
                    ? Number(document.getElementById('pmNthWeek').value) || null
                    : null,
    created_by:   currentUser?.id,
  };

  errEl.style.display = 'none';
  const btn = document.getElementById('presetModalSave');
  btn.disabled = true;

  let error;
  if (editingPresetId) {
    ({ error } = await sb.from('calendar_presets').update(payload).eq('id', editingPresetId));
  } else {
    ({ error } = await sb.from('calendar_presets').insert(payload));
  }

  btn.disabled = false;
  if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
  toast(editingPresetId ? 'Preset actualizado' : 'Preset creado', 'success');
  closeModal('presetModal');
  await loadPresets();
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initSmartPresets() {
  document.getElementById('calSmartBtn')?.addEventListener('click', async () => {
    const now = new Date();
    document.getElementById('smartMonth').value = now.getMonth();
    document.getElementById('smartYear').value  = now.getFullYear();
    selPresetIdx = null;
    document.getElementById('smartPreview').style.display = 'none';
    document.getElementById('presetGrid').querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('smartPanel').classList.add('open');
    document.getElementById('smartPanel').scrollIntoView({ behavior:'smooth', block:'nearest' });
    if (!dbPresets.length) await loadPresets();
  });

  document.getElementById('smartClose')?.addEventListener('click', closeSmartPanel);

  document.getElementById('smartClear')?.addEventListener('click', () => {
    selPresetIdx = null;
    document.getElementById('presetGrid').querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('smartPreview').style.display = 'none';
  });

  ['smartMonth', 'smartYear'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (selPresetIdx !== null) updateSmartPreview(selPresetIdx);
    });
  });

  document.getElementById('smartCreate')?.addEventListener('click', createFromPreset);

  // New preset button inside panel
  document.getElementById('smartNewPresetBtn')?.addEventListener('click', () => {
    window.__openPresetModal(null);
  });

  // Preset modal wiring
  document.getElementById('pmPatternType')?.addEventListener('change', _toggleNthWeek);
  document.getElementById('presetModalSave')?.addEventListener('click', _savePreset);
  document.getElementById('presetModalClose')?.addEventListener('click',  () => closeModal('presetModal'));
  document.getElementById('presetModalCancel')?.addEventListener('click', () => closeModal('presetModal'));
}

function closeSmartPanel() {
  document.getElementById('smartPanel').classList.remove('open');
}