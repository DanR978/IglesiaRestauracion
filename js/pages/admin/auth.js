// js/pages/admin/auth.js
// ─────────────────────────────────────────────────────────────────────────────
// Authentication for the admin panel.
//   • Login (email + password)
//   • Mandatory two-factor auth — enrollment for new accounts, challenge for
//     returning ones (see mfa.js)
//   • Invitation acceptance — an invited user sets their first password
//   • Password recovery — "forgot password" + reset landing
//   • Session boot — restores a session with no login-screen flash
//
// `initAuth()` wires every auth control and runs the boot sequence. It is the
// only export the entry point (index.js) needs, plus `logout`.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, setCurrentUser, setCurrentProfile } from './state.js';
import { loadMinistries } from './ministries.js';
import { loadUpcoming }   from './events-tab.js';
import { loadDashboard }  from './dashboard.js';
import { initForms }      from './event-form.js';
import { initNotifications } from './notifications.js';
import { toast }          from './ui.js';
import * as mfa           from './mfa.js';

// ─── Screen routing ───────────────────────────────────────────────────────────
const CARDS = ['bootCard', 'loginCard', 'mfaCard', 'inviteCard', 'forgotCard'];

function showCard(id) {
  const screen = document.getElementById('authScreen');
  if (screen) screen.hidden = false;
  document.getElementById('app').style.display = 'none';
  CARDS.forEach(c => {
    const el = document.getElementById(c);
    if (el) el.hidden = (c !== id);
  });
}

function showApp() {
  const screen = document.getElementById('authScreen');
  if (screen) screen.hidden = true;
  document.getElementById('app').style.display = 'block';
}

// ─── Friendly Spanish error messages ──────────────────────────────────────────
function spanishError(err) {
  const m = (err?.message || String(err) || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed'))
    return 'Tu cuenta aún no ha sido activada. Revisa tu correo.';
  if (m.includes('too many') || m.includes('rate limit'))
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (m.includes('totp') || m.includes('invalid code') ||
      m.includes('challenge') || m.includes('factor'))
    return 'Código incorrecto o expirado. Revisa tu app e intenta de nuevo.';
  if (m.includes('weak password') || m.includes('at least') || m.includes('6 characters'))
    return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
  if (m.includes('different from the old') || m.includes('should be different'))
    return 'La nueva contraseña debe ser distinta a la anterior.';
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Error de conexión. Revisa tu internet e intenta de nuevo.';
  if (m.includes('not allowed') || m.includes('disabled'))
    return 'Esta operación no está permitida.';
  if (m.includes('session missing') || m.includes('session not found') ||
      m.includes('session_not_found'))
    return 'Tu sesión expiró. Vuelve a abrir el enlace o pide uno nuevo.';
  return err?.message || 'Ocurrió un error inesperado. Intenta de nuevo.';
}

// Shown when an invite / reset link is expired, already used, or was consumed
// by an email scanner before the user could click it.
function expiredLinkMsg(action) {
  return action === 'reset-password'
    ? 'El enlace para restablecer la contraseña expiró o ya fue usado. ' +
      'Solicita uno nuevo desde "¿Olvidaste tu contraseña?".'
    : 'El enlace de invitación expiró o ya fue usado. ' +
      'Pide al administrador que te reenvíe la invitación.';
}

function setErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function busy(btn, on, restoreHtml) {
  if (!btn) return;
  btn.disabled = on;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Espera...';
  } else {
    btn.innerHTML = restoreHtml || btn.dataset.label || btn.innerHTML;
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function doLogin() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginBtn');

  setErr('authError', '');
  if (!email || !password) {
    setErr('authError', 'Ingresa tu correo y tu contraseña.');
    return;
  }

  busy(btn, true);
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await routeAfterLogin();
  } catch (e) {
    setErr('authError', spanishError(e));
    busy(btn, false, '<i class="fas fa-sign-in-alt"></i> Entrar');
  }
}

// After any successful credential step, go straight into the panel.
// (Two-factor auth is no longer a required step.)
async function routeAfterLogin() {
  return bootApp();
}

