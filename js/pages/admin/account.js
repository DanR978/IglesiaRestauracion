// js/pages/admin/account.js
// "Mi cuenta" — self-service: view your account, change your own password,
// reconfigure your own two-factor authentication.

import { sb, currentUser, currentProfile } from './state.js';
import { toast, openModal, closeModal, confirm } from './ui.js';
import { reEnrollMfa } from './auth.js';

function setErr(msg) {
  const el = document.getElementById('accountError');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function openAccount() {
  const p = currentProfile || {};
  const isAdmin = p.role === 'admin';

  document.getElementById('accName').textContent  = p.display_name || currentUser?.email || '—';
  document.getElementById('accEmail').textContent = currentUser?.email || '—';

  const roleEl = document.getElementById('accRole');
  roleEl.textContent = isAdmin ? 'Administrador' : 'Líder de ministerio';
  roleEl.className   = 'role-badge role--' + (p.role || 'ministry_leader');

  document.getElementById('accMinistry').textContent = isAdmin
    ? 'Acceso total a todos los ministerios'
    : (p.ministries?.name || 'Ministerio asignado');

  document.getElementById('accPw1').value = '';
  document.getElementById('accPw2').value = '';
  setErr('');
  openModal('accountModal');
}

async function changePassword() {
  const p1  = document.getElementById('accPw1').value;
  const p2  = document.getElementById('accPw2').value;
  const btn = document.getElementById('accountPwBtn');
  setErr('');
  if (p1.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
  if (p1 !== p2)     { setErr('Las contraseñas no coinciden.'); return; }

  btn.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    document.getElementById('accPw1').value = '';
    document.getElementById('accPw2').value = '';
    toast('Contraseña actualizada', 'success');
  } catch (e) {
    setErr(e.message || 'No se pudo cambiar la contraseña.');
  } finally {
    btn.disabled = false;
  }
}

export function initAccountModal() {
  document.getElementById('topbarUser')?.addEventListener('click', openAccount);
  document.getElementById('accountModalClose')?.addEventListener('click', () => closeModal('accountModal'));
  document.getElementById('accountModalDone')?.addEventListener('click',  () => closeModal('accountModal'));
  document.getElementById('accountPwBtn')?.addEventListener('click', changePassword);
  document.getElementById('accountMfaBtn')?.addEventListener('click', async () => {
    const ok = await confirm('Reconfigurar verificación en dos pasos',
      'Se eliminará tu autenticador actual y configurarás uno nuevo ahora mismo. ¿Continuar?');
    if (!ok) return;
    closeModal('accountModal');
    reEnrollMfa();
  });
}
