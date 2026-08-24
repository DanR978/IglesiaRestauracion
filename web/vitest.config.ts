import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // S11: runes modules (`*.svelte.ts`, e.g. $lib/theme.svelte.ts) need the
  // Svelte compiler at test time (it reads svelte.config.js for preprocess).
  plugins: [svelte()],
  resolve: {
    // Svelte's package exports a server build by default under Node; the
    // `browser` condition picks the client runtime so runes state and
    // svelte/reactivity (MediaQuery) behave as in the page, under jsdom.
    conditions: ['browser'],
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
