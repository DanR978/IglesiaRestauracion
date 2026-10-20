/* ============================================================================
 * web/tests/e2e-app/app-base.ts — where the /app run serves the app
 * ----------------------------------------------------------------------------
 * playwright.app.config.ts builds at BASE_PATH=/app — the base the site is
 * deployed at (D-008) — and previews it on its own port, with the same
 * same-origin mocked Supabase as the main suite (/__supabase on the preview,
 * answered by page.route; never a backend). Specs open pages relative to the
 * baseURL (`admin/`, never `/admin/`, which would drop the base) and assert
 * on full paths through `under()`.
 *
 * Usage:
 *   import { BASE, under } from './app-base';
 *   await page.goto('admin/cuenta/');
 *   await expect(page).toHaveURL(under('admin/acceso/'));
 * ========================================================================== */

/** The deployed base path (D-008). */
export const BASE = '/app';

/** A second preview next to the main suite's (E2E_PORT): WebKit refuses the Fetch "bad ports" (e.g. 4190). */
export const APP_PORT = Number(process.env.E2E_APP_PORT) || 4175;
export const APP_ORIGIN = `http://localhost:${APP_PORT}`;

/** The build's PUBLIC_SUPABASE_URL: the preview itself, outside the base, answered by mocks. */
export const APP_SUPABASE_URL = `${APP_ORIGIN}/__supabase`;

/** `admin/acceso/` → `/app/admin/acceso/` (a path under the base). */
export const under = (path: string): string => `${BASE}/${path}`;