// ─── MFA ──────────────────────────────────────────────────────────────────────
async function showMfaEnroll() {
  showCard('mfaCard');
  document.getElementById('mfaEnroll').hidden    = false;
  document.getElementById('mfaChallenge').hidden = true;
  document.getElementById('mfaCardSub').textContent = 'Configura la verificación en dos pasos';
  document.getElementById('mfaCode').value = '';
  setErr('mfaError', '');
  try {
    const { qr, secret } = await mfa.beginEnroll();
    document.getElementById('mfaQrImg').src = qr;
    document.getElementById('mfaSecret').textContent = secret;
  } catch (e) {
    setErr('mfaError', spanishError(e));
  }
}

async function showMfaChallenge() {
  showCard('mfaCard');
  document.getElementById('mfaEnroll').hidden    = true;
  document.getElementById('mfaChallenge').hidden = false;
  document.getElementById('mfaCardSub').textContent = 'Verificación en dos pasos';
  document.getElementById('mfaCode').value = '';
  setErr('mfaError', '');
  try {
    const ok = await mfa.beginChallenge();
    if (!ok) return showMfaEnroll();   // no verified factor — enroll instead
  } catch (e) {
    setErr('mfaError', spanishError(e));
  }
  document.getElementById('mfaCode').focus();
}

/** Re-enroll 2FA from inside the panel (used by the "Mi cuenta" screen). */
export async function reEnrollMfa() {
  try { await mfa.unenrollAll(); } catch { /* ignore */ }
  showMfaEnroll();
}

async function verifyMfa() {
  const code = document.getElementById('mfaCode').value.trim();
  const btn  = document.getElementById('mfaVerifyBtn');
  setErr('mfaError', '');
  if (!/^\d{6}$/.test(code)) {
    setErr('mfaError', 'Ingresa el código de 6 dígitos.');
    return;
  }
  busy(btn, true);
  try {
    await mfa.submitCode(code);
    toast('Verificación completada', 'success');
    await bootApp();
  } catch (e) {
    setErr('mfaError', spanishError(e));
    busy(btn, false, '<i class="fas fa-shield-alt"></i> Verificar');
  }
}

// ─── Invitation acceptance / password reset ──────────────────────────────────
async function showSetPassword(mode) {            // mode: 'invite' | 'recovery'
  showCard('inviteCard');
  const recovery = mode === 'recovery';
  document.getElementById('inviteHeading').textContent =
    recovery ? 'Restablece tu contraseña' : 'Activa tu cuenta';
  document.getElementById('inviteCardSub').textContent =
    recovery ? 'Elige una contraseña nueva' : 'Crea tu contraseña para empezar';
  document.getElementById('invitePassword').value  = '';
  document.getElementById('invitePassword2').value = '';
  document.getElementById('inviteCard').dataset.mode = mode;
  setErr('inviteError', '');
}

async function submitSetPassword() {
  const mode = document.getElementById('inviteCard').dataset.mode || 'invite';
  const pw   = document.getElementById('invitePassword').value;
  const pw2  = document.getElementById('invitePassword2').value;
  const btn  = document.getElementById('inviteBtn');

  setErr('inviteError', '');
  if (pw.length < 8) {
    setErr('inviteError', 'La contraseña debe tener al menos 8 caracteres.');
    return;
  }
  if (pw !== pw2) {
    setErr('inviteError', 'Las contraseñas no coinciden.');
    return;
  }

  busy(btn, true);
  try {
    // Make sure the link-established session is still here before we try to set
    // the password — otherwise updateUser throws a cryptic "Auth session missing!".
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      busy(btn, false, '<i class="fas fa-arrow-right"></i> Continuar');
      showCard('loginCard');
      setErr('authError', expiredLinkMsg(mode === 'recovery' ? 'reset-password' : 'accept-invite'));
      return;
    }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) throw error;
    history.replaceState({}, '', location.pathname);   // strip ?action= + tokens
    toast(mode === 'recovery' ? 'Contraseña actualizada' : 'Cuenta activada', 'success');
    await routeAfterLogin();                            // → MFA enroll / challenge
  } catch (e) {
    setErr('inviteError', spanishError(e));
    busy(btn, false, '<i class="fas fa-arrow-right"></i> Continuar');
  }
}

