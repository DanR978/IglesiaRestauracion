/* ============================================================================
 * web/src/lib/theme.svelte.ts — light / dark / system theme (S11, D-017, D-038)
 * ----------------------------------------------------------------------------
 * The ONE dark-mode mechanism: a `data-theme` attribute on <html> that
 * tokens/colors.css keys its palette override on. 'system' REMOVES the
 * attribute so the prefers-color-scheme media query governs again. Nothing
 * else in web/ touches data-theme.
 *
 * Replaces the legacy admin prefs.js theme branch + the inline pre-paint
 * script in admin/index.html. The preference is per-device (localStorage,
 * never the DB), read/written inside try/catch so a blocked storage never
 * throws — the attribute is still applied for the current page.
 *
 * Two surfaces, two preferences (D-038). The public pages keep D-022's
 * `ird.theme`; the admin has its own `ird.app.admin.theme` — not the legacy
 * panel's key, whose dark palette is unreadable — so choosing dark in the
 * admin never darkens the public site. A page is the admin's when its pathname
 * contains "/admin/" under any base path (themeScopeFor), and only that
 * surface's preference is ever painted on it.
 *
 * No FOUC: THEME_BOOT_SCRIPT is inlined verbatim in src/app.html, so the URL's
 * own preference is applied BEFORE first paint; tests/unit/theme.test.ts keeps
 * the two byte-identical. The root +layout.svelte then calls applyThemeFor()
 * after every navigation (the first included): it syncs the runes state with
 * what is painted, and swaps the preference when a client-side navigation
 * crosses between the two surfaces.
 *
 * Usage:
 *   import { theme, adminTheme, applyThemeFor } from '#lib/theme.svelte.js';
 *   theme.current    // the viewed surface's 'light' | 'dark' | 'system' (reactive)
 *   theme.resolved   // 'light' | 'dark' — what is actually painted (reactive)
 *   theme.set('dark');                     // the viewed surface's preference
 *   adminTheme.current = 'dark';           // the admin's, from any page
 *   <SegmentedControl bind:value={adminTheme.current} … />  // S45 Preferencias
 *   applyThemeFor(to.url.pathname);        // after a navigation (root layout)
 * ========================================================================== */
import { MediaQuery } from 'svelte/reactivity';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;
/** Whose preference governs a page (D-038). */
export type ThemeScope = 'public' | 'admin';

export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];
export const THEME_SCOPES: readonly ThemeScope[] = ['public', 'admin'];
/** The public pages' preference (D-022). */
export const THEME_STORAGE_KEY = 'ird.theme';
/** The admin's preference (D-038) — never shared with the legacy panel. */
export const ADMIN_THEME_STORAGE_KEY = 'ird.app.admin.theme';
export const THEME_STORAGE_KEYS: Readonly<Record<ThemeScope, string>> = {
  public: THEME_STORAGE_KEY,
  admin: ADMIN_THEME_STORAGE_KEY,
};
export const THEME_ATTR = 'data-theme';
export const DEFAULT_THEME: Theme = 'system';
/** A pathname containing this, under any base path (`/app` or none), is the admin's. */
export const ADMIN_PATH_SEGMENT = '/admin/';

/**
 * The surface a pathname belongs to. `/app/admin` without its trailing slash
 * counts too, so a hand-typed URL cannot paint the public preference.
 */
export function themeScopeFor(pathname: string): ThemeScope {
  return `${pathname}/`.includes(ADMIN_PATH_SEGMENT) ? 'admin' : 'public';
}

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

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

let osDark: MediaQuery | undefined;

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  osDark ??= new MediaQuery('(prefers-color-scheme: dark)');
  return osDark.current;
}

function readStored(scope: ThemeScope): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEYS[scope]);
    // 'system' is represented by the ABSENCE of the key, so only the two
    // forced values are meaningful here; garbage falls back to the default.
    return raw === 'light' || raw === 'dark' ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeStored(scope: ThemeScope, next: Theme): void {
  try {
    const key = THEME_STORAGE_KEYS[scope];
    if (next === 'system') localStorage.removeItem(key);
    else localStorage.setItem(key, next);
  } catch {
    /* storage blocked — the attribute below still applies for this page */
  }
}

function applyAttribute(next: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (next === 'system') root.removeAttribute(THEME_ATTR);
  else root.setAttribute(THEME_ATTR, next);
}

function resolved(preference: Theme): ResolvedTheme {
  if (preference !== 'system') return preference;
  return systemPrefersDark() ? 'dark' : 'light';
}

// Seeded from storage at import, so the first client render already shows what
// the boot script painted instead of flipping from 'system' after mount.
const preferences = $state<Record<ThemeScope, Theme>>({
  public: readStored('public'),
  admin: readStored('admin'),
});
let viewed = $state<ThemeScope>(
  themeScopeFor(typeof location === 'undefined' ? '/' : location.pathname),
);

function setPreference(scope: ThemeScope, next: Theme): void {
  const safe = isTheme(next) ? next : DEFAULT_THEME;
  preferences[scope] = safe;
  writeStored(scope, safe);
  // The other surface's choice waits for its own pages.
  if (scope === viewed) applyAttribute(safe);
}

/**
 * Make `pathname`'s surface the viewed one: re-read both stored preferences
 * (another tab may have changed one) and paint that surface's. The root layout
 * calls it after every navigation; idempotent.
 */
export function applyThemeFor(pathname: string): void {
  viewed = themeScopeFor(pathname);
  for (const scope of THEME_SCOPES) preferences[scope] = readStored(scope);
  applyAttribute(preferences[viewed]);
}

/**
 * Read the persisted preference of the surface this page belongs to and apply
 * it — applyThemeFor(location.pathname) — and return it. Idempotent.
 */
export function initTheme(): Theme {
  applyThemeFor(typeof location === 'undefined' ? '/' : location.pathname);
  return preferences[viewed];
}

/** The surface being viewed: what the page paints. */
export const theme = {
  /** 'public' or 'admin', from the last applyThemeFor() (reactive). */
  get scope(): ThemeScope {
    return viewed;
  },
  get current(): Theme {
    return preferences[viewed];
  },
  /** What is actually painted right now ('system' resolved against the OS). */
  get resolved(): ResolvedTheme {
    return resolved(preferences[viewed]);
  },
  set(next: Theme): void {
    setPreference(viewed, next);
  },
};

/** One surface's preference, readable and writable from any page. */
export interface ScopedTheme {
  readonly scope: ThemeScope;
  /** The stored preference (reactive). Assigning persists it, and paints it
   *  when this surface is the one on screen. */
  current: Theme;
  /** What this surface paints ('system' resolved against the OS). */
  readonly resolved: ResolvedTheme;
}

/** The admin's preference (D-038) — S45's Claro / Oscuro / Sistema control binds to `current`. */
export const adminTheme: ScopedTheme = {
  scope: 'admin',
  get current(): Theme {
    return preferences.admin;
  },
  set current(next: Theme) {
    setPreference('admin', next);
  },
  get resolved(): ResolvedTheme {
    return resolved(preferences.admin);
  },
};
