// js/pages/admin/prefs.js
// ─────────────────────────────────────────────────────────────────────────────
// Per-device UI preferences for the admin panel (Apariencia section of the
// "Perfil y Configuración" page). These are personal display choices — theme,
// density, motion, default landing tab — so they live in localStorage rather
// than the database (no cross-device sync, no server round-trip, no RLS).
//
//   • theme        'system' | 'light' | 'dark'  → <html data-theme> (see colors.css)
//   • density      'comfortable' | 'compact'      → body.adm-density-compact
//   • reduceMotion boolean                        → body.adm-reduce-motion
//   • landing      tab key (e.g. 'inicio')        → tab opened on boot
//
// `applyPrefs()` is called once at boot (index.js). `applyLandingPref()` runs
// after the panel is shown (auth.js) so it can click a real, permitted tab.
// A tiny inline script in admin/index.html sets data-theme BEFORE first paint
// so switching to a forced theme never flashes the wrong palette.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ird.admin.prefs';

export const DEFAULT_PREFS = Object.freeze({
  theme:        'system',
  density:      'comfortable',
  reduceMotion: false,
  landing:      'inicio',
});

const VALID = {
  theme:   ['system', 'light', 'dark'],
  density: ['comfortable', 'compact'],
};

/** Read the saved prefs, merged over defaults. Never throws. */
export function getPrefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* ignore */ }
  const prefs = { ...DEFAULT_PREFS, ...saved };
  // Sanitise enums so a stale/garbage value can never break rendering.
  if (!VALID.theme.includes(prefs.theme))     prefs.theme   = DEFAULT_PREFS.theme;
  if (!VALID.density.includes(prefs.density)) prefs.density = DEFAULT_PREFS.density;
  prefs.reduceMotion = !!prefs.reduceMotion;
  if (typeof prefs.landing !== 'string' || !prefs.landing) prefs.landing = DEFAULT_PREFS.landing;
  return prefs;
}

/** Persist one preference and re-apply the visual effect immediately. */
export function setPref(key, value) {
  const prefs = getPrefs();
  prefs[key] = value;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  applyPrefs();
  return prefs;
}

/** Apply theme + density + motion to the document. Safe to call repeatedly. */
export function applyPrefs() {
  const { theme, density, reduceMotion } = getPrefs();
  const root = document.documentElement;
  // 'system' means "follow the OS" → remove the attribute so the
  // prefers-color-scheme media query in colors.css governs again.
  if (theme === 'system') root.removeAttribute('data-theme');
  else                    root.setAttribute('data-theme', theme);
  document.body?.classList.toggle('adm-density-compact', density === 'compact');
  document.body?.classList.toggle('adm-reduce-motion',   reduceMotion);
}

/**
 * Open the user's preferred landing tab, if it exists and is currently
 * visible (per-user access may hide it). Falls back to leaving Inicio active.
 * Called once after the panel is shown.
 */
export function applyLandingPref() {
  const { landing } = getPrefs();
  if (!landing || landing === 'inicio') return;
  const btn = document.querySelector(`.tab-btn[data-tab="${CSS.escape(landing)}"]`);
  if (btn && btn.style.display !== 'none' && !btn.hidden) btn.click();
}

/** Tabs a user can pick as their landing page (label + key). Access-aware. */
export function landingOptions() {
  const opts = [{ key: 'inicio', label: 'Inicio' }];
  document.querySelectorAll('.adm-nav .tab-btn').forEach(btn => {
    const key = btn.dataset.tab;
    if (!key || key === 'inicio') return;
    if (btn.style.display === 'none' || btn.hidden) return;   // not permitted → not offered
    const label = btn.querySelector('span')?.textContent?.trim() || key;
    opts.push({ key, label });
  });
  return opts;
}
