// js/pages/admin/account.js
// ─────────────────────────────────────────────────────────────────────────────
// "Perfil y Configuración" — the signed-in user's dedicated account area.
// Replaces the old "Mi cuenta" modal with a full page (SaaS-style: large profile
// header + a settings sidebar with modular sections). It reuses the existing tab
// routing: clicking the sidebar account footer (#navAccount) activates the
// #tab-account panel instead of opening a popup.
//
// Each section is a small, self-contained descriptor { render, wire } so new
// sections can be added without touching the others. Only sections backed by
// real data/features are shown — Notifications/Sessions/API keys are omitted
// until the backend supports per-user data for them.
// ─────────────────────────────────────────────────────────────────────────────

import { sb, currentUser, currentProfile, ministries } from './state.js';
import { toast, confirm } from './ui.js';
import { esc } from '/js/utils/escape.js';
import { reEnrollMfa } from './auth.js';
import { mfaStatus } from './mfa.js';

const ROLE_LABEL = {
  admin:           'Administrador',
  treasurer:       'Tesorería',
  ministry_leader: 'Líder de ministerio',
  pastor:          'Pastor',
};

const el = (id) => document.getElementById(id);

// ── Small formatting helpers ──────────────────────────────────────────────────
function initials(name) {
  return (name || '?').split(' ').filter(Boolean)
    .map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
const fmtDate = (v) => {
  if (!v) return '—';
  try { return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(v)); }
  catch { return '—'; }
};
const fmtDateTime = (v) => {
  if (!v) return '—';
  try { return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(v)); }
  catch { return '—'; }
};
function rpcMissing(err) {
  const m = (err?.message || '').toLowerCase();
  return err?.code === 'PGRST202' || m.includes('does not exist') || m.includes('could not find');
}

// Paint an avatar element: cover photo when a URL exists, else initials.
function paintAvatar(node, name, url) {
  if (!node) return;
  if (url) {
    node.style.backgroundImage = `url("${url}")`;
    node.classList.add('has-img');
    node.textContent = '';
  } else {
    node.style.backgroundImage = '';
    node.classList.remove('has-img');
    node.textContent = initials(name);
  }
}

function accountName() {
  const p = currentProfile || {};
  return p.display_name || currentUser?.email || '—';
}
function usernameHandle() {
  const local = (currentUser?.email || '').split('@')[0];
  return local ? `@${local}` : '—';
}
function roleLabel() {
  return ROLE_LABEL[currentProfile?.role] || 'Cuenta';
}
function ministryNames() {
  const p = currentProfile || {};
  const ids = Array.isArray(p.ministry_ids) ? p.ministry_ids : [];
  const names = ids
    .map(id => ministries.find(m => m.id === id)?.name)
    .filter(Boolean);
  if (names.length) return names;
  if (p.ministries?.name) return [p.ministries.name];
  return [];
}

// ── Sidebar account footer (avatar + name + role). Called on boot + after edits.
export function renderNavAccount() {
  const name = accountName();
  paintAvatar(el('navAvatar'), name, currentProfile?.avatar_url);
  const nameEl = el('navAccountName');
  if (nameEl) nameEl.textContent = name;
  const roleEl = el('navAccountRole');
  if (roleEl) roleEl.textContent = roleLabel();
}

// Repaint every avatar surface (page + hero + sidebar) after an avatar change.
function repaintAllAvatars(url) {
  const name = accountName();
  paintAvatar(el('acctAvatar'), name, url);
  paintAvatar(el('acctHeroAvatar'), name, url);
  renderNavAccount();
}

// ═══════════════════════════════════════════════════════════════════════════
//  Page state
// ═══════════════════════════════════════════════════════════════════════════
let shellBuilt    = false;
let activeSection = 'perfil';
let profileDirty  = false;

// ── Profile header (hero) ─────────────────────────────────────────────────────
function renderHero() {
  const p = currentProfile || {};
  paintAvatar(el('acctHeroAvatar'), accountName(), p.avatar_url);
  el('acctHeroName').textContent = accountName();
  el('acctHeroSub').textContent  = currentUser?.email || usernameHandle();

  const badges = el('acctHeroBadges');
  const mins   = ministryNames();
  badges.innerHTML = `
    <span class="role-badge role--${esc(p.role || 'none')}">${esc(roleLabel())}</span>
    <span class="acc-badge acc-badge--ok"><i class="fas fa-circle-check"></i> Activa</span>
    ${mins.length ? `<span class="acct-hero__dept"><i class="fas fa-people-group"></i> ${esc(mins.join(' · '))}</span>` : ''}
  `;
}

