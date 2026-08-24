import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // $lib plus stubs for the SvelteKit virtual modules, so unit tests can
    // import config/client without a svelte-kit sync'd environment. The stubs
    // report browser=false — the prerender posture client.ts must be safe under.
    alias: {
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      '$env/static/public': fileURLToPath(new URL('./tests/stubs/env-public.ts', import.meta.url)),
      '$app/environment': fileURLToPath(
        new URL('./tests/stubs/app-environment.ts', import.meta.url),
      ),
    },
  },
  test: {
    // G-001: sanitize-html (S07) uses DOMParser — the suite MUST run under
    // jsdom, never plain node.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
