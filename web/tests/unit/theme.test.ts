// S11 — theme.svelte.ts state transitions under jsdom (localStorage +
// <html data-theme>) and the no-FOUC boot script contract with app.html.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_ATTR,
  THEME_BOOT_SCRIPT,
  THEME_STORAGE_KEY,
  THEMES,
  initTheme,
  isTheme,
  theme,
} from '$lib/theme.svelte';

const root = () => document.documentElement;

function mockMatchMedia(dark: boolean) {
  const mql = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return mql;
}

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute(THEME_ATTR);
  theme.set('system');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme — constants', () => {
  it('exposes the three modes and the storage contract', () => {
    expect(THEMES).toEqual(['light', 'dark', 'system']);
    expect(DEFAULT_THEME).toBe('system');
    expect(THEME_STORAGE_KEY).toBe('ird.theme');
    expect(THEME_ATTR).toBe('data-theme');
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

describe('theme.set — attribute + persistence', () => {
  it('starts as system with no attribute and nothing stored', () => {
    expect(theme.current).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('dark → sets data-theme="dark" and persists', () => {
    theme.set('dark');
    expect(theme.current).toBe('dark');
    expect(root().getAttribute(THEME_ATTR)).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('light → sets data-theme="light" and persists', () => {
    theme.set('light');
    expect(theme.current).toBe('light');
    expect(root().getAttribute(THEME_ATTR)).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('dark → light → system walks the attribute through every state', () => {
    theme.set('dark');
    expect(root().getAttribute(THEME_ATTR)).toBe('dark');
    theme.set('light');
    expect(root().getAttribute(THEME_ATTR)).toBe('light');
    theme.set('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(theme.current).toBe('system');
  });

  it('an invalid value at runtime falls back to system instead of throwing', () => {
    theme.set('dark');
    theme.set('neon' as never);
    expect(theme.current).toBe('system');
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('still applies the attribute when localStorage throws (private mode / blocked)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => theme.set('dark')).not.toThrow();
    expect(root().getAttribute(THEME_ATTR)).toBe('dark');
    expect(() => theme.set('system')).not.toThrow();
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });
});

describe('initTheme — reading the persisted preference', () => {
  it('applies a stored dark preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(initTheme()).toBe('dark');
    expect(theme.current).toBe('dark');
    expect(root().getAttribute(THEME_ATTR)).toBe('dark');
  });

  it('applies a stored light preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(initTheme()).toBe('light');
    expect(root().getAttribute(THEME_ATTR)).toBe('light');
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
  const bootScript = (): string => {
    const m = appHtml().match(/<script>([\s\S]*?)<\/script>/);
    return m ? m[1] : '';
  };

  it('is inlined byte-identically in src/app.html, inside <head>, before %sveltekit.head%', () => {
    const html = appHtml();
    expect(bootScript()).toBe(THEME_BOOT_SCRIPT);
    const scriptAt = html.indexOf(THEME_BOOT_SCRIPT);
    expect(scriptAt).toBeGreaterThan(html.indexOf('<head>'));
    expect(scriptAt).toBeLessThan(html.indexOf('%sveltekit.head%'));
  });

  it('references the same storage key and attribute the module uses', () => {
    expect(THEME_BOOT_SCRIPT).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(THEME_BOOT_SCRIPT).toContain(`'${THEME_ATTR}'`);
  });

  it('applies a stored forced theme before any bundle runs', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    new Function(THEME_BOOT_SCRIPT)();
    expect(root().getAttribute(THEME_ATTR)).toBe('dark');
  });

  it('leaves the attribute alone for system / garbage / missing values', () => {
    for (const value of [null, 'system', 'auto', '']) {
      root().removeAttribute(THEME_ATTR);
      if (value === null) localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, value);
      new Function(THEME_BOOT_SCRIPT)();
      expect(root().hasAttribute(THEME_ATTR)).toBe(false);
    }
  });

  it('swallows a storage exception', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => new Function(THEME_BOOT_SCRIPT)()).not.toThrow();
    expect(root().hasAttribute(THEME_ATTR)).toBe(false);
  });

  it('agrees with initTheme(): boot paints what init then reports', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    new Function(THEME_BOOT_SCRIPT)();
    const painted = root().getAttribute(THEME_ATTR);
    expect(initTheme()).toBe(painted);
    expect(root().getAttribute(THEME_ATTR)).toBe(painted);
  });
});
