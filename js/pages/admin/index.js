import { initAuthScene } from './auth-scene.js';
// js/pages/admin/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Admin panel entry point. Replaces the old monolithic admin.js.
// Each concern lives in its own module; this file only wires them together.
// ─────────────────────────────────────────────────────────────────────────────

import { initAuth } from './auth.js';
import { initTabs, initConfirm, confirm, closeModal } from './ui.js';
import { initFilterToggles } from './filters.js';
import { renderMinistriesTab, initMinistryModal } from './ministries.js';
import { loadDashboard } from './dashboard.js';
import { initAccountPage } from './account.js';
import { initCalendarNav } from './calendar-tab.js';
import { initEventViews, openEventsTab } from './event-views.js';
import { initForms } from './event-form.js';
import { loadPresets, buildPresetGrid, initSmartPresets } from './presets.js';
import { loadUsers, initUserModal } from './users.js';
import { loadRolePresets, initRolePresets } from './role-presets.js';
import { initWizard } from './wizard.js';
import { initDscpWizard } from './discipleship-wizard.js';
import { initGalleryWizard } from './gallery-wizard.js';
import { loadDiscipulado } from './discipleship-tab.js';
import { loadGallery } from './gallery-tab.js';
import { loadActivity } from './activity-tab.js';
import { loadSettings } from './settings-tab.js';
import { loadTreasury } from './treasury-tab.js';
import { enhanceTextarea } from '/js/lib/rich-text.js';
import { confirmResolve } from './state.js';
import { applyPrefs } from './prefs.js';

document.addEventListener('DOMContentLoaded', () => {

  // ── Personal UI preferences (theme / density / motion) — apply ASAP so the
  //    panel paints with the user's chosen density + motion from the first frame.
  //    (Theme is already applied pre-paint by the inline script in index.html.)
  applyPrefs();

  // Underwater auth scene
  initAuthScene();

  // ── Auth (login, MFA, invite acceptance, password reset, session boot) ─────
  initAuth();

  // ── Confirm modal ──────────────────────────────────────────────────────────
  initConfirm(() => confirmResolve);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  initTabs({
    onInicio:       loadDashboard,
    onEventos:      openEventsTab,
    onMinistries:   renderMinistriesTab,
    onUsers:        () => { loadUsers(); loadRolePresets(); },
    onDiscipulado:  loadDiscipulado,
    onGaleria:      loadGallery,
    onActivity:     loadActivity,
    onSettings:     loadSettings,
    onTreasury:     loadTreasury,
  });

  // ── Eventos pill views (Calendario · Próximos · Registraciones) ────────────
  initEventViews();

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

  // ── User / preset / ministry / account modals ──────────────────────────────
  initUserModal();
  initRolePresets();
  initMinistryModal();
  initAccountPage();

  // ── Cuentas ↔ Roles y accesos sub-tabs (inside the Usuarios tab) ────────────
  document.querySelectorAll('[data-users-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.usersTab;
      document.querySelectorAll('[data-users-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.users-admin__panel').forEach(p => {
        p.classList.toggle('active', p.id === `users-panel-${target}`);
      });
      if (target === 'presets') loadRolePresets();
    });
  });

  // ── Rich-text editors on every admin textbox whose content is shown on the
  //    public website (description / información fields). Progressive upgrade:
  //    existing save logic keeps reading these textareas' .value. ────────────
  ['fDesc', 'bDesc', 'evDescription', 'pmDescription', 'dscpGroupDesc', 'galAdmDesc']
    .forEach(id => { const el = document.getElementById(id); if (el) enhanceTextarea(el); });

  // ── Mobile burger drawer ───────────────────────────────────────────────────
  const burger   = document.getElementById('admBurger');
  const backdrop = document.getElementById('admNavBackdrop');
  const nav      = document.getElementById('admNav');
  const closeNav = () => {
    document.body.classList.remove('adm-nav-open');
    burger?.setAttribute('aria-expanded', 'false');
  };
  burger?.addEventListener('click', () => {
    const open = document.body.classList.toggle('adm-nav-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  backdrop?.addEventListener('click', closeNav);
  // Pick a tab → close the drawer
  nav?.addEventListener('click', (e) => { if (e.target.closest('.tab-btn')) closeNav(); });
});