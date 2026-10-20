/* ============================================================================
 * web/tests/e2e/helpers/theme.ts — open a page with a theme already forced
 * ----------------------------------------------------------------------------
 * Setting data-theme right after page.goto() races hydration: the root
 * layout's onMount runs initTheme(), which re-applies the STORED preference,
 * and no stored preference means 'system', which removes the attribute.
 * WebKit often hydrates after the `load` event goto() waits for, so a forced
 * dark check could read the light palette there. Storing the preference
 * before the page loads makes the app.html boot script and initTheme() agree
 * (a11y.spec.ts and kit-toast.spec.ts force a theme the same way).
 *
 * Switching data-theme later in a test, once the page has hydrated, is safe.
 *
 * Usage:
 *   import { gotoWithTheme } from './helpers/theme';
 *   await gotoWithTheme(page, '/kit/card/', 'dark');
 * ========================================================================== */
import { expect, type Page } from '@playwright/test';

/** #lib/theme.svelte.ts THEME_STORAGE_KEY (D-022); that module needs the Svelte compiler. */
const THEME_STORAGE_KEY = 'ird.theme';

/** Navigate to `path` with `theme` stored and painted before the app boots. */
export async function gotoWithTheme(
  page: Page,
  path: string,
  theme: 'light' | 'dark',
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // Storage refused: the data-theme assertion below fails loudly instead.
      }
    },
    { key: THEME_STORAGE_KEY, value: theme },
  );
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
