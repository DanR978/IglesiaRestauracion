/* ============================================================================
 * web/playwright.app.config.ts — the admin at the deployed base path, /app
 * ----------------------------------------------------------------------------
 * playwright.config.ts builds at base '' so its specs can address pages by
 * root paths. The site is deployed under /app (D-008), so this config builds
 * at BASE_PATH=/app, previews it on its own port and runs tests/e2e-app/ —
 * the subset that proves base-path routing: the guard's redirects and `next`,
 * the sign-in → Inicio hand-off, ROUTES in the nav, the legacy panel link to
 * the site-root /admin/, the OAuth callback address, the logout notice, each
 * with zero CSP violations — plus the build checks (build-head.spec.ts) on
 * this build's HTML. Same mocked Supabase as the main suite (the preview
 * itself under /__supabase, answered by page.route): nothing reaches a
 * backend. All four projects; build-head runs in `chromium` only.
 *
 * It builds into the same build/ and .svelte-kit/ as the main suite: run the
 * two one after the other, never at once.
 *
 * Usage:
 *   npx playwright test -c playwright.app.config.ts
 *   E2E_APP_PORT=4192 npx playwright test -c playwright.app.config.ts   # beside another preview
 * ========================================================================== */
import { defineConfig, devices } from '@playwright/test';
import { APP_ORIGIN, APP_PORT, APP_SUPABASE_URL, BASE } from './tests/e2e-app/app-base';

const BUILD_CHECKS = /build-head\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests',
  testMatch: ['e2e-app/**/*.spec.ts', 'e2e/build-head.spec.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  webServer: {
    command: `npm run build && npm run preview -- --port ${APP_PORT} --strictPort`,
    port: APP_PORT,
    reuseExistingServer: false,
    timeout: 180_000,
    // Merged over process.env; MSYS_NO_PATHCONV keeps Git Bash from rewriting /app (G-019).
    env: { BASE_PATH: BASE, PUBLIC_SUPABASE_URL: APP_SUPABASE_URL, MSYS_NO_PATHCONV: '1' },
  },
  use: { baseURL: `${APP_ORIGIN}${BASE}/`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: BUILD_CHECKS },
    { name: 'Mobile Safari', use: { ...devices['iPhone 15'] }, testIgnore: BUILD_CHECKS },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, testIgnore: BUILD_CHECKS },
  ],
});
