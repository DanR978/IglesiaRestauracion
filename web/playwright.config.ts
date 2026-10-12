import { defineConfig } from '@playwright/test';

// E2e smoke against the built app served by `vite preview` at base '' (no
// BASE_PATH — G-019: preview without BASE_PATH serves at `/`). The build
// inside webServer needs web/.env populated (see .env.example).
// Not part of the CI gate (S05 gates check+lint+test+build); run locally
// with `npm run test:e2e` after `npx playwright install chromium`.
export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: 'http://localhost:4173' },
});
