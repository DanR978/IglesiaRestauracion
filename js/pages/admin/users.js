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

const ROLE_LABEL = { admin: 'Administrador', ministry_leader: 'Líder de ministerio' };

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
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function renderActive(u) {
  const mfaBadge = u.mfa
    ? '<span class="acc-badge acc-badge--ok"><i class="fas fa-shield-halved"></i> 2FA activo</span>'
    : '<span class="acc-badge acc-badge--warn"><i class="fas fa-triangle-exclamation"></i> sin 2FA</span>';
  const meta   = u.role === 'ministry_leader' ? esc(u.ministry || 'Sin ministerio') : 'Acceso total';
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
        <button class="adm-icon-btn" data-act="edit" data-id="${u.id}" title="Editar rol">
          <i class="fas fa-user-pen"></i></button>
        <button class="adm-icon-btn" data-act="reset-mfa" data-id="${u.id}" title="Restablecer 2FA">
          <i class="fas fa-shield-halved"></i></button>
        ${isSelf ? '' : `<button class="adm-icon-btn adm-icon-btn--danger" data-act="delete" data-id="${u.id}" title="Eliminar cuenta">
          <i class="fas fa-trash"></i></button>`}
      </div>
    </div>`;
}

function renderPending(u) {
  const meta = u.role === 'ministry_leader' ? esc(u.ministry || 'Sin ministerio') : 'Acceso total';
  return `
    <div class="user-row user-row--pending" data-id="${u.id}">
      <div class="user-row__avatar user-row__avatar--pending"><i class="fas fa-paper-plane"></i></div>
      <div class="user-row__info">
        <div class="user-row__name">${esc(u.display_name || u.email)}</div>
        <div class="user-row__meta">${esc(u.email)} · ${meta} · esperando que acepte</div>
      </div>
      <div class="user-row__badges">${roleBadge(u.role)}</div>
      <div class="user-row__actions">
        <button class="adm-icon-btn" data-act="resend" data-id="${u.id}" title="Reenviar invitación">
          <i class="fas fa-rotate"></i></button>
        <button class="adm-icon-btn adm-icon-btn--danger" data-act="revoke" data-id="${u.id}" title="Cancelar invitación">
          <i class="fas fa-xmark"></i></button>
      </div>
    </div>`;
}

// ── Row actions ──────────────────────────────────────────────────────────────
function wireActions() {
  document.querySelectorAll('#tab-users [data-act]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.act, btn.dataset.id));
  });
}

async function handleAction(act, id) {
  const u = _cachedUsers.find(x => x.id === id);
  if (!u) return;
  const who = u.display_name || u.email;
  try {
    if (act === 'edit') return openEdit(u);

    if (act === 'reset-mfa') {
      if (!await confirm('Restablecer 2FA',
        `Se eliminará la verificación en dos pasos de ${who}. Tendrá que configurarla de nuevo ` +
        `la próxima vez que inicie sesión. ¿Continuar?`)) return;
      await callAdmin('reset-mfa', { user_id: id });
      toast('Verificación 2FA restablecida', 'success');
      return loadUsers();
    }

    if (act === 'delete') {
      if (!await confirm('Eliminar cuenta',
        `Se eliminará la cuenta de ${who} de forma permanente. ¿Continuar?`)) return;
      await callAdmin('delete', { user_id: id });
      toast('Cuenta eliminada', 'success');
      return loadUsers();
    }

    if (act === 'resend') {
      await callAdmin('resend', { user_id: id });
      toast('Invitación reenviada a ' + u.email, 'success');
      return loadUsers();
    }

    if (act === 'revoke') {
      if (!await confirm('Cancelar invitación',
        `Se cancelará la invitación de ${u.email}. ¿Continuar?`)) return;
      await callAdmin('revoke', { user_id: id });
      toast('Invitación cancelada', 'success');
      return loadUsers();
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Invite / edit modal ──────────────────────────────────────────────────────
function fillMinistrySelect() {
  const sel = document.getElementById('invMinistry');
  if (sel) sel.innerHTML = ministries
    .map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
}

function toggleMinistry() {
  document.getElementById('invMinistryGroup').hidden =
    document.getElementById('invRole').value !== 'ministry_leader';
}

function setModalErr(msg) {
  const el = document.getElementById('userModalError');
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
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
  toggleMinistry();
  setModalErr('');
  openModal('userModal');
}

async function saveModal() {
  const userId = document.getElementById('invUserId').value;
  const role   = document.getElementById('invRole').value;
  const minId  = document.getElementById('invMinistry').value;
  const ministry_id = role === 'ministry_leader' ? minId : null;
  const btn = document.getElementById('userModalSave');
  setModalErr('');

  if (role === 'ministry_leader' && !ministry_id) {
    setModalErr('Selecciona el ministerio del líder.');
    return;
  }

  btn.disabled = true;
  try {
    if (userId) {
      await callAdmin('set-role', { user_id: userId, role, ministry_id });
      toast('Usuario actualizado', 'success');
    } else {
      const name  = document.getElementById('invName').value.trim();
      const email = document.getElementById('invEmail').value.trim();
      if (!name)  { setModalErr('Ingresa el nombre de la persona.'); return; }
      if (!email) { setModalErr('Ingresa el correo electrónico.');   return; }
      await callAdmin('invite', { email, role, ministry_id, display_name: name });
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
  document.getElementById('userModalSave')?.addEventListener('click', saveModal);
  document.getElementById('userModalClose')?.addEventListener('click',  () => closeModal('userModal'));
  document.getElementById('userModalCancel')?.addEventListener('click', () => closeModal('userModal'));
}
