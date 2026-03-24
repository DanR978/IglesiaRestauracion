// js/pages/admin/users.js

import { sb, ministries } from './state.js';
import { toast, openModal, closeModal } from './ui.js';

export async function loadUsers() {
  const el = document.getElementById('usersList');
  el.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  const { data, error } = await sb.from('profiles').select('*').order('created_at');
  if (error) { el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>${error.message}</p></div>`; return; }
  if (!data?.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No hay usuarios todavía.</p></div>'; return; }
  el.innerHTML = data.map(u => {
    const initials = (u.display_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const mObj     = ministries.find(x => x.id === u.ministry_id) || null;
    const minName  = mObj?.name || '—';
    const minDot   = mObj?.color
      ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${mObj.color};margin-right:4px"></span>`
      : '';
    return `
      <div class="user-row">
        <div class="user-row__avatar">${initials}</div>
        <div class="user-row__info">
          <div class="user-row__name">${u.display_name || '—'}</div>
          <div class="user-row__meta">${minDot}${minName}</div>
        </div>
        <span class="role-badge role--${u.role}">${u.role === 'admin' ? 'Admin' : 'Ministerio'}</span>
      </div>`;
  }).join('');
}

export function initUserModal() {
  document.getElementById('addUserBtn')?.addEventListener('click', () => {
    document.getElementById('uName').value     = '';
    document.getElementById('uEmail').value    = '';
    document.getElementById('uPassword').value = '';
    document.getElementById('uRole').value     = 'ministry';
    document.getElementById('userModalError').style.display = 'none';
    openModal('userModal');
  });

  document.getElementById('userModalSave')?.addEventListener('click', async () => {
    const name     = document.getElementById('uName').value.trim();
    const email    = document.getElementById('uEmail').value.trim();
    const password = document.getElementById('uPassword').value;
    const role     = document.getElementById('uRole').value;
    const minId    = document.getElementById('uMinistry').value;
    const errEl    = document.getElementById('userModalError');

    if (!name || !email || !password) {
      errEl.textContent = 'Nombre, correo y contraseña son obligatorios.';
      errEl.style.display = '';
      return;
    }
    errEl.style.display = 'none';
    const btn = document.getElementById('userModalSave');
    btn.disabled = true;
    const { error } = await sb.auth.signUp({
      email, password,
      options: { data: { display_name: name, role, ministry_id: minId || null } },
    });
    btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.style.display = ''; return; }
    closeModal('userModal');
    toast(`Usuario creado: ${name}`, 'success');
    loadUsers();
  });

  document.getElementById('userModalClose')?.addEventListener('click',  () => closeModal('userModal'));
  document.getElementById('userModalCancel')?.addEventListener('click', () => closeModal('userModal'));
}