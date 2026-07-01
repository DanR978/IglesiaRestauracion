import { esc } from '/js/utils/escape.js';
// js/pages/admin/role-presets.js
// ─────────────────────────────────────────────────────────────────────────────
// "Roles y accesos" sub-tab — reusable access presets (Proxmox-style).
//   • A preset is a template: name + base role + the pages it grants.
//   • Assigning it to a user copies base_role + allowed_tabs onto the profile.
//   • Editing a preset propagates to every account that carries it.
// allowed_tabs meaning depends on base role:
//   • ministry_leader → which OPERATIONAL pages show.
//   • admin           → which SYSTEM pages (Ministerios/Usuarios/Actividad/
//     Configuración) show on top of the always-on admin pages. Desarrollador
//     grants all four; Administrador grants none.
//   • treasurer       → none (finance-only, gated by role).
// All writes go through the `admin-invite` Edge Function (service-role).
// ─────────────────────────────────────────────────────────────────────────────

import { callAdmin } from './admin-fn.js';
import { toast, openModal, closeModal, confirm } from './ui.js';
import { showActionSheet } from '/js/components/action-sheet.js';

// Operational pages (ministry_leader base). Keys must match the nav data-tab
// values and the edge-function OPERATIONAL_TABS / RLS grant keys.
const OPERATIONAL_TABS = [
  { key: 'upcoming',       label: 'Próximos',       icon: 'fa-calendar-day' },
  { key: 'calendario',     label: 'Calendario',     icon: 'fa-calendar-week' },
  { key: 'special-events', label: 'Registraciones', icon: 'fa-clipboard-list' },
  { key: 'discipulado',    label: 'Discipulado',    icon: 'fa-hand-holding-heart' },
  { key: 'galeria',        label: 'Galería',        icon: 'fa-images' },
  { key: 'treasury',       label: 'Tesorería (proyectos)', icon: 'fa-coins' },
];
// System pages an admin-base preset may grant (Desarrollador = all, Administrador = none).
const ADMIN_TABS = [
  { key: 'ministries', label: 'Ministerios',    icon: 'fa-church' },
  { key: 'users',      label: 'Usuarios',       icon: 'fa-users' },
  { key: 'activity',   label: 'Actividad',      icon: 'fa-clock-rotate-left' },
  { key: 'settings',   label: 'Configuración',  icon: 'fa-gear' },
];
const SYSTEM_KEYS = ADMIN_TABS.map(t => t.key);
const TAB_BY_KEY  = Object.fromEntries([...OPERATIONAL_TABS, ...ADMIN_TABS].map(t => [t.key, t]));

// Tab universe per access type. `locked` items are always granted — shown
// checked + disabled so the user can SEE what the preset includes (e.g. a
// Tesorería preset shows Finanzas as included). The rest are editable.
const INICIO   = { key: 'inicio',   label: 'Inicio',               icon: 'fa-house' };
const FINANZAS = { key: 'treasury', label: 'Tesorería (Finanzas)', icon: 'fa-coins' };

function tabItemsForRole(base) {
  if (base === 'treasurer') {
    return [{ ...INICIO, locked: true }, { ...FINANZAS, locked: true }];
  }
  if (base === 'admin') {
    return [{ key: '__panel', label: 'Todo el panel', icon: 'fa-shield-halved', locked: true },
      ...ADMIN_TABS.map(t => ({ ...t, locked: false }))];
  }
  return [{ ...INICIO, locked: true }, ...OPERATIONAL_TABS.map(t => ({ ...t, locked: false }))];
}

// Curated icon library for the preset picker.
const PRESET_ICONS = [
  'fa-shield-halved', 'fa-user-gear', 'fa-crown', 'fa-key', 'fa-lock', 'fa-id-badge',
  'fa-user', 'fa-users', 'fa-user-tie', 'fa-user-group', 'fa-coins', 'fa-money-bill-wave',
  'fa-chart-line', 'fa-clipboard-list', 'fa-calendar-day', 'fa-photo-film', 'fa-camera',
  'fa-video', 'fa-microphone', 'fa-music', 'fa-bullhorn', 'fa-church', 'fa-cross', 'fa-dove',
  'fa-hands-praying', 'fa-book-bible', 'fa-heart', 'fa-hand-holding-heart', 'fa-handshake',
  'fa-graduation-cap', 'fa-children', 'fa-baby', 'fa-star', 'fa-gear', 'fa-screwdriver-wrench',
  'fa-clock-rotate-left', 'fa-envelope', 'fa-globe', 'fa-house', 'fa-flag', 'fa-bell', 'fa-compass',
];

let _presets = [];

