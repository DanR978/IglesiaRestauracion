import { esc } from '/js/utils/escape.js';
// js/pages/admin/users.js
// ─────────────────────────────────────────────────────────────────────────────
// "Cuentas y Accesos" tab — invite-only account management.
//   • Pending invitations  — resend / revoke
//   • Active users         — edit role, reset 2FA, delete
// Every privileged operation goes through the `admin-invite` Edge Function,
// which runs with the service-role key and re-checks that the caller is admin.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, ministries, currentUser } from './state.js';
import { toast, openModal, closeModal, confirm } from './ui.js';
import { showActionSheet } from '/js/components/action-sheet.js';

const ROLE_LABEL = { admin: 'Administrador', ministry_leader: 'Líder de ministerio', treasurer: 'Tesorero' };

// Pages an admin may grant to a ministry_leader. Keys MUST match the nav
// data-tab values, the edge function GRANTABLE_TABS, and the RLS grant keys.
const GRANTABLE_TABS = [
  { key: 'analytics',      label: 'Analíticas',     icon: 'fa-chart-line' },
  { key: 'upcoming',       label: 'Próximos',       icon: 'fa-calendar-day' },
  { key: 'past',           label: 'Pasados',        icon: 'fa-history' },
  { key: 'calendario',     label: 'Calendario',     icon: 'fa-calendar-week' },
  { key: 'special-events', label: 'Registraciones', icon: 'fa-clipboard-list' },
  { key: 'discipulado',    label: 'Discipulado',    icon: 'fa-hand-holding-heart' },
  { key: 'galeria',        label: 'Galería',        icon: 'fa-images' },
];
const GRANTABLE_KEYS = GRANTABLE_TABS.map(t => t.key);
const MEDIOS_PRESET  = ['analytics', 'upcoming', 'past', 'calendario', 'special-events', 'galeria'];

let _cachedUsers = [];