// ── Section framework ─────────────────────────────────────────────────────────
const SECTIONS = [
  { key: 'perfil',    label: 'Perfil',    icon: 'fa-id-card',           render: renderProfileSection,  wire: wireProfileSection },
  { key: 'cuenta',    label: 'Cuenta',    icon: 'fa-user-gear',         render: renderAccountSection },
  { key: 'seguridad', label: 'Seguridad', icon: 'fa-shield-halved',     render: renderSecuritySection, wire: wireSecuritySection },
  { key: 'actividad', label: 'Actividad', icon: 'fa-clock-rotate-left', render: renderActivitySection, wire: wireActivitySection },
];

function buildShell() {
  const root = el('acctRoot');
  if (!root) return;
  root.innerHTML = `
    <div class="acct">
      <header class="acct-hero">
        <div class="acct-hero__bar">
          <span class="acct-hero__avatar adm-avatar" id="acctHeroAvatar" aria-hidden="true"></span>
          <div class="acct-hero__meta">
            <h2 class="acct-hero__name" id="acctHeroName"></h2>
            <div class="acct-hero__sub" id="acctHeroSub"></div>
            <div class="acct-hero__badges" id="acctHeroBadges"></div>
          </div>
        </div>
      </header>
      <div class="acct-body">
        <nav class="acct-nav" id="acctNav" aria-label="Secciones de configuración"></nav>
        <div class="acct-content" id="acctContent"></div>
      </div>
    </div>`;

  const nav = el('acctNav');
  nav.innerHTML = SECTIONS.map(s => `
    <button class="acct-nav__item" data-acct-section="${s.key}" type="button">
      <i class="fas ${s.icon}" aria-hidden="true"></i> <span>${esc(s.label)}</span>
    </button>`).join('');
  nav.querySelectorAll('[data-acct-section]').forEach(btn =>
    btn.addEventListener('click', () => selectSection(btn.dataset.acctSection)));

  shellBuilt = true;
}

async function selectSection(key) {
  const target = SECTIONS.find(s => s.key === key) ? key : 'perfil';
  // Guard against losing unsaved profile edits when navigating away.
  if (activeSection === 'perfil' && target !== 'perfil' && profileDirty) {
    const ok = await confirm('Cambios sin guardar', 'Tienes cambios en tu perfil sin guardar. ¿Descartarlos?');
    if (!ok) return;
    profileDirty = false;
    updateDirtyGuard();
  }
  activeSection = target;
  el('acctNav')?.querySelectorAll('[data-acct-section]').forEach(b =>
    b.classList.toggle('active', b.dataset.acctSection === target));
  const section = SECTIONS.find(s => s.key === target);
  const content = el('acctContent');
  if (content && section) {
    content.innerHTML = section.render();
    section.wire?.();
  }
  content?.scrollIntoView({ block: 'nearest' });
}

