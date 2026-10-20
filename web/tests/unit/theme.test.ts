// S11 — theme.svelte.ts state transitions under jsdom (localStorage +
// <html data-theme>) and the no-FOUC boot script contract with app.html.
// PR-C2 (D-038) — two surfaces, two keys: the admin's preference applies only
// on a /admin/ path, the public one everywhere else; the jsdom URL is set with
// history.replaceState so the boot script and the module see a real pathname.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_PATH_SEGMENT,
  ADMIN_THEME_STORAGE_KEY,
  DEFAULT_THEME,
  THEME_ATTR,
  THEME_BOOT_SCRIPT,
  THEME_SCOPES,
  THEME_STORAGE_KEY,
  THEME_STORAGE_KEYS,
  THEMES,
  adminTheme,
  applyThemeFor,
  initTheme,
  isTheme,
  theme,
  themeScopeFor,
} from '#lib/theme.svelte.js';

const root = () => document.documentElement;
const painted = () => root().getAttribute(THEME_ATTR);
const stored = (key: string) => localStorage.getItem(key);
const runBootScript = () => new Function(THEME_BOOT_SCRIPT)();
/** Put jsdom on `path`, as a page load of that URL would. */
const visit = (path: string) => history.replaceState(null, '', path);

const ADMIN_PATHS = ['/admin/', '/app/admin/', '/app/admin/acceso/verificar/', '/app/admin'];
const PUBLIC_PATHS = ['/', '/app/', '/app/kit/tokens/', '/app/administracion/', '/eventos/'];

/**
 * ONE media-query list for the whole file: the module builds its MediaQuery on
 * first use and keeps it, so every test has to steer that same object.
 */
const osQuery = {
  matches: false,
  media: '(prefers-color-scheme: dark)',
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
};

function mockMatchMedia(dark: boolean) {
  osQuery.matches = dark;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(osQuery));
  return osQuery;
}

function blockStorageWrites() {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError');
  });
}