// ── Edge-function call helper ────────────────────────────────────────────────
async function callAdmin(action, payload = {}) {
  const { data, error } = await sb.functions.invoke('admin-invite', {
    body: { action, ...payload },
  });
  if (error) {
    let msg = 'No se pudo completar la operación.';
    try {
      const body = await error.context.json();
      if (body?.error) msg = body.error;
    } catch { msg = error.message || msg; }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ── Small helpers ────────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').split(' ').filter(Boolean)
    .map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
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

function roleBadge(role) {
  return `<span class="role-badge role--${role}">${ROLE_LABEL[role] || role || '—'}</span>`;
}

// Meta line for a ministry leader: ministry name + how many pages they can open.
function leaderMeta(u) {
  const ministry = esc(u.ministry || 'Sin ministerio');
  const n = Array.isArray(u.allowed_tabs) ? u.allowed_tabs.length : 0;
  return `${ministry} · ${n} ${n === 1 ? 'página' : 'páginas'}`;
}

function renderActive(u) {
  const mfaBadge = u.mfa
    ? '<span class="acc-badge acc-badge--ok"><i class="fas fa-shield-halved"></i> 2FA activo</span>'
    : '<span class="acc-badge acc-badge--warn"><i class="fas fa-triangle-exclamation"></i> sin 2FA</span>';
  const meta   = u.role === 'ministry_leader' ? leaderMeta(u) : 'Acceso total';
  const isSelf = u.id === currentUser?.id;
  return `
    <div class="user-row" data-id="${u.id}">
      <div class="user-row__avatar">${esc(initials(u.display_name))}</div>
      <div class="user-row__info">
        <div class="user-row__name">${esc(u.display_name || u.email)}${
          isSelf ? ' <span class="acc-you">(tú)</span>' : ''}</div>
        <div class="user-row__meta">${esc(u.email)} · ${meta}</div>
      </div>
      <div class="user-row__badges">${roleBadge(u.role)} ${mfaBadge}</div>
      <div class="user-row__actions">
        <button class="adm-icon-btn" data-act="kebab" data-id="${u.id}" title="Acciones" aria-label="Acciones">
          <i class="fas fa-ellipsis-vertical"></i></button>
      </div>
    </div>`;
}

function renderPending(u) {
  const meta = u.role === 'ministry_leader' ? leaderMeta(u) : 'Acceso total';
  return `
    <div class="user-row user-row--pending" data-id="${u.id}">
      <div class="user-row__avatar user-row__avatar--pending"><i class="fas fa-paper-plane"></i></div>
      <div class="user-row__info">
        <div class="user-row__name">${esc(u.display_name || u.email)}</div>
        <div class="user-row__meta">${esc(u.email)} · ${meta} · esperando que acepte</div>
      </div>
      <div class="user-row__badges">${roleBadge(u.role)}</div>
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
        { label: 'Editar rol / ministerio', icon: 'fa-user-pen', onClick: () => openEdit(u) },
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
function fillMinistrySelect() {
  const sel = document.getElementById('invMinistry');
  if (sel) sel.innerHTML = ministries
    .map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
}

function toggleMinistry() {
  const isLeader = document.getElementById('invRole').value === 'ministry_leader';
  // A ministry leader is scoped to one ministry; an admin spans them all,
  // so the ministry picker is hidden (and never saved) for admins.
  document.getElementById('invMinistryGroup').hidden = !isLeader;
  // Page grants only apply to ministry leaders.
  const tabsGroup = document.getElementById('invTabsGroup');
  if (tabsGroup) tabsGroup.hidden = !isLeader;
  const note = document.getElementById('invAdminNote');
  if (note) note.hidden = isLeader;
}

// ── Page-permission checklist ─────────────────────────────────────────────────
function renderTabChecklist(selected = []) {
  const sel = new Set(selected);
  const list = document.getElementById('invTabsList');
  if (!list) return;
  list.innerHTML = GRANTABLE_TABS.map(t => `
    <label class="perm-item">
      <input type="checkbox" value="${t.key}"${sel.has(t.key) ? ' checked' : ''}>
      <i class="fas ${t.icon}"></i> <span>${esc(t.label)}</span>
    </label>`).join('');
}

function getSelectedTabs() {
  return Array.from(document.querySelectorAll('#invTabsList input:checked'))
    .map(cb => cb.value)
    .filter(v => GRANTABLE_KEYS.includes(v));
}

function applyMediosPreset() {
  // The preset only makes sense for a scoped leader.
  const roleSel = document.getElementById('invRole');
  if (roleSel.value !== 'ministry_leader') { roleSel.value = 'ministry_leader'; toggleMinistry(); }
  renderTabChecklist(MEDIOS_PRESET);
}

function setModalErr(msg) {
  const el = document.getElementById('userModalError');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function openInvite() {
  document.getElementById('userModalTitle').textContent = 'Invitar usuario';
  document.getElementById('invUserId').value = '';
  document.getElementById('invName').value   = '';
  document.getElementById('invEmail').value  = '';
  document.getElementById('invRole').value   = 'ministry_leader';
  document.getElementById('invNameGroup').hidden  = false;
  document.getElementById('invEmailGroup').hidden = false;
  document.getElementById('invNote').hidden = false;
  document.getElementById('userModalSave').innerHTML =
    '<i class="fas fa-paper-plane"></i> Enviar invitación';
  fillMinistrySelect();
  renderTabChecklist([]);
  toggleMinistry();
  setModalErr('');
  openModal('userModal');
}

function openEdit(u) {
  document.getElementById('userModalTitle').textContent = 'Editar usuario';
  document.getElementById('invUserId').value = u.id;
  document.getElementById('invName').value   = u.display_name || '';
  document.getElementById('invEmail').value  = u.email || '';
  document.getElementById('invRole').value   = u.role || 'ministry_leader';
  document.getElementById('invNameGroup').hidden  = true;
  document.getElementById('invEmailGroup').hidden = true;
  document.getElementById('invNote').hidden = true;
  document.getElementById('userModalSave').innerHTML = '<i class="fas fa-save"></i> Guardar cambios';
  fillMinistrySelect();
  if (u.ministry_id) document.getElementById('invMinistry').value = u.ministry_id;
  renderTabChecklist(u.allowed_tabs || []);
  toggleMinistry();
  setModalErr('');
  openModal('userModal');
}

async function saveModal() {
  const userId = document.getElementById('invUserId').value;
  const role   = document.getElementById('invRole').value;
  const minId  = document.getElementById('invMinistry').value;
  const ministry_id = role === 'ministry_leader' ? minId : null;
  const allowed_tabs = role === 'ministry_leader' ? getSelectedTabs() : [];
  const btn = document.getElementById('userModalSave');
  setModalErr('');

  if (role === 'ministry_leader' && !ministry_id) {
    setModalErr('Selecciona el ministerio del líder.');
    return;
  }

  btn.disabled = true;
  try {
    if (userId) {
      await callAdmin('set-role', { user_id: userId, role, ministry_id, allowed_tabs });
      toast('Usuario actualizado', 'success');
    } else {
      const name  = document.getElementById('invName').value.trim();
      const email = document.getElementById('invEmail').value.trim();
      if (!name)  { setModalErr('Ingresa el nombre de la persona.'); return; }
      if (!email) { setModalErr('Ingresa el correo electrónico.');   return; }
      await callAdmin('invite', { email, role, ministry_id, display_name: name, allowed_tabs });
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
  document.getElementById('invRole')?.addEventListener('change', toggleMinistry);
  document.getElementById('invMediosPreset')?.addEventListener('click', applyMediosPreset);
  document.getElementById('userModalSave')?.addEventListener('click', saveModal);
  document.getElementById('userModalClose')?.addEventListener('click',  () => closeModal('userModal'));
  document.getElementById('userModalCancel')?.addEventListener('click', () => closeModal('userModal'));
}