// ── Entry: open the page ──────────────────────────────────────────────────────
function openAccountPage() {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  el('tab-account')?.classList.add('active');
  el('navAccount')?.classList.add('is-active');
  if (!shellBuilt) buildShell();
  renderHero();
  selectSection(activeSection);
  window.scrollTo(0, 0);
  // Close the mobile drawer if it was open.
  document.body.classList.remove('adm-nav-open');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section: Perfil
// ═══════════════════════════════════════════════════════════════════════════
function setProfileErr(msg) {
  const box = el('acctProfileError');
  if (!box) return;
  box.textContent = msg || '';
  box.style.display = msg ? 'block' : 'none';
}

function updateDirtyGuard() {
  const save = el('acctProfileSave');
  if (save) save.disabled = !profileDirty;
  if (profileDirty) window.addEventListener('beforeunload', beforeUnload);
  else              window.removeEventListener('beforeunload', beforeUnload);
}
function beforeUnload(e) { e.preventDefault(); e.returnValue = ''; }

function renderProfileSection() {
  const p  = currentProfile || {};
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '—'; } catch { return '—'; } })();
  const mins = ministryNames();
  return `
    <div class="acct-card">
      <div class="acct-card__head">
        <h3><i class="fas fa-id-card"></i> Perfil</h3>
        <p>Tu información personal y cómo apareces en el panel.</p>
      </div>

      <div class="acct-photo-row">
        <span class="acct-photo adm-avatar" id="acctAvatar" aria-hidden="true"></span>
        <div class="acct-photo__side">
          <div class="acct-photo__actions">
            <button type="button" class="btn btn--ghost btn--sm" id="acctAvatarBtn"><i class="fas fa-camera"></i> Cambiar foto</button>
            <button type="button" class="btn btn--ghost btn--sm acct-danger" id="acctAvatarRemove" ${p.avatar_url ? '' : 'hidden'}><i class="fas fa-trash"></i> Quitar</button>
          </div>
          <p class="acct-hint">JPG o PNG cuadrada, máximo 5 MB.</p>
          <input type="file" id="acctAvatarFile" accept="image/*" hidden>
        </div>
      </div>

      <div class="acct-grid">
        <div class="form-group">
          <label for="acctName">Nombre para mostrar</label>
          <input type="text" id="acctName" maxlength="80" value="${esc(p.display_name || '')}" placeholder="Tu nombre">
        </div>
        <div class="form-group">
          <label for="acctUser">Usuario</label>
          <input type="text" id="acctUser" value="${esc(usernameHandle())}" disabled>
        </div>
        <div class="form-group">
          <label for="acctEmail">Correo electrónico</label>
          <input type="email" id="acctEmail" value="${esc(currentUser?.email || '')}" disabled>
          <p class="acct-hint">El correo lo gestiona un administrador.</p>
        </div>
        <div class="form-group">
          <label for="acctDept">Departamento / ministerio</label>
          <input type="text" id="acctDept" value="${esc(mins.length ? mins.join(', ') : (p.role === 'admin' ? 'Acceso total' : '—'))}" disabled>
        </div>
        <div class="form-group">
          <label for="acctTz">Zona horaria</label>
          <input type="text" id="acctTz" value="${esc(tz)}" disabled>
        </div>
        <div class="form-group">
          <label for="acctLang">Idioma</label>
          <input type="text" id="acctLang" value="Español" disabled>
        </div>
      </div>

      <div class="acct-error" id="acctProfileError" style="display:none"></div>
      <div class="acct-actions">
        <button class="btn btn--primary" id="acctProfileSave" disabled><i class="fas fa-save"></i> Guardar cambios</button>
        <button class="btn btn--ghost" id="acctProfileCancel">Cancelar</button>
      </div>
    </div>`;
}

function wireProfileSection() {
  profileDirty = false;
  paintAvatar(el('acctAvatar'), accountName(), currentProfile?.avatar_url);
  updateDirtyGuard();

  const name = el('acctName');
  name?.addEventListener('input', () => {
    profileDirty = (name.value.trim() !== (currentProfile?.display_name || '').trim());
    updateDirtyGuard();
  });

  el('acctProfileSave')?.addEventListener('click', saveProfile);
  el('acctProfileCancel')?.addEventListener('click', () => {
    profileDirty = false;
    if (name) name.value = currentProfile?.display_name || '';
    setProfileErr('');
    updateDirtyGuard();
  });

  el('acctAvatarBtn')?.addEventListener('click', () => el('acctAvatarFile')?.click());
  el('acctAvatarFile')?.addEventListener('change', onAvatarPick);
  el('acctAvatarRemove')?.addEventListener('click', removeAvatar);
}

async function saveProfile() {
  const name = el('acctName')?.value.trim() || '';
  setProfileErr('');
  if (name.length < 2) { setProfileErr('El nombre debe tener al menos 2 caracteres.'); return; }

  const btn = el('acctProfileSave');
  if (btn) btn.disabled = true;
  try {
    const { data, error } = await sb.rpc('set_my_display_name', { p_name: name });
    if (error) throw error;
    if (currentProfile) currentProfile.display_name = (typeof data === 'string' && data) ? data : name;
    profileDirty = false;
    updateDirtyGuard();
    renderHero();
    renderNavAccount();
    toast('Perfil actualizado', 'success');
  } catch (e) {
    setProfileErr(rpcMissing(e)
      ? 'Aún no se ha aplicado la actualización de la base de datos (set_my_display_name). Pide al administrador que ejecute la migración.'
      : (e.message || 'No se pudo guardar el perfil.'));
    if (btn) btn.disabled = false;
  }
}