beforeEach(() => {
  visit('/');
  localStorage.clear();
  root().removeAttribute(THEME_ATTR);
  applyThemeFor('/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  visit('/');
});

describe('theme — constants', () => {
  it('exposes the three modes and the storage contract', () => {
    expect(THEMES).toEqual(['light', 'dark', 'system']);
    expect(DEFAULT_THEME).toBe('system');
    expect(THEME_STORAGE_KEY).toBe('ird.theme');
    expect(THEME_ATTR).toBe('data-theme');
  });

  it('gives the admin its own key, never the public or the legacy one (D-038)', () => {
    expect(THEME_SCOPES).toEqual(['public', 'admin']);
    expect(ADMIN_THEME_STORAGE_KEY).toBe('ird.app.admin.theme');
    expect(THEME_STORAGE_KEYS).toEqual({
      public: 'ird.theme',
      admin: 'ird.app.admin.theme',
    });
    // legacy /admin keeps its own prefs blob; its dark palette is unreadable
    expect(Object.values(THEME_STORAGE_KEYS)).not.toContain('ird.admin.prefs');
    expect(ADMIN_PATH_SEGMENT).toBe('/admin/');
  });

  it('isTheme narrows only the three literals', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(true);
    expect(isTheme('auto')).toBe(false);
    expect(isTheme('')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});

describe('themeScopeFor — which preference a URL gets (D-038)', () => {
  it.each(ADMIN_PATHS)('%s is the admin, under any base path', (path) => {
    expect(themeScopeFor(path)).toBe('admin');
  });

  it.each(PUBLIC_PATHS)('%s is public', (path) => {
    expect(themeScopeFor(path)).toBe('public');
  });
});

describe('theme.set — attribute + persistence', () => {
  it('starts as system with no attribute and nothing stored', () => {
    expect(theme.current).toBe('system');
    expect(theme.scope).toBe('public');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(stored(THEME_STORAGE_KEY)).toBeNull();
  });

  it('dark → sets data-theme="dark" and persists', () => {
    theme.set('dark');
    expect(theme.current).toBe('dark');
    expect(painted()).toBe('dark');
    expect(stored(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('light → sets data-theme="light" and persists', () => {
    theme.set('light');
    expect(theme.current).toBe('light');
    expect(painted()).toBe('light');
    expect(stored(THEME_STORAGE_KEY)).toBe('light');
  });

  it('dark → light → system walks the attribute through every state', () => {
    theme.set('dark');
    expect(painted()).toBe('dark');
    theme.set('light');
    expect(painted()).toBe('light');
    theme.set('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(stored(THEME_STORAGE_KEY)).toBeNull();
    expect(theme.current).toBe('system');
  });

  it('an invalid value at runtime falls back to system instead of throwing', () => {
    theme.set('dark');
    theme.set('neon' as never);
    expect(theme.current).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(stored(THEME_STORAGE_KEY)).toBeNull();
  });

  it('still applies the attribute when localStorage throws (private mode / blocked)', () => {
    blockStorageWrites();
    expect(() => theme.set('dark')).not.toThrow();
    expect(painted()).toBe('dark');
    expect(() => theme.set('system')).not.toThrow();
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it('on an admin page it sets the ADMIN preference and leaves the public one alone', () => {
    applyThemeFor('/app/admin/');
    theme.set('light');
    expect(theme.scope).toBe('admin');
    expect(stored(ADMIN_THEME_STORAGE_KEY)).toBe('light');
    expect(stored(THEME_STORAGE_KEY)).toBeNull();
    expect(painted()).toBe('light');
  });
});

describe('initTheme — reading the persisted preference', () => {
  it('applies a stored dark preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(initTheme()).toBe('dark');
    expect(theme.current).toBe('dark');
    expect(painted()).toBe('dark');
  });

  it('applies a stored light preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(initTheme()).toBe('light');
    expect(painted()).toBe('light');
  });

  it('treats an absent key as system and clears a stale attribute', () => {
    root().setAttribute(THEME_ATTR, 'dark');
    expect(initTheme()).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it('treats garbage in storage as system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '{"theme":"dark"}');
    expect(initTheme()).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it('never throws when localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(initTheme()).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it('reads the key of the page it runs on (D-038)', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'dark');

    visit('/app/admin/usuarios/');
    expect(initTheme()).toBe('dark');
    expect(theme.scope).toBe('admin');
    expect(painted()).toBe('dark');

    visit('/app/');
    expect(initTheme()).toBe('light');
    expect(theme.scope).toBe('public');
    expect(painted()).toBe('light');
  });
});

describe('applyThemeFor — the preference follows the surface (D-038)', () => {
  it('paints the admin preference on admin pages only, and swaps on the way out', () => {
    applyThemeFor('/app/admin/');
    adminTheme.current = 'dark';
    expect(stored(ADMIN_THEME_STORAGE_KEY)).toBe('dark');
    expect(stored(THEME_STORAGE_KEY)).toBeNull();
    expect(painted()).toBe('dark');
    expect(theme.current).toBe('dark');

    applyThemeFor('/app/kit/tokens/');
    expect(theme.scope).toBe('public');
    expect(theme.current).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(adminTheme.current).toBe('dark');

    applyThemeFor('/app/admin/inicio/');
    expect(painted()).toBe('dark');
  });

  it('re-reads storage, so a change made in another tab shows on the next navigation', () => {
    applyThemeFor('/app/admin/');
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'light');
    applyThemeFor('/app/admin/cuenta/');
    expect(adminTheme.current).toBe('light');
    expect(painted()).toBe('light');
  });

  it('a public preference never reaches an admin page, and the other way round', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    applyThemeFor('/app/admin/');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);

    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'light');
    applyThemeFor('/app/');
    expect(painted()).toBe('dark');
  });
});

describe('adminTheme — the getter/setter S45 Preferencias binds to', () => {
  it('reads the admin preference from any page', () => {
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'dark');
    applyThemeFor('/app/');
    expect(adminTheme.scope).toBe('admin');
    expect(adminTheme.current).toBe('dark');
  });

  it('from a public page it persists without repainting that page', () => {
    theme.set('dark');
    adminTheme.current = 'light';
    expect(stored(ADMIN_THEME_STORAGE_KEY)).toBe('light');
    expect(stored(THEME_STORAGE_KEY)).toBe('dark');
    expect(painted()).toBe('dark');
  });

  it('on an admin page it paints at once', () => {
    applyThemeFor('/app/admin/cuenta/');
    adminTheme.current = 'light';
    expect(painted()).toBe('light');
    adminTheme.current = 'system';
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it("'system' removes the key, and garbage falls back to system", () => {
    adminTheme.current = 'dark';
    adminTheme.current = 'system';
    expect(stored(ADMIN_THEME_STORAGE_KEY)).toBeNull();
    adminTheme.current = 'dark';
    adminTheme.current = 'neon' as never;
    expect(adminTheme.current).toBe('system');
    expect(stored(ADMIN_THEME_STORAGE_KEY)).toBeNull();
  });

  it('resolves system against the OS, and a forced choice to itself', () => {
    const mql = mockMatchMedia(true);
    adminTheme.current = 'system';
    expect(adminTheme.resolved).toBe('dark');
    mql.matches = false;
    expect(adminTheme.resolved).toBe('light');
    adminTheme.current = 'dark';
    expect(adminTheme.resolved).toBe('dark');
  });

  it('still paints when storage refuses the write', () => {
    applyThemeFor('/app/admin/');
    blockStorageWrites();
    expect(() => {
      adminTheme.current = 'dark';
    }).not.toThrow();
    expect(painted()).toBe('dark');
  });
});

describe('theme.resolved — what is painted', () => {
  it('a forced theme resolves to itself regardless of the OS', () => {
    mockMatchMedia(true);
    theme.set('light');
    expect(theme.resolved).toBe('light');
    theme.set('dark');
    expect(theme.resolved).toBe('dark');
  });

  it('system resolves against prefers-color-scheme', () => {
    const mql = mockMatchMedia(false);
    theme.set('system');
    expect(theme.resolved).toBe('light');
    mql.matches = true;
    expect(theme.resolved).toBe('dark');
  });

  it('system resolves to light when matchMedia is unavailable (SSR posture)', () => {
    vi.stubGlobal('matchMedia', undefined);
    theme.set('system');
    expect(theme.resolved).toBe('light');
  });
});

describe('THEME_BOOT_SCRIPT — the no-FOUC pre-paint contract', () => {
  // Vitest runs from web/ (import.meta.url is not a file: URL under jsdom).
  const appHtml = (): string => readFileSync(resolve(process.cwd(), 'src/app.html'), 'utf8');
  const inlineScripts = (): string[] =>
    [...appHtml().matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

  it('is inlined byte-identically in src/app.html, inside <head>, before %sveltekit.head%', () => {
    const html = appHtml();
    expect(inlineScripts()).toContain(THEME_BOOT_SCRIPT);
    const scriptAt = html.indexOf(THEME_BOOT_SCRIPT);
    expect(scriptAt).toBeGreaterThan(html.indexOf('<head>'));
    expect(scriptAt).toBeLessThan(html.indexOf('%sveltekit.head%'));
  });

  it('references the same storage keys, path segment and attribute the module uses', () => {
    expect(THEME_BOOT_SCRIPT).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(THEME_BOOT_SCRIPT).toContain(`'${ADMIN_THEME_STORAGE_KEY}'`);
    expect(THEME_BOOT_SCRIPT).toContain(`'${ADMIN_PATH_SEGMENT}'`);
    expect(THEME_BOOT_SCRIPT).toContain(`'${THEME_ATTR}'`);
  });

  it('applies a stored forced theme before any bundle runs', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runBootScript();
    expect(painted()).toBe('dark');
  });

  it('leaves the attribute alone for system / garbage / missing values', () => {
    for (const value of [null, 'system', 'auto', '']) {
      root().removeAttribute(THEME_ATTR);
      if (value === null) localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, value);
      runBootScript();
      expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    }
  });

  it('swallows a storage exception', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => runBootScript()).not.toThrow();
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it('agrees with initTheme(): boot paints what init then reports', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runBootScript();
    const before = painted();
    expect(initTheme()).toBe(before);
    expect(painted()).toBe(before);
  });

  it.each(ADMIN_PATHS)('on %s it reads the admin key and ignores the public one', (path) => {
    visit(path);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    runBootScript();
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);

    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'light');
    runBootScript();
    expect(painted()).toBe('light');
  });

  it.each(PUBLIC_PATHS)('on %s it reads the public key and ignores the admin one', (path) => {
    visit(path);
    localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'dark');
    runBootScript();
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);

    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runBootScript();
    expect(painted()).toBe('light');
  });

  it.each([...ADMIN_PATHS, ...PUBLIC_PATHS])(
    'on %s the boot script and applyThemeFor() paint the same thing',
    (path) => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      localStorage.setItem(ADMIN_THEME_STORAGE_KEY, 'light');
      visit(path);
      root().removeAttribute(THEME_ATTR);
      runBootScript();
      const before = painted();
      applyThemeFor(path);
      expect(painted()).toBe(before);
      expect(theme.current).toBe(before);
    },
  );
});
