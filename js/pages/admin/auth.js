// js/pages/admin/auth.js
// Login, logout, and boot sequence.

import { sb, setCurrentUser, setCurrentProfile, isAdmin, isPastor, isStaff } from './state.js';
import { loadMinistries }   from './ministries.js';
import { loadUpcoming }     from './events-tab.js';
import { initForms }        from './event-form.js';
import { toast }            from './ui.js';

export async function tryLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('authError');
  const btn      = document.getElementById('loginBtn');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
    if (error) { errEl.textContent = `Error: ${error.message}`; errEl.style.display = ''; return; }
    await bootApp(data.user);
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
    errEl.textContent = `Error inesperado: ${e.message}`;
    errEl.style.display = '';
  }
}

export async function bootApp(user) {
  setCurrentUser(user);

  const { data: profile, error: profileErr } = await sb
    .from('profiles').select('*,ministries(name,color)').eq('id', user.id).single();
  if (profileErr) console.error('[admin] Profile load FAILED:', profileErr.message);

  const p = profile || { role: 'ministry', display_name: user.email, ministry_id: null };
  setCurrentProfile(p);

  document.getElementById('topbarUser').textContent = p.display_name || user.email;

  if (isAdmin()) {
    document.body.classList.add('is-admin');
    document.getElementById('topbarMinistry').textContent = '— Admin';
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  } else if (isPastor()) {
    document.body.classList.add('is-pastor');
    document.getElementById('topbarMinistry').textContent = '— Pastor';
  } else {
    document.getElementById('topbarMinistry').textContent =
      `— ${profile?.ministries?.name || 'Ministerio'}`;
  }

  // Staff (admin OR pastor) get access to the Discipulado tab
  if (isStaff()) {
    document.body.classList.add('is-staff');
    document.querySelectorAll('[data-staff-only]').forEach(el => el.style.display = '');
  }

  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  await loadMinistries();
  await loadUpcoming();
  initForms();
}

export async function logout() {
  await sb.auth.signOut();
  window.location.reload();
}

export async function restoreSession() {
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) { console.error('[admin] getSession error:', error); return; }
    if (data?.session?.user) await bootApp(data.session.user);
  } catch (e) {
    console.error('[admin] Session check threw:', e);
  }
}