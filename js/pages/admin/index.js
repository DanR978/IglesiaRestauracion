import { initAuthScene } from './auth-scene.js';
// js/pages/admin/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel entry point. Replaces the old monolithic admin.js.
// Each concern lives in its own module; this file only wires them together.
// ─────────────────────────────────────────────────────────────────────────────

import { tryLogin, logout, restoreSession } from './auth.js';
import { initTabs, initConfirm, confirm, closeModal } from './ui.js';
import { initFilterToggles } from './filters.js';
import { renderMinistriesTab } from './ministries.js';
import { loadPast } from './events-tab.js';
import { loadCalendario, initCalendarNav } from './calendar-tab.js';
import { initForms } from './event-form.js';
import { loadPresets, buildPresetGrid, initSmartPresets } from './presets.js';
import { loadUsers, initUserModal } from './users.js';
import { initWizard } from './wizard.js';
import { initDscpWizard } from './discipleship-wizard.js';
import { initGalleryWizard } from './gallery-wizard.js';
import { loadDiscipulado } from './discipleship-tab.js';
import { loadGallery } from './gallery-tab.js';
import { confirmResolve } from './state.js';

document.addEventListener('DOMContentLoaded', () => {

  // Underwater auth scene
  initAuthScene();

  // ── Auth ───────────────────────────────────────────────────────────────────
  document.getElementById('loginBtn')?.addEventListener('click', tryLogin);
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') tryLogin();
  });
  document.getElementById('logoutBtn')?.addEventListener('click', logout);

  // ── Confirm modal ──────────────────────────────────────────────────────────
  initConfirm(() => confirmResolve);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  initTabs({
    onPast:         loadPast,
    onCalendario:   loadCalendario,
    onMinistries:   renderMinistriesTab,
    onUsers:        loadUsers,
    onDiscipulado:  loadDiscipulado,
    onGaleria:      loadGallery,
  });

  // ── Calendar nav + add button ──────────────────────────────────────────────
  initCalendarNav();

  // ── Ministry filter ────────────────────────────────────────────────────────
  initFilterToggles();

  // ── Smart presets ──────────────────────────────────────────────────────────
  buildPresetGrid();
  loadPresets();  // load DB presets on boot
  initSmartPresets();

  // ── Event creation wizard ────────────────────────────────────────────────
  initWizard();

  // ── Discipleship group creation wizard ───────────────────────────────────
  initDscpWizard();

  // ── Gallery album creation wizard ────────────────────────────────────────
  initGalleryWizard();

  // ── User modal ─────────────────────────────────────────────────────────────
  initUserModal();

  // ── Restore session (auto-login if token exists) ───────────────────────────
  restoreSession();
});