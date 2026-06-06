import { esc } from '/js/utils/escape.js';
// js/pages/admin/ministries.js
// Ministerios tab — list + full create / edit / delete management.

import { sb, ministries, setMinistries, isAdmin, currentProfile } from './state.js';
import { buildFilterChecks } from './filters.js';
import { toast, openModal, closeModal, confirm } from './ui.js';
import { autoBalance } from './grid-balance.js';
import { showActionSheet } from '/js/components/action-sheet.js';



export async function loadMinistries() {
  const { data } = await sb.from('ministries').select('*').order('name');
  setMinistries(data || []);

  const opts = ministries.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  ['evMinistry', 'invMinistry'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });

  if (!isAdmin() && currentProfile?.ministry_id) {
    ['evMinistry', 'invMinistry'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = currentProfile.ministry_id;
    });
  }

  renderMinistriesTab();
  buildFilterChecks();
}

export function renderMinistriesTab() {
  const el = document.getElementById('ministriesList');
  if (!el) return;
  if (!ministries.length) {
    el.innerHTML =
      '<div class="empty-state"><i class="fas fa-church"></i><p>No hay ministerios todavía. Crea el primero.</p></div>';
    return;
  }
  el.innerHTML = ministries.map(m => `
    <div class="ministry-card">
      <div class="ministry-card__dot" style="background:${m.color || '#888'}"></div>
      <div class="ministry-card__name">${esc(m.name)}</div>
      <button class="adm-icon-btn" data-min-kebab="${m.id}" title="Acciones" aria-label="Acciones">
        <i class="fas fa-ellipsis-vertical"></i>
      </button>
    </div>`).join('');
  autoBalance(el);
}

// ── Modal ────────────────────────────────────────────────────────────────────
function setErr(msg) {
  const el = document.getElementById('ministryModalError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function openMinistryModal(m) {
  document.getElementById('ministryModalTitle').textContent =
    m ? 'Editar ministerio' : 'Nuevo ministerio';
  document.getElementById('minId').value    = m?.id || '';
  document.getElementById('minName').value  = m?.name || '';
  document.getElementById('minColor').value = m?.color || '#345a65';
  document.getElementById('ministryModalDelete').style.display = m ? '' : 'none';
  setErr('');
  openModal('ministryModal');
}

async function saveMinistry() {
  const id    = document.getElementById('minId').value;
  const name  = document.getElementById('minName').value.trim();
  const color = document.getElementById('minColor').value;
  const btn   = document.getElementById('ministryModalSave');
  setErr('');
  if (!name) { setErr('Ingresa el nombre del ministerio.'); return; }

  btn.disabled = true;
  try {
    const { error } = id
      ? await sb.from('ministries').update({ name, color }).eq('id', id)
      : await sb.from('ministries').insert({ name, color });
    if (error) throw error;
    toast(id ? 'Ministerio actualizado' : 'Ministerio creado', 'success');
    closeModal('ministryModal');
    await loadMinistries();
  } catch (e) {
    setErr(e.message || 'No se pudo guardar el ministerio.');
  } finally {
    btn.disabled = false;
  }
}

async function deleteMinistry() {
  await deleteMinistryById(document.getElementById('minId').value, setErr);
}

async function deleteMinistryById(id, onErr) {
  if (!id) return;
  const ok = await confirm('Eliminar ministerio',
    '¿Eliminar este ministerio? Esta acción no se puede deshacer.');
  if (!ok) return;

  const { error } = await sb.from('ministries').delete().eq('id', id);
  if (error) {
    const msg = /foreign key|violates|referenced/i.test(error.message)
      ? 'No se puede eliminar: hay eventos o usuarios asignados a este ministerio.'
      : error.message;
    if (onErr) onErr(msg); else toast(msg, 'error');
    return;
  }
  toast('Ministerio eliminado', 'success');
  closeModal('ministryModal');
  await loadMinistries();
}

export function initMinistryModal() {
  document.getElementById('addMinistryBtn')?.addEventListener('click', () => openMinistryModal(null));
  document.getElementById('ministryModalSave')?.addEventListener('click', saveMinistry);
  document.getElementById('ministryModalDelete')?.addEventListener('click', deleteMinistry);
  document.getElementById('ministryModalClose')?.addEventListener('click',  () => closeModal('ministryModal'));
  document.getElementById('ministryModalCancel')?.addEventListener('click', () => closeModal('ministryModal'));

  // Delegated — survives renderMinistriesTab() re-renders. One ⋮ per card.
  document.getElementById('ministriesList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-min-kebab]');
    if (!btn) return;
    const m = ministries.find(x => x.id === btn.dataset.minKebab);
    if (!m) return;
    showActionSheet({
      trigger: btn,
      title: m.name,
      actions: [
        { label: 'Editar', icon: 'fa-pen', onClick: () => openMinistryModal(m) },
        { label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: () => deleteMinistryById(m.id) },
      ],
    });
  });
}
