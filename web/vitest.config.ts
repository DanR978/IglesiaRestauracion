import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Enough for pure-logic tests; modules importing $env/$app belong in
    // component/e2e tests, not here.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    // G-001: sanitize-html (S07) uses DOMParser — the suite MUST run under
    // jsdom, never plain node.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
