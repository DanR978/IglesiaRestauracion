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
 * Usage:
 *   npx playwright install chromium webkit   # once
 *   npm run test:e2e                         # all four projects
 *   npx playwright test --project=webkit tests/e2e/kit-modal.spec.ts
 * ========================================================================== */
import { defineConfig, devices } from '@playwright/test';

const PERF_SPEC = /perf\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  // One retry in CI absorbs runner noise; a test that passes only on the
  // retry is still reported as flaky.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    // Never test a server this run did not build: a preview left on 4173 (an
    // older build, another worktree) would be reused silently. A busy port
    // fails the run instead.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: PERF_SPEC },
    { name: 'Mobile Safari', use: { ...devices['iPhone 15'] }, testIgnore: PERF_SPEC },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 7'] }, testIgnore: PERF_SPEC },
  ],
});