// ─── Forgot password ─────────────────────────────────────────────────────────
function showForgot() {
  showCard('forgotCard');
  document.getElementById('forgotEmail').value =
    document.getElementById('loginEmail').value.trim();
  document.getElementById('forgotMsg').hidden = true;
  setErr('forgotError', '');
}

async function submitForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  const btn   = document.getElementById('forgotBtn');
  setErr('forgotError', '');
  if (!email) {
    setErr('forgotError', 'Ingresa tu correo electrónico.');
    return;
  }
  busy(btn, true);
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/admin/?action=reset-password`,
    });
    if (error) throw error;
    document.getElementById('forgotMsg').hidden = false;
  } catch (e) {
    setErr('forgotError', spanishError(e));
  } finally {
    busy(btn, false, '<i class="fas fa-paper-plane"></i> Enviar enlace');
  }
}

// ─── Per-user page access ────────────────────────────────────────────────────
// Admins see everything. Treasurers keep the finance view. Every other account
// is a ministry_leader scoped to its ministry and sees only the tabs an admin
// granted (profile.allowed_tabs) — plus Inicio, always. The matching RLS in
// 20260626_page_permissions.sql is the real guard; this is the UX layer.
function applyTabAccess(profile) {
  const nav    = document.getElementById('admNav');
  const topMin = document.getElementById('topbarMinistry');
  document.body.classList.remove('is-admin', 'is-staff', 'is-finance', 'is-treasurer');

  // Reset any previous per-user inline overrides so role-based CSS can govern.
  const clearInline = () =>
    nav?.querySelectorAll('.tab-btn, .adm-nav__group').forEach(el => { el.style.display = ''; });

  if (profile.role === 'admin') {
    document.body.classList.add('is-admin', 'is-staff', 'is-finance');
    if (topMin) topMin.textContent = '';
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = ''; });
    clearInline();
    return;
  }

  if (profile.role === 'treasurer') {
    document.body.classList.add('is-finance', 'is-staff', 'is-treasurer');
    if (topMin) topMin.textContent = '— Tesorería';
    clearInline();
    return;
  }

  // ── ministry_leader (and any other non-admin) — per-user grants ────────────
  if (topMin) topMin.textContent = `— ${profile.ministries?.name || 'Ministerio'}`;
  // Before the page-permissions migration runs, `allowed_tabs` is absent — fall
  // back to the legacy ministry-leader tab set so nobody is locked out mid-deploy.
  const LEGACY_LEADER_TABS = ['upcoming', 'past', 'calendario'];
  const granted = Array.isArray(profile.allowed_tabs)
    ? profile.allowed_tabs
    : LEGACY_LEADER_TABS;
  const allowed = new Set(['inicio', ...granted]);

  // Explicit inline display beats the data-admin-only / data-finance-only CSS.
  nav?.querySelectorAll('.tab-btn').forEach(btn => {
    btn.style.display = allowed.has(btn.dataset.tab) ? 'flex' : 'none';
  });

  // Show a group heading only when at least one tab under it is visible.
  let group = null, groupHasVisible = false;
  const finalize = () => { if (group) group.style.display = groupHasVisible ? 'block' : 'none'; };
  nav?.querySelectorAll('.adm-nav__group, .tab-btn').forEach(el => {
    if (el.classList.contains('adm-nav__group')) { finalize(); group = el; groupHasVisible = false; }
    else if (el.style.display !== 'none')        { groupHasVisible = true; }
  });
  finalize();

  // If the active tab ended up hidden, fall back to Inicio.
  const active = nav?.querySelector('.tab-btn.active');
  if (active && active.style.display === 'none') {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    nav.querySelector('.tab-btn[data-tab="inicio"]')?.classList.add('active');
    document.getElementById('tab-inicio')?.classList.add('active');
  }
}

// ─── Boot the panel ──────────────────────────────────────────────────────────
async function bootApp() {
  showCard('bootCard');

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return showCard('loginCard');

  const { data: profile, error } = await sb
    .from('profiles').select('*, ministries(name,color)').eq('id', user.id).single();

  // No profile = a misconfigured account. Never fake a role — fail safe.
  if (error || !profile) {
    await sb.auth.signOut();
    showCard('loginCard');
    setErr('authError',
      'Tu cuenta no tiene un perfil asignado. Contacta al administrador.');
    return;
  }

  setCurrentUser(user);
  setCurrentProfile(profile);

  document.getElementById('topbarUser').textContent = profile.display_name || user.email;
  applyTabAccess(profile);

  showApp();

  await loadMinistries();
  await loadUpcoming();
  loadDashboard();
  initForms();
  initNotifications();   // bell (no-op for non-admins)
}

// ─── Logout ──────────────────────────────────────────────────────────────────
export async function logout() {
  try { await sb.auth.signOut(); } catch { /* ignore */ }
  location.href = location.pathname;
}

// ─── Boot sequence ───────────────────────────────────────────────────────────
async function boot() {
  showCard('bootCard');

  if (!sb) {
    showCard('loginCard');
    setErr('authError', 'No se pudo conectar con el servidor. Recarga la página.');
    return;
  }

  const query = new URLSearchParams(location.search);
  const hash  = new URLSearchParams(location.hash.replace(/^#/, ''));
  const action = query.get('action');

  // ── 0) Did the link itself fail? (expired / already used / scanner consumed
  //    the one-time token.) Supabase puts the error in the hash or the query.
  const errCode = hash.get('error_code') || query.get('error_code')
                || hash.get('error')      || query.get('error');
  if (errCode) {
    history.replaceState({}, '', location.pathname);
    showCard('loginCard');
    setErr('authError', expiredLinkMsg(action));
    return;
  }

  // ── 1) Preferred flow: token_hash + verifyOtp. A prefetching mail scanner
  //    cannot consume this — the OTP is only spent when THIS code runs. The
  //    email templates must point the link at
  //    /admin/?action=accept-invite&token_hash=...&type=invite (see README).
  const tokenHash = query.get('token_hash') || hash.get('token_hash');
  const otpType   = query.get('type')       || hash.get('type');
  if (tokenHash && otpType) {
    try {
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
      if (error) throw error;
    } catch {
      history.replaceState({}, '', location.pathname);
      showCard('loginCard');
      setErr('authError', expiredLinkMsg(action));
      return;
    }
  }

  // ── 2) Fallback (legacy implicit flow): supabase-js consumes tokens from the
  //    URL hash asynchronously on load — give it a moment when a token is present.
  let session = (await sb.auth.getSession()).data.session;
  if (!session && location.hash.includes('access_token')) {
    for (let i = 0; i < 6 && !session; i++) {
      await new Promise(r => setTimeout(r, 250));
      session = (await sb.auth.getSession()).data.session;
    }
  }

  if (session && action === 'accept-invite')  return showSetPassword('invite');
  if (session && action === 'reset-password') return showSetPassword('recovery');
  if (session) return routeAfterLogin();

  // Arrived via an invite/reset link but no session could be established — the
  // link was almost certainly expired or already used.
  if (action === 'accept-invite' || action === 'reset-password') {
    history.replaceState({}, '', location.pathname);
    showCard('loginCard');
    setErr('authError', expiredLinkMsg(action));
    return;
  }
  return showCard('loginCard');
}

// ─── Wire everything ─────────────────────────────────────────────────────────
export function initAuth() {
  // Login
  document.getElementById('loginBtn')?.addEventListener('click', doLogin);
  document.getElementById('loginEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginPassword')?.focus();
  });
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('forgotLink')?.addEventListener('click', e => {
    e.preventDefault(); showForgot();
  });

  // MFA
  document.getElementById('mfaVerifyBtn')?.addEventListener('click', verifyMfa);
  document.getElementById('mfaCode')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyMfa();
  });
  document.getElementById('mfaLogoutBtn')?.addEventListener('click', e => {
    e.preventDefault(); logout();
  });

  // Invitation / password reset
  document.getElementById('inviteBtn')?.addEventListener('click', submitSetPassword);
  document.getElementById('invitePassword2')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitSetPassword();
  });

  // Forgot password
  document.getElementById('forgotBtn')?.addEventListener('click', submitForgot);
  document.getElementById('forgotEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitForgot();
  });
  document.getElementById('forgotBackLink')?.addEventListener('click', e => {
    e.preventDefault(); showCard('loginCard');
  });

  // Topbar logout
  document.getElementById('logoutBtn')?.addEventListener('click', logout);

  boot();
}
