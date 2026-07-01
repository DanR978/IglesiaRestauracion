import { esc } from '/js/utils/escape.js';
// js/pages/admin/users.js
// ─────────────────────────────────────────────────────────────────────────────
// "Cuentas y Accesos" sub-tab — invite-only account management.
//   • Pending invitations  — resend / revoke
//   • Active users         — edit access (preset), reset 2FA, delete
// Access is assigned by picking a preset (see role-presets.js); the preset
// predetermines the role and the pages the account can open.
// Every privileged operation goes through the `admin-invite` Edge Function,
// which runs with the service-role key and re-checks that the caller is admin.
// ─────────────────────────────────────────────────────────────────────────────

import { currentUser, ministries } from './state.js';
import { toast, openModal, closeModal, confirm } from './ui.js';
import { showActionSheet } from '/js/components/action-sheet.js';
import { callAdmin } from './admin-fn.js';
import { fetchPresets, getPresets } from './role-presets.js';

const ROLE_LABEL = { admin: 'Administrador', ministry_leader: 'Líder de ministerio', treasurer: 'Tesorero' };

let _cachedUsers = [];

// ── Small helpers ────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').split(' ').filter(Boolean)
    .map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// Avatar circle: cover photo when the user has one, else colored initials.
function avatarCell(u, pending) {
  const cls = `user-row__avatar${pending ? ' user-row__avatar--pending' : ''}${u.avatar_url ? ' user-row__avatar--img' : ''}`;
  if (u.avatar_url) return `<div class="${cls}" style="background-image:url('${esc(u.avatar_url)}')"></div>`;
  if (pending) return `<div class="${cls}"><i class="fas fa-paper-plane"></i></div>`;
  return `<div class="${cls}">${esc(initials(u.display_name))}</div>`;
}

