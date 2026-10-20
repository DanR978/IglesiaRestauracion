/* ============================================================================
 * web/playwright.integration.config.ts — the admin against a real Supabase (D-039)
 * ----------------------------------------------------------------------------
 * The second, isolated Playwright suite (plan "Verification"): where the
 * mocked suite (playwright.config.ts) answers every Supabase call in-process,
 * this one builds the app against the LOCAL stack (`supabase start`) and
 * signs in for real — GoTrue's passwords, TOTP, invitation and recovery
 * emails (read from Mailpit), PostgREST's RLS with the aal2 layer and the
 * tiers (20261019000001), the admin-invite Edge Function. Synthetic accounts
 * only, made and removed by each test (tests/integration/helpers/stack.ts).
 *
 *   build    PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY = this stack's,
 *            as `supabase status -o env` prints them (never a secret: the
 *            URL must be loopback, helpers/stack.ts refuses anything else),
 *            at BASE_PATH=/app — the base production serves the app at
 *   serve    `vite preview` on a port of its own (INTEGRATION_PORT, default
 *            4193 — WebKit refuses some "bad ports" such as 4190), never a
 *            server this run did not build (reuseExistingServer: false)
 *   run      Chromium only, one worker: every test shares one database and
 *            one Mailpit, and some move a browser's clock
 *
 * Kit builds into the same .svelte-kit/ and build/ as the mocked suite (the
 * output directory is fixed in vite.config.ts), so the two suites take turns
 * in one checkout; in CI each has its own job (ci.yml e2e, db.yml).
 *
 * totp.spec.ts checks the suite's authenticator against the RFC vectors as a
 * project of its own; the browser specs depend on it.
 *
 * Usage (from web/, with the stack running):
 *   npm run test:integration
 *   npm run test:integration -- tests/integration/sign-in.spec.ts
 *   INTEGRATION_PORT=4195 npm run test:integration   # another worktree at the same time
 * ========================================================================== */
import { defineConfig, devices } from '@playwright/test';
import {
  BASE_PATH,
  INTEGRATION_ORIGIN,
  INTEGRATION_PORT,
  localStack,
} from './tests/integration/helpers/stack';

const { apiUrl, anonKey } = localStack();
const VECTORS = /totp\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/integration',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // A real stack answers in real time; one retry in CI absorbs runner noise
  // (a test that passes only on the retry is still reported as flaky).
  retries: process.env.CI ? 1 : 0,
  // Sign-ins, emails and TOTP steps are real round trips.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  webServer: {
    command: `npm run build && npm run preview -- --port ${INTEGRATION_PORT} --strictPort`,
    url: `${INTEGRATION_ORIGIN}${BASE_PATH}/admin/acceso/`,
    reuseExistingServer: false,
    timeout: 240_000,
    // Merged over process.env: only the public URL and anon key reach the build.
    env: {
      PUBLIC_SUPABASE_URL: apiUrl,
      PUBLIC_SUPABASE_ANON_KEY: anonKey,
      BASE_PATH,
    },
  },
  use: { baseURL: INTEGRATION_ORIGIN, trace: 'retain-on-failure' },
  projects: [
    { name: 'totp-vectors', testMatch: VECTORS },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: VECTORS,
      dependencies: ['totp-vectors'],
    },
  ],
});
