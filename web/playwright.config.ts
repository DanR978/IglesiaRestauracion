/* ============================================================================
 * web/playwright.config.ts — the end-to-end gate (VERIFICATION boxes 7, 14, 15, 17)
 * ----------------------------------------------------------------------------
 * Every spec runs against the BUILT app, served by `vite preview` at base ''.
 * Specs address pages by root paths (`/kit/button/`), so this build must not
 * use BASE_PATH (G-019: without it preview serves at `/`). The /app build is
 * what the CI `web` job ships and what `npm run budget` measures.
 *
 * Four engines/profiles (box 14; D-030 "WebKit runs in CI"):
 *   chromium       desktop Chrome
 *   webkit         desktop Safari's engine
 *   Mobile Safari  iPhone descriptor — WebKit, touch, 393px
 *   Mobile Chrome  Pixel descriptor — Chromium, touch, 412px
 * perf.spec.ts (lab LCP/CLS, box 17) throttles through Chromium's DevTools
 * protocol, so it runs in the `chromium` project only.
 *
 * The build inside webServer needs the PUBLIC_* values: web/.env locally (see
 * .env.example), loopback placeholders in CI. No spec reaches production.
 *
 * S39: the e2e build's Supabase is the preview itself, under /__supabase
 * (PUBLIC_SUPABASE_URL below, overriding web/.env and CI for this build
 * only). The sign-in pages call Supabase as soon as they open, so a spec
 * answers that path in-process (helpers/supabase.ts → page.route), and
 * anything left unanswered gets the preview's own 404 — no spec can reach a
 * real backend, the local stack included, and the network guard still
 * allows only the preview origin and the pinned CDN.
 *
 * Usage:
 *   npx playwright install chromium webkit   # once
 *   npm run test:e2e                         # all four projects
 *   npx playwright test --project=webkit tests/e2e/kit-modal.spec.ts
 *   E2E_PORT=4181 npx playwright test …      # a second worktree in parallel; WebKit
 *                                            # refuses the Fetch "bad ports" (e.g. 4190)
 * ========================================================================== */
import { defineConfig, devices } from '@playwright/test';
import { E2E_ORIGIN, E2E_PORT, SUPABASE_URL } from './tests/e2e/helpers/supabase';

const PERF_SPEC = /perf\.spec\.ts$/;
// Two worktrees can run the suite at once on different ports (E2E_PORT).
const PORT = E2E_PORT;
const ORIGIN = E2E_ORIGIN;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  // One retry in CI absorbs runner noise; a test that passes only on the
  // retry is still reported as flaky.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    // Never test a server this run did not build: a preview left on the port (an
    // older build, another worktree) would be reused silently. A busy port
    // fails the run instead.
    reuseExistingServer: false,
    timeout: 180_000,
    // Merged over process.env: the anon key still comes from web/.env or CI.
    env: { PUBLIC_SUPABASE_URL: SUPABASE_URL },
  },
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: PERF_SPEC },
    { name: 'Mobile Safari', use: { ...devices['iPhone 15'] }, testIgnore: PERF_SPEC },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, testIgnore: PERF_SPEC },
  ],
});