// ── Load + render ────────────────────────────────────────────────────────────
export async function loadUsers() {
  const usersEl = document.getElementById('usersList');
  const invEl   = document.getElementById('invitesList');
  const invSec  = document.getElementById('invitesSection');
  if (!usersEl) return;

  usersEl.innerHTML =
    '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando cuentas...</div>';
  if (invEl) invEl.innerHTML = '';

  let res;
  try {
    res = await callAdmin('list');
  } catch (e) {
    usersEl.innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${esc(e.message)}</p></div>`;
    if (invSec) invSec.hidden = true;
    return;
  }

  _cachedUsers  = res.users || [];
  const pending = _cachedUsers.filter(u => !u.confirmed);
  const active  = _cachedUsers.filter(u =>  u.confirmed);

  if (invSec) {
    invSec.hidden = pending.length === 0;
    if (invEl) invEl.innerHTML = pending.map(renderPending).join('');
  }

  usersEl.innerHTML = active.length
    ? active.map(renderActive).join('')
    : '<div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios activos todavía.</p></div>';

  wireActions();
}

// Badge shows the preset name (its colour follows the underlying role).
function accessBadge(u) {
  const label = u.preset || ROLE_LABEL[u.role] || u.role || '—';
  return `<span class="role-badge role--${u.role || 'none'}">${esc(label)}</span>`;
}

// Meta line describing what the account can reach.
function accessMeta(u) {
  if (u.role === 'admin') {
    const sys = ['users', 'activity', 'settings'];
    const full = Array.isArray(u.allowed_tabs) && sys.every(k => u.allowed_tabs.includes(k));
    return full ? 'Acceso total' : 'Administración (sin usuarios/actividad/configuración)';
  }
  if (u.role === 'treasurer') return u.preset ? esc(u.preset) : 'Tesorería · solo finanzas';
  const n = Array.isArray(u.allowed_tabs) ? u.allowed_tabs.length : 0;
  const label = u.preset ? esc(u.preset) : 'Personalizado';
  return `${label} · ${n} ${n === 1 ? 'página' : 'páginas'}`;
}

function renderActive(u) {
  const mfaBadge = u.mfa
    ? '<span class="acc-badge acc-badge--ok"><i class="fas fa-shield-halved"></i> 2FA activo</span>'
    : '<span class="acc-badge acc-badge--warn"><i class="fas fa-triangle-exclamation"></i> sin 2FA</span>';
  const isSelf = u.id === currentUser?.id;
  return `
    <div class="user-row" data-id="${u.id}">
      ${avatarCell(u)}
      <div class="user-row__info">
        <div class="user-row__name">${esc(u.display_name || u.email)}${
          isSelf ? ' <span class="acc-you">(tú)</span>' : ''}</div>
        <div class="user-row__meta">${esc(u.email)} · ${accessMeta(u)}</div>
        <div class="user-row__badges">${accessBadge(u)} ${mfaBadge}</div>
      </div>
      <div class="user-row__actions">
        <button class="adm-icon-btn" data-act="kebab" data-id="${u.id}" title="Acciones" aria-label="Acciones">
          <i class="fas fa-ellipsis-vertical"></i></button>
      </div>
    </div>`;
}

function renderPending(u) {
  return `
    <div class="user-row user-row--pending" data-id="${u.id}">
      ${avatarCell(u, true)}
      <div class="user-row__info">
        <div class="user-row__name">${esc(u.display_name || u.email)}</div>
        <div class="user-row__meta">${esc(u.email)} · ${accessMeta(u)} · esperando que acepte</div>
        <div class="user-row__badges">${accessBadge(u)}</div>
      </div>
      <div class="user-row__actions">
        <button class="adm-icon-btn" data-act="kebab" data-id="${u.id}" title="Acciones" aria-label="Acciones">
          <i class="fas fa-ellipsis-vertical"></i></button>
      </div>
    </div>`;
}

// ── Row actions — one ⋮ per row opens an action sheet ─────────────────────────
function wireActions() {
  document.querySelectorAll('#tab-users [data-act="kebab"]').forEach(btn => {
    btn.addEventListener('click', () => openRowMenu(btn));
  });
}

function openRowMenu(trigger) {
  const u = _cachedUsers.find(x => x.id === trigger.dataset.id);
  if (!u) return;
  const isSelf = u.id === currentUser?.id;
  const actions = u.confirmed
    ? [
        { label: 'Editar acceso', icon: 'fa-user-pen', onClick: () => openEdit(u) },
        { label: 'Restablecer 2FA', icon: 'fa-shield-halved', onClick: () => doResetMfa(u) },
        ...(isSelf ? [] : [{ label: 'Eliminar cuenta', icon: 'fa-trash', variant: 'danger', onClick: () => doDelete(u) }]),
      ]
    : [
        { label: 'Reenviar invitación', icon: 'fa-rotate', onClick: () => doResend(u) },
        { label: 'Cancelar invitación', icon: 'fa-xmark', variant: 'danger', onClick: () => doRevoke(u) },
      ];
  showActionSheet({ trigger, title: u.display_name || u.email, subtitle: u.email, actions });
}

async function doResetMfa(u) {
  const who = u.display_name || u.email;
  if (!await confirm('Restablecer 2FA',
    `Se eliminará la verificación en dos pasos de ${who}. Tendrá que configurarla de nuevo ` +
    `la próxima vez que inicie sesión. ¿Continuar?`)) return;
  try { await callAdmin('reset-mfa', { user_id: u.id }); toast('Verificación 2FA restablecida', 'success'); loadUsers(); }
  catch (e) { toast(e.message, 'error'); }
}
async function doDelete(u) {
  const who = u.display_name || u.email;
  if (!await confirm('Eliminar cuenta', `Se eliminará la cuenta de ${who} de forma permanente. ¿Continuar?`)) return;
  try { await callAdmin('delete', { user_id: u.id }); toast('Cuenta eliminada', 'success'); loadUsers(); }
  catch (e) { toast(e.message, 'error'); }
}
async function doResend(u) {
  try { await callAdmin('resend', { user_id: u.id }); toast('Invitación reenviada a ' + u.email, 'success'); loadUsers(); }
  catch (e) { toast(e.message, 'error'); }
}
async function doRevoke(u) {
  if (!await confirm('Cancelar invitación', `Se cancelará la invitación de ${u.email}. ¿Continuar?`)) return;
  try { await callAdmin('revoke', { user_id: u.id }); toast('Invitación cancelada', 'success'); loadUsers(); }
  catch (e) { toast(e.message, 'error'); }
}

// ── Invite / edit modal ──────────────────────────────────────────────────────
async function fillPresetSelect(selectedId) {
  const sel = document.getElementById('invPreset');
  if (!sel) return;
  let presets;
  try { presets = await fetchPresets(); }   // refresh so newly-created presets show
  catch { presets = getPresets(); }
  sel.innerHTML = presets.length
    ? presets.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
    : '<option value="">No hay presets — crea uno en «Roles y accesos»</option>';
  if (selectedId) sel.value = selectedId;
}

// A ministry/team is assigned only to ministry_leader-based presets — it links
// the user to the treasurer's budget allocations for those ministries. A leader
// may hold SEVERAL (e.g. a "Youth & Kids Manager" leads Youth + Kids), so the
// picker is a checkbox dropdown.
function presetBaseRole(presetId) {
  return getPresets().find(p => p.id === presetId)?.base_role || null;
}

// Currently-checked ministry ids (Set of strings) for the open modal.
let selMinistries = new Set();

function updateMinistryLabel() {
  const label = document.getElementById('invMinistryLabel');
  if (!label) return;
  const picked = ministries.filter(m => selMinistries.has(m.id));
  label.textContent = picked.length === 0 ? 'Sin ministerio'
    : picked.length === 1 ? picked[0].name
    : `${picked.length} ministerios`;
  label.classList.toggle('is-empty', picked.length === 0);
}

function fillMinistrySelect(selectedIds = []) {
  selMinistries = new Set((selectedIds || []).filter(Boolean).map(String));
  const menu = document.getElementById('invMinistryMenu');
  if (menu) {
    menu.innerHTML = ministries.length
      ? ministries.map(m => `
          <label class="ms-select__opt">
            <input type="checkbox" value="${esc(m.id)}"${selMinistries.has(m.id) ? ' checked' : ''}>
            <span>${esc(m.name)}</span>
          </label>`).join('')
      : '<p class="ms-select__empty">No hay ministerios. Créalos en «Ministerios».</p>';
    menu.querySelectorAll('input[type="checkbox"]').forEach(cb =>
      cb.addEventListener('change', () => {
        cb.checked ? selMinistries.add(cb.value) : selMinistries.delete(cb.value);
        updateMinistryLabel();
      }));
  }
  updateMinistryLabel();
}

function closeMinistryMenu() {
  const menu = document.getElementById('invMinistryMenu');
  const btn  = document.getElementById('invMinistryBtn');
  if (menu) menu.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
}

// Open the menu above the field when the button sits low in the (scrollable)
// modal, so the list never spills past the popup.
function positionMinistryMenu(menu, btn) {
  menu.classList.remove('ms-select__menu--up');
  const modal = btn.closest('.modal');
  if (!modal) return;
  const b = btn.getBoundingClientRect();
  const m = modal.getBoundingClientRect();
  const needed = Math.min(menu.scrollHeight, 188) + 14;
  const below = m.bottom - b.bottom;
  const above = b.top - m.top;
  if (below < needed && above > below) menu.classList.add('ms-select__menu--up');
}

function toggleMinistry() {
  const grp = document.getElementById('invMinistryGroup');
  if (grp) grp.hidden = presetBaseRole(document.getElementById('invPreset').value) !== 'ministry_leader';
  if (grp?.hidden) closeMinistryMenu();
}

function setModalErr(msg) {
  const el = document.getElementById('userModalError');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

async function openInvite() {
  document.getElementById('userModalTitle').textContent = 'Invitar usuario';
  document.getElementById('invUserId').value = '';
  document.getElementById('invName').value   = '';
  document.getElementById('invEmail').value  = '';
  document.getElementById('invNameGroup').hidden  = false;
  document.getElementById('invEmailGroup').hidden = false;
  document.getElementById('userModalSave').innerHTML =
    '<i class="fas fa-paper-plane"></i> Enviar invitación';
  setModalErr('');
  openModal('userModal');
  await fillPresetSelect();
  fillMinistrySelect([]);
  toggleMinistry();
}

async function openEdit(u) {
  document.getElementById('userModalTitle').textContent = 'Editar acceso';
  document.getElementById('invUserId').value = u.id;
  document.getElementById('invName').value   = u.display_name || '';
  document.getElementById('invEmail').value  = u.email || '';
  document.getElementById('invNameGroup').hidden  = true;
  document.getElementById('invEmailGroup').hidden = true;
  document.getElementById('userModalSave').innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
  setModalErr('');
  openModal('userModal');
  await fillPresetSelect(u.preset_id);
  fillMinistrySelect(Array.isArray(u.ministry_ids) && u.ministry_ids.length
    ? u.ministry_ids
    : (u.ministry_id ? [u.ministry_id] : []));
  toggleMinistry();
}

async function saveModal() {
  const userId    = document.getElementById('invUserId').value;
  const preset_id = document.getElementById('invPreset').value;
  const btn = document.getElementById('userModalSave');
  setModalErr('');

  if (!preset_id) { setModalErr('Selecciona un preset de acceso.'); return; }

  // Send the array (new function) plus the first id as ministry_id (so an
  // un-redeployed function still records at least the primary ministry).
  const ministry_ids = presetBaseRole(preset_id) === 'ministry_leader' ? [...selMinistries] : [];
  const ministry_id  = ministry_ids[0] || null;

  btn.disabled = true;
  try {
    if (userId) {
      await callAdmin('set-role', { user_id: userId, preset_id, ministry_ids, ministry_id });
      toast('Usuario actualizado', 'success');
    } else {
      const name  = document.getElementById('invName').value.trim();
      const email = document.getElementById('invEmail').value.trim();
      if (!name)  { setModalErr('Ingresa el nombre de la persona.'); return; }
      if (!email) { setModalErr('Ingresa el correo electrónico.');   return; }
      await callAdmin('invite', { email, preset_id, display_name: name, ministry_ids, ministry_id });
      toast('Invitación enviada a ' + email, 'success');
    }
    closeModal('userModal');
    loadUsers();
  } catch (e) {
    setModalErr(e.message);
  } finally {
    btn.disabled = false;
  }
}

export function initUserModal() {
  document.getElementById('addUserBtn')?.addEventListener('click', openInvite);
  document.getElementById('invPreset')?.addEventListener('change', toggleMinistry);
  document.getElementById('userModalSave')?.addEventListener('click', saveModal);
  document.getElementById('userModalClose')?.addEventListener('click',  () => closeModal('userModal'));
  document.getElementById('userModalCancel')?.addEventListener('click', () => closeModal('userModal'));

  // Ministry checkbox dropdown: toggle open, close on outside click.
  const msBtn = document.getElementById('invMinistryBtn');
  msBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('invMinistryMenu');
    if (!menu) return;
    const open = menu.hidden;
    menu.hidden = !open;
    msBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) positionMinistryMenu(menu, msBtn);
  });
  document.getElementById('invMinistrySelect')?.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => closeMinistryMenu());
}