// ── Avatar upload / removal (self-service via set_my_avatar) ───────────────────
async function onAvatarPick(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { setProfileErr('Elige un archivo de imagen.'); return; }
  if (file.size > 5 * 1024 * 1024) { setProfileErr('La imagen es muy grande (máx 5 MB).'); return; }
  if (!currentUser?.id) return;

  const btn = el('acctAvatarBtn');
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...'; }
  setProfileErr('');
  try {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
    if (upErr) throw upErr;
    const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
    const url = pub.publicUrl;
    const { error } = await sb.rpc('set_my_avatar', { p_url: url });
    if (error) throw error;
    if (currentProfile) currentProfile.avatar_url = url;
    repaintAllAvatars(url);
    el('acctAvatarRemove')?.removeAttribute('hidden');
    toast('Foto actualizada', 'success');
  } catch (err) {
    setProfileErr(err?.message || 'No se pudo subir la foto.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function removeAvatar() {
  setProfileErr('');
  try {
    const { error } = await sb.rpc('set_my_avatar', { p_url: null });
    if (error) throw error;
    if (currentProfile) currentProfile.avatar_url = null;
    repaintAllAvatars(null);
    el('acctAvatarRemove')?.setAttribute('hidden', '');
    toast('Foto eliminada', 'success');
  } catch (err) {
    setProfileErr(err?.message || 'No se pudo quitar la foto.');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section: Cuenta
// ═══════════════════════════════════════════════════════════════════════════
function kvRow(icon, label, value, extra = '') {
  return `
    <div class="acct-kv">
      <span class="acct-kv__label"><i class="fas ${icon}"></i> ${esc(label)}</span>
      <span class="acct-kv__value">${value}${extra}</span>
    </div>`;
}

function renderAccountSection() {
  const u = currentUser || {};
  return `
    <div class="acct-card">
      <div class="acct-card__head">
        <h3><i class="fas fa-user-gear"></i> Cuenta</h3>
        <p>Detalles de tu cuenta. Algunos datos solo puede cambiarlos un administrador.</p>
      </div>
      <div class="acct-kv-list">
        ${kvRow('fa-envelope', 'Correo', esc(u.email || '—'))}
        ${kvRow('fa-circle-check', 'Estado', '<span class="acc-badge acc-badge--ok"><i class="fas fa-circle-check"></i> Activa</span>')}
        ${kvRow('fa-user-shield', 'Rol', `<span class="role-badge role--${esc(currentProfile?.role || 'none')}">${esc(roleLabel())}</span>`)}
        ${kvRow('fa-calendar-plus', 'Miembro desde', esc(fmtDate(u.created_at)))}
        ${kvRow('fa-right-to-bracket', 'Último inicio de sesión', esc(fmtDateTime(u.last_sign_in_at)))}
        ${kvRow('fa-fingerprint', 'ID de cuenta', `<code class="acct-code">${esc(u.id || '—')}</code>`)}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section: Seguridad
// ═══════════════════════════════════════════════════════════════════════════
function renderSecuritySection() {
  return `
    <div class="acct-card">
      <div class="acct-card__head">
        <h3><i class="fas fa-shield-halved"></i> Seguridad</h3>
        <p>Protege el acceso a tu cuenta.</p>
      </div>

      <div class="section-divider"><i class="fas fa-key"></i> Cambiar contraseña</div>
      <div class="acct-grid">
        <div class="form-group">
          <label for="acctPw1">Contraseña nueva</label>
          <input type="password" id="acctPw1" placeholder="Mínimo 8 caracteres" autocomplete="new-password">
        </div>
        <div class="form-group">
          <label for="acctPw2">Confirmar contraseña</label>
          <input type="password" id="acctPw2" placeholder="Repite la contraseña" autocomplete="new-password">
        </div>
      </div>
      <div class="acct-error" id="acctPwError" style="display:none"></div>
      <div class="acct-actions">
        <button class="btn btn--primary" id="acctPwBtn"><i class="fas fa-save"></i> Guardar contraseña</button>
      </div>

      <div class="section-divider"><i class="fas fa-mobile-screen"></i> Verificación en dos pasos</div>
      <div class="acct-2fa" id="acct2faRow">
        <div class="acct-2fa__status"><i class="fas fa-spinner fa-spin"></i> Comprobando…</div>
      </div>
      <p class="acct-hint">Usa una app de autenticación (Google Authenticator, Authy, Microsoft Authenticator).
        Los códigos de recuperación aún no están disponibles en esta versión.</p>
    </div>`;
}

function wireSecuritySection() {
  el('acctPwBtn')?.addEventListener('click', changePassword);
  refresh2faRow();
}

async function changePassword() {
  const p1  = el('acctPw1')?.value || '';
  const p2  = el('acctPw2')?.value || '';
  const box = el('acctPwError');
  const btn = el('acctPwBtn');
  const setPwErr = (m) => { if (box) { box.textContent = m || ''; box.style.display = m ? 'block' : 'none'; } };

  setPwErr('');
  if (p1.length < 8) { setPwErr('La contraseña debe tener al menos 8 caracteres.'); return; }
  if (p1 !== p2)     { setPwErr('Las contraseñas no coinciden.'); return; }

  if (btn) btn.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) throw error;
    if (el('acctPw1')) el('acctPw1').value = '';
    if (el('acctPw2')) el('acctPw2').value = '';
    toast('Contraseña actualizada', 'success');
  } catch (e) {
    setPwErr(e.message || 'No se pudo cambiar la contraseña.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function refresh2faRow() {
  const row = el('acct2faRow');
  if (!row) return;
  let status = 'enroll';
  try { status = await mfaStatus(); } catch { /* default to enroll */ }
  const enrolled = status !== 'enroll';
  row.innerHTML = `
    <div class="acct-2fa__status">
      ${enrolled
        ? '<span class="acc-badge acc-badge--ok"><i class="fas fa-circle-check"></i> Activada</span>'
        : '<span class="acc-badge acc-badge--warn"><i class="fas fa-triangle-exclamation"></i> No configurada</span>'}
    </div>
    <button class="btn btn--ghost" id="acct2faBtn">
      <i class="fas fa-shield-alt"></i> ${enrolled ? 'Reconfigurar' : 'Configurar'}
    </button>`;
  el('acct2faBtn')?.addEventListener('click', async () => {
    const ok = await confirm(
      enrolled ? 'Reconfigurar verificación' : 'Configurar verificación',
      'Se te mostrará un código QR para escanear con tu app de autenticación. ' +
      (enrolled ? 'Tu configuración anterior se reemplazará.' : ''));
    if (!ok) return;
    reEnrollMfa();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Section: Actividad (account timeline from real auth data)
// ═══════════════════════════════════════════════════════════════════════════
function renderActivitySection() {
  return `
    <div class="acct-card">
      <div class="acct-card__head">
        <h3><i class="fas fa-clock-rotate-left"></i> Actividad de la cuenta</h3>
        <p>Eventos recientes de tu cuenta.</p>
      </div>
      <ol class="acct-timeline" id="acctTimeline">
        <li class="acct-timeline__item"><i class="fas fa-spinner fa-spin"></i> Cargando…</li>
      </ol>
    </div>`;
}

function timelineItem(icon, title, when) {
  return `
    <li class="acct-timeline__item">
      <span class="acct-timeline__dot"><i class="fas ${icon}"></i></span>
      <span class="acct-timeline__body">
        <span class="acct-timeline__title">${esc(title)}</span>
        <span class="acct-timeline__when">${esc(when)}</span>
      </span>
    </li>`;
}

async function wireActivitySection() {
  const list = el('acctTimeline');
  if (!list) return;
  const u = currentUser || {};
  let twofa = 'enroll';
  try { twofa = await mfaStatus(); } catch { /* ignore */ }

  const items = [
    timelineItem('fa-right-to-bracket', 'Último inicio de sesión', fmtDateTime(u.last_sign_in_at)),
    timelineItem(
      twofa === 'enroll' ? 'fa-shield-halved' : 'fa-shield-check',
      twofa === 'enroll' ? 'Verificación en dos pasos sin configurar' : 'Verificación en dos pasos activada',
      twofa === 'enroll' ? 'Recomendado activarla' : 'Protegida'),
    timelineItem('fa-user-pen', 'Perfil actualizado', currentProfile?.updated_at ? fmtDateTime(currentProfile.updated_at) : '—'),
    timelineItem('fa-calendar-plus', 'Cuenta creada', fmtDate(u.created_at)),
  ];
  list.innerHTML = items.join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Init — wire the sidebar footer entry point + tab-switch cleanup
// ═══════════════════════════════════════════════════════════════════════════
export function initAccountPage() {
  el('navAccount')?.addEventListener('click', openAccountPage);

  // When the user picks any real nav tab, drop the account footer highlight
  // (initTabs already hides #tab-account by toggling .tab-panel.active).
  document.getElementById('admNav')?.addEventListener('click', (e) => {
    if (e.target.closest('.tab-btn')) el('navAccount')?.classList.remove('is-active');
  });
}
