/* ============================================================================
 * web/src/lib/theme-boot.ts — the no-FOUC theme boot script and its keys (S11, D-038)
 * ----------------------------------------------------------------------------
 * The plain-TypeScript half of #lib/theme.svelte.ts, which re-exports all of
 * it: the storage keys, the attribute and the pre-paint snippet inlined in
 * src/app.html. Plain so the build can read it too: the CSP (web/csp.ts,
 * D-037) allows that inline script by its hash, computed from
 * THEME_BOOT_SCRIPT at config time, and theme.svelte.ts holds runes state the
 * config cannot load. tests/unit/theme.test.ts keeps app.html's copy
 * byte-identical.
 *
 * Usage:
 *   import { THEME_BOOT_SCRIPT } from '#lib/theme-boot.js';   // or via theme.svelte.ts
 * ========================================================================== */

/** The public pages' preference (D-022). */
export const THEME_STORAGE_KEY = 'ird.theme';
/** The admin's preference (D-038) — never shared with the legacy panel. */
export const ADMIN_THEME_STORAGE_KEY = 'ird.app.admin.theme';
export const THEME_ATTR = 'data-theme';
/** A pathname containing this, under any base path (`/app` or none), is the admin's. */
export const ADMIN_PATH_SEGMENT = '/admin/';

/**
 * Pre-paint boot snippet for src/app.html (inside a <script> in <head>).
 * Minified by hand and ES5 on purpose: it runs before any bundle, in every
 * browser, and must never throw. It reads the key of the surface the URL
 * belongs to — themeScopeFor(), inlined. Only 'light'/'dark' are honoured;
 * anything else means 'system', which is "no attribute".
 */
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem((location.pathname+'/').indexOf('${ADMIN_PATH_SEGMENT}')>-1` +
  `?'${ADMIN_THEME_STORAGE_KEY}':'${THEME_STORAGE_KEY}');` +
  `if(t==='light'||t==='dark')document.documentElement.setAttribute('${THEME_ATTR}',t)}catch(e){}`;
