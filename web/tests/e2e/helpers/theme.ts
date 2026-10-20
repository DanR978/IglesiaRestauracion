/* ============================================================================
 * web/tests/e2e/helpers/theme.ts — open a page with a theme already forced
 * ----------------------------------------------------------------------------
 * Setting data-theme right after page.goto() races hydration: the root
 * layout re-applies the STORED preference once it mounts (applyThemeFor),
 * and no stored preference means 'system', which removes the attribute.
 * WebKit often hydrates after the `load` event goto() waits for, so a forced
 * dark check could read the light palette there. Storing the preference
 * before the page loads makes the app.html boot script and the layout agree
 * (a11y.spec.ts forces a theme the same way; kit-toast.spec.ts stores it).
 *
 * It is stored under BOTH surfaces' keys (D-038): an admin page reads only the
 * admin's, a public page only D-022's, so one helper serves every route.
 *
 * Switching data-theme later in a test, once the page has hydrated, is safe.
 *
 * Usage:
 *   import { gotoWithTheme } from './helpers/theme';
 *   await gotoWithTheme(page, '/kit/card/', 'dark');
 * ========================================================================== */
import { expect, type Page } from '@playwright/test';

/**
 * #lib/theme.svelte.ts THEME_STORAGE_KEYS — public (D-022) and admin (D-038);
 * that module needs the Svelte compiler.
 */
export const THEME_STORAGE_KEYS = ['ird.theme', 'ird.app.admin.theme'] as const;

/** Navigate to `path` with `theme` stored and painted before the app boots. */
export async function gotoWithTheme(
  page: Page,
  path: string,
  theme: 'light' | 'dark',
): Promise<void> {
  await page.addInitScript(
    ({ keys, value }) => {
      try {
        for (const key of keys) localStorage.setItem(key, value);
      } catch {
        // Storage refused: the data-theme assertion below fails loudly instead.
      }
    },
    { keys: THEME_STORAGE_KEYS, value: theme },
  );
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
