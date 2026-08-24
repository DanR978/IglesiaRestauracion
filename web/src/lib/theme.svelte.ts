/* ============================================================================
 * web/src/lib/theme.svelte.ts — light / dark / system theme (S11, D-017)
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
 * No FOUC: THEME_BOOT_SCRIPT is inlined verbatim in src/app.html so a forced
 * theme is applied BEFORE first paint; tests/unit/theme.test.ts keeps the two
 * byte-identical. initTheme() (root +layout.svelte, onMount) then syncs the
 * runes state to what the boot script already painted.
 *
 * Usage:
 *   import { theme, initTheme } from '$lib/theme.svelte';
 *   theme.current    // 'light' | 'dark' | 'system'  (reactive)
 *   theme.resolved   // 'light' | 'dark' — what is actually painted (reactive)
 *   theme.set('dark');
 * ========================================================================== */
import { MediaQuery } from 'svelte/reactivity';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = Exclude<Theme, 'system'>;

export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];
export const THEME_STORAGE_KEY = 'ird.theme';
export const THEME_ATTR = 'data-theme';
export const DEFAULT_THEME: Theme = 'system';

/**
 * Pre-paint boot snippet for src/app.html (inside a <script> in <head>).
 * Minified by hand and ES5 on purpose: it runs before any bundle, in every
 * browser, and must never throw. Only 'light'/'dark' are honoured — anything
 * else means 'system', which is "no attribute".
 */
export const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');` +
  `if(t==='light'||t==='dark')document.documentElement.setAttribute('${THEME_ATTR}',t)}catch(e){}`;

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

let current = $state<Theme>(DEFAULT_THEME);
let osDark: MediaQuery | undefined;

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  osDark ??= new MediaQuery('(prefers-color-scheme: dark)');
  return osDark.current;
}

function readStored(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    // 'system' is represented by the ABSENCE of the key, so only the two
    // forced values are meaningful here; garbage falls back to the default.
    return raw === 'light' || raw === 'dark' ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function writeStored(next: Theme): void {
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
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

/**
 * Read the persisted preference and apply it. Call once in the browser
 * (root layout onMount). Idempotent; safe to call again after a storage event.
 */
export function initTheme(): Theme {
  const stored = readStored();
  current = stored;
  applyAttribute(stored);
  return stored;
}

export const theme = {
  get current(): Theme {
    return current;
  },
  /** What is actually painted right now ('system' resolved against the OS). */
  get resolved(): ResolvedTheme {
    if (current !== 'system') return current;
    return systemPrefersDark() ? 'dark' : 'light';
  },
  set(next: Theme): void {
    const safe = isTheme(next) ? next : DEFAULT_THEME;
    current = safe;
    writeStored(safe);
    applyAttribute(safe);
  },
};
