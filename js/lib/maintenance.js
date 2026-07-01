// js/lib/maintenance.js — public-site "Modo mantenimiento" overlay.
// Reads the publicly-readable `features.maintenance` flag from app_settings
// (see supabase/migrations/20260630_public_feature_flags.sql) and, when on,
// covers the page with a maintenance notice for ordinary visitors. Logged-in
// staff can still browse so they can verify the site during maintenance.
//
// Loaded lazily from js/include.js so every public page gets it. Admin pages
// (/admin*) are skipped.

import { sb } from '/js/lib/supabase.js';

(async () => {
  if (!sb || location.pathname.startsWith('/admin')) return;

  let on = false;
  try {
    const { data } = await sb
      .from('app_settings').select('value').eq('key', 'features').maybeSingle();
    on = !!(data?.value?.maintenance);
  } catch { return; }            // flag unreadable → fail open (site stays up)
  if (!on) return;

  // Staff (any account with a profile) bypass the notice to preview the site.
  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { data: prof } = await sb
        .from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (prof) return;
    }
  } catch { /* not signed in — show the notice */ }

  showOverlay();
})();

function showOverlay() {
  if (document.getElementById('ird-maintenance')) return;

  const style = document.createElement('style');
  style.id = 'ird-maintenance-style';
  style.textContent = `
    #ird-maintenance {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 1.1rem; padding: 2rem;
      text-align: center;
      background: #0f1417;
      color: #f0f5f7;
      font-family: var(--font-Signika, system-ui, -apple-system, sans-serif);
    }
    #ird-maintenance .ird-maint__icon {
      width: 78px; height: 78px; border-radius: 50%;
      display: grid; place-items: center;
      background: rgba(255,255,255,0.06);
      font-size: 2rem; color: #9fb4bd;
    }
    #ird-maintenance h1 { margin: 0; font-size: clamp(1.5rem, 4vw, 2.1rem); font-weight: 700; }
    #ird-maintenance p { margin: 0; max-width: 36ch; line-height: 1.6; color: #b8c4ca; font-size: 1rem; }
    #ird-maintenance .ird-maint__sub { font-size: 0.85rem; color: #7f8f97; margin-top: 0.4rem; }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'ird-maintenance';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', 'Sitio en mantenimiento');
  el.innerHTML = `
    <div class="ird-maint__icon"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i></div>
    <h1>Estamos en mantenimiento</h1>
    <p>Estamos haciendo mejoras en el sitio. Volveremos muy pronto. Gracias por tu paciencia.</p>
    <p class="ird-maint__sub">Iglesia Restauración</p>
  `;
  document.body.appendChild(el);
  document.documentElement.style.overflow = 'hidden';
}