// Shared cache for the invite dropdown in users.js.
export function getPresets() { return _presets; }

export async function fetchPresets() {
  const res = await callAdmin('list-presets');
  _presets = res.presets || [];
  return _presets;
}

// ── Load + render the management grid ────────────────────────────────────────
export async function loadRolePresets() {
  const el = document.getElementById('presetsList');
  if (!el) return;
  el.innerHTML =
    '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando presets...</div>';
  try {
    await fetchPresets();
  } catch (e) {
    el.innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(e.message)}</p></div>`;
    return;
  }
  renderPresets();
}

function chip(key) {
  const t = TAB_BY_KEY[key];
  return `<span class="rp-chip"><i class="fas ${t ? t.icon : 'fa-file'}"></i> ${esc(t ? t.label : key)}</span>`;
}

const MAX_CHIPS = 4;   // keep every card a similar height

// Cap a chip list at MAX_CHIPS, appending a "+N más" pill for the rest.
function capChips(keys) {
  const shown = keys.slice(0, MAX_CHIPS).map(chip);
  if (keys.length > MAX_CHIPS) {
    shown.push(`<span class="rp-chip rp-chip--more">+${keys.length - MAX_CHIPS} más</span>`);
  }
  return shown.join('');
}

function pageChips(p) {
  const tabs = Array.isArray(p.allowed_tabs) ? p.allowed_tabs : [];
  if (p.base_role === 'treasurer') return '<span class="rp-chip rp-chip--all">Solo finanzas</span>';
  if (p.base_role === 'admin') {
    if (SYSTEM_KEYS.every(k => tabs.includes(k))) {
      return '<span class="rp-chip rp-chip--all">Acceso total</span>';
    }
    const sys = tabs.filter(k => SYSTEM_KEYS.includes(k)).map(chip).join('');
    return `<span class="rp-chip rp-chip--all">Panel completo</span>${sys}`;
  }
  if (!tabs.length) return '<span class="rp-chip rp-chip--none">Solo Inicio</span>';
  return capChips(tabs);
}

function renderPresets() {
  const el = document.getElementById('presetsList');
  if (!el) return;
  if (!_presets.length) {
    el.innerHTML =
      '<div class="empty-state"><i class="fas fa-id-badge"></i><p>No hay presets todavía. Crea el primero.</p></div>';
    return;
  }
  el.innerHTML = _presets.map(p => {
    const n = p.member_count || 0;
    return `
    <div class="rp-card" data-preset-id="${p.id}">
      <div class="rp-card__icon" style="--preset-color:${esc(p.color || '#475569')}">
        <i class="fas ${esc(p.icon || 'fa-id-badge')}"></i>
      </div>
      <div class="rp-card__body">
        <div class="rp-card__head">
          <span class="rp-card__name">${esc(p.name)}</span>
          ${p.is_system ? '<span class="rp-card__sys"><i class="fas fa-lock"></i> Sistema</span>' : ''}
          <span class="rp-card__count">${n} ${n === 1 ? 'usuario' : 'usuarios'}</span>
        </div>
        <div class="rp-card__chips">${pageChips(p)}</div>
      </div>
      <button class="adm-icon-btn" data-preset-kebab="${p.id}" title="Acciones" aria-label="Acciones">
        <i class="fas fa-ellipsis-vertical"></i>
      </button>
    </div>`;
  }).join('');
}

// ── Modal ────────────────────────────────────────────────────────────────────
function setErr(msg) {
  const el = document.getElementById('presetModalError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function renderIconPicker(selected) {
  const grid = document.getElementById('presetIconGrid');
  if (!grid) return;
  grid.innerHTML = PRESET_ICONS.map(ic => `
    <button type="button" class="icon-opt${ic === selected ? ' is-selected' : ''}" data-icon="${ic}" title="${ic}" aria-label="${ic}">
      <i class="fas ${ic}"></i>
    </button>`).join('');
  document.getElementById('presetIcon').value = selected;
}

function renderPresetTabs(base, selected = []) {
  const sel = new Set(selected);
  const list = document.getElementById('presetTabsList');
  if (!list) return;
  list.innerHTML = tabItemsForRole(base).map(t => {
    const checked = t.locked || sel.has(t.key);
    return `<label class="perm-item${t.locked ? ' perm-item--locked' : ''}">
      <input type="checkbox" value="${t.key}"${checked ? ' checked' : ''}${t.locked ? ' disabled' : ''}>
      <i class="fas ${t.icon}"></i> <span>${esc(t.label)}</span>
    </label>`;
  }).join('');
}

// Only user-selectable (non-locked) checks become allowed_tabs.
function getSelectedPresetTabs() {
  return Array.from(document.querySelectorAll('#presetTabsList input:checked:not(:disabled)')).map(cb => cb.value);
}

// Label the checklist for the current type. The list is ALWAYS shown — for
// Tesorería it shows its included (locked) Finanzas item.
function syncTabsGroup(base) {
  const group = document.getElementById('presetTabsGroup');
  if (group) group.hidden = false;
  const label = document.getElementById('presetTabsLabel');
  if (label) label.textContent =
    base === 'treasurer' ? 'Acceso incluido' :
    base === 'admin'     ? 'Páginas de administración' :
                           'Páginas que puede ver';
}

function openPresetModal(p) {
  document.getElementById('presetModalTitle').textContent = p ? 'Editar preset' : 'Nuevo preset';
  document.getElementById('presetId').value   = p?.id || '';
  document.getElementById('presetName').value = p?.name || '';
  const base = p?.base_role || 'ministry_leader';
  document.getElementById('presetBaseRole').value = base;
  document.getElementById('presetColor').value    = p?.color || '#475569';
  renderIconPicker(p?.icon || 'fa-id-badge');
  renderPresetTabs(base, p?.allowed_tabs || []);
  syncTabsGroup(base);
  // Built-in presets stay fully editable (name, type, pages, look); only
  // DELETION is blocked for them.
  document.getElementById('presetModalDelete').style.display = (p && !p.is_system) ? '' : 'none';
  setErr('');
  openModal('presetModal');
}

async function savePreset() {
  const id        = document.getElementById('presetId').value;
  const name      = document.getElementById('presetName').value.trim();
  const base_role = document.getElementById('presetBaseRole').value;
  const icon      = document.getElementById('presetIcon').value || 'fa-id-badge';
  const color     = document.getElementById('presetColor').value || null;
  const allowed_tabs = getSelectedPresetTabs();   // locked items are excluded
  const btn = document.getElementById('presetModalSave');
  setErr('');
  if (!name) { setErr('Ingresa un nombre para el preset.'); return; }

  btn.disabled = true;
  try {
    await callAdmin('save-preset', { id: id || undefined, name, base_role, allowed_tabs, icon, color });
    toast(id ? 'Preset actualizado' : 'Preset creado', 'success');
    closeModal('presetModal');
    await loadRolePresets();
  } catch (e) {
    setErr(e.message || 'No se pudo guardar el preset.');
  } finally {
    btn.disabled = false;
  }
}

async function deletePresetById(id) {
  const ok = await confirm('Eliminar preset',
    '¿Eliminar este preset? Esta acción no se puede deshacer.');
  if (!ok) return;
  try {
    await callAdmin('delete-preset', { id });
    toast('Preset eliminado', 'success');
    closeModal('presetModal');
    await loadRolePresets();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export function initRolePresets() {
  document.getElementById('addPresetBtn')?.addEventListener('click', () => openPresetModal(null));

  // Type change → swap the checklist to that type's pages, keep matching picks.
  document.getElementById('presetBaseRole')?.addEventListener('change', e => {
    const base = e.target.value;
    renderPresetTabs(base, getSelectedPresetTabs());
    syncTabsGroup(base);
  });

  // Icon picker.
  document.getElementById('presetIconGrid')?.addEventListener('click', e => {
    const opt = e.target.closest('[data-icon]');
    if (!opt) return;
    document.getElementById('presetIcon').value = opt.dataset.icon;
    document.querySelectorAll('#presetIconGrid .icon-opt')
      .forEach(b => b.classList.toggle('is-selected', b === opt));
  });

  document.getElementById('presetModalSave')?.addEventListener('click', savePreset);
  document.getElementById('presetModalDelete')?.addEventListener('click', () => {
    const id = document.getElementById('presetId').value;
    if (id) deletePresetById(id);
  });
  document.getElementById('presetModalClose')?.addEventListener('click',  () => closeModal('presetModal'));
  document.getElementById('presetModalCancel')?.addEventListener('click', () => closeModal('presetModal'));

  // Delegated — survives renderPresets() re-renders. One ⋮ per card.
  document.getElementById('presetsList')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-preset-kebab]');
    if (!btn) return;
    const p = _presets.find(x => x.id === btn.dataset.presetKebab);
    if (!p) return;
    const actions = [{ label: 'Editar', icon: 'fa-pen', onClick: () => openPresetModal(p) }];
    if (!p.is_system) {
      actions.push({ label: 'Eliminar', icon: 'fa-trash', variant: 'danger', onClick: () => deletePresetById(p.id) });
    }
    showActionSheet({ trigger: btn, title: p.name, actions });
  });
}
